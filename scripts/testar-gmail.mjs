#!/usr/bin/env node
/**
 * Fase 0: teste de viabilidade do Gmail (e-mail institucional no Google Workspace).
 *
 * Faz o login pelo fluxo que o Google recomenda para apps de desktop
 * (OAuth 2.0 com endereço de retorno local + PKCE), consulta o Gmail SÓ PARA
 * LEITURA e mostra apenas contagens e estrutura, nunca o conteúdo.
 *
 * Uso:
 *   pnpm testar:gmail
 *   pnpm testar:gmail -- --credenciais caminho/para/client_secret.json
 *
 * Privacidade:
 *   - A senha é digitada na página do próprio Google, no seu navegador.
 *     Este script nunca a vê.
 *   - Permissão pedida: gmail.readonly (ler). Não dá para enviar nem apagar.
 *   - Nada é gravado em disco, e no fim o acesso é REVOGADO no Google.
 *   - A saída não mostra assuntos, nomes nem textos: só números, nomes de
 *     marcadores do sistema e domínios de remetentes (ex.: ifsp.edu.br).
 *
 * Não usa dependências: só o Node (fetch, http e crypto são nativos).
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";

// O pnpm 10 repassa o "--" de "pnpm script -- --opcao" para o script, e o
// parseArgs entende "--" como "acabaram as opções". Por isso ele sai daqui.
const argumentos = process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--"));

const { values: opcoes } = parseArgs({
  args: argumentos,
  options: {
    credenciais: { type: "string" },
    // Só para testar o próprio script contra um servidor falso local.
    "base-auth": { type: "string", default: "https://accounts.google.com" },
    "base-token": { type: "string", default: "https://oauth2.googleapis.com" },
    "base-gmail": { type: "string", default: "https://gmail.googleapis.com" },
    "sem-navegador": { type: "boolean", default: false },
    // Encaminhamento: entra com o Gmail pessoal e lê SÓ o que chegou do institucional.
    institucional: { type: "string" },
  },
});

const ESCOPO = "https://www.googleapis.com/auth/gmail.readonly";
const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// ---------------------------------------------------------------------------
// Credenciais do "cliente OAuth" (o arquivo baixado do Google Cloud)
// ---------------------------------------------------------------------------

function acharCredenciais() {
  if (opcoes.credenciais) return opcoes.credenciais;
  for (const pasta of [join(RAIZ, "amostras-privadas"), RAIZ]) {
    if (!existsSync(pasta)) continue;
    const arquivo = readdirSync(pasta).find((f) => /^client_secret.*\.json$/i.test(f));
    if (arquivo) return join(pasta, arquivo);
  }
  return null;
}

function lerCredenciais(caminho) {
  const dados = JSON.parse(readFileSync(caminho, "utf8"));
  // O Google entrega { installed: {...} } para clientes do tipo "App para computador".
  const cliente = dados.installed ?? dados.web;
  if (!cliente?.client_id) throw new Error("o arquivo não parece um cliente OAuth do Google");
  if (!dados.installed) {
    console.warn("Aviso: o cliente não é do tipo \"App para computador\". Crie um desse tipo.");
  }
  return { id: cliente.client_id, segredo: cliente.client_secret ?? "" };
}

// ---------------------------------------------------------------------------
// PKCE: o app prova ao Google que é ele mesmo quem troca o código pelo token
// ---------------------------------------------------------------------------

const base64url = (bytes) => Buffer.from(bytes).toString("base64url");
const verificador = base64url(randomBytes(32));
const desafio = base64url(createHash("sha256").update(verificador).digest());
const estado = base64url(randomBytes(16)); // protege contra respostas forjadas

function abrirNoNavegador(url) {
  if (opcoes["sem-navegador"]) return;
  // No Windows, o rundll32 abre a URL inteira (o "start" do cmd quebra no "&").
  const [comando, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : [process.platform === "darwin" ? "open" : "xdg-open", [url]];
  spawn(comando, args, { stdio: "ignore", detached: true }).unref();
}

/**
 * Sobe um servidor local temporário (só no 127.0.0.1, porta escolhida pelo
 * sistema) e devolve a porta e uma promessa com o código que o Google manda
 * de volta depois do login.
 */
async function iniciarRetorno() {
  let aoReceber;
  let aoFalhar;
  const codigo = new Promise((resolve, reject) => {
    aoReceber = resolve;
    aoFalhar = reject;
  });
  const resolve = (valor) => aoReceber(valor);
  const reject = (erro) => aoFalhar(erro);
  {
    const servidor = createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }
      const erro = url.searchParams.get("error");
      const ok = !erro && url.searchParams.get("state") === estado && url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Better Student</title>` +
          `<body style="font-family:system-ui;padding:40px">` +
          (ok
            ? "<h2>Pronto!</h2><p>Pode fechar esta aba e voltar ao terminal.</p>"
            : `<h2>Não deu certo</h2><p>Veja a mensagem no terminal.</p>`) +
          `</body>`,
      );
      servidor.close();
      if (erro) reject(new Error(`o Google recusou: ${erro}`));
      else if (url.searchParams.get("state") !== estado) reject(new Error("resposta com estado inválido"));
      else resolve(url.searchParams.get("code"));
    });
    // Porta 0 = o sistema escolhe uma livre. Só escuta no próprio computador.
    await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
    setTimeout(() => {
      servidor.close();
      reject(new Error("tempo esgotado (5 minutos) esperando o login"));
    }, 5 * 60_000).unref();
    return { porta: servidor.address().port, codigo };
  }
}

async function postarFormulario(url, campos) {
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(campos),
    signal: AbortSignal.timeout(20_000),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`${corpo.error ?? resposta.status}: ${corpo.error_description ?? ""}`);
  return corpo;
}

async function gmail(caminho, token) {
  const resposta = await fetch(`${opcoes["base-gmail"]}/gmail/v1/users/me/${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`Gmail ${resposta.status}: ${corpo.error?.message ?? ""}`);
  return corpo;
}

/** Explica os erros mais prováveis em português. */
function explicar(mensagem) {
  if (/admin_policy_enforced|org_internal|disallowed_useragent/i.test(mensagem)) {
    return "O administrador do Workspace do IFSP bloqueou o acesso de apps não verificados. Essa é a resposta da questão em aberto 5: pelo Gmail API não vai dar, e a alternativa seria IMAP com senha de app (se a instituição permitir).";
  }
  if (/access_denied/i.test(mensagem)) {
    return "O acesso foi negado. Se você clicou em \"Cancelar\", rode de novo. Se apareceu \"app bloqueado\", confira se o seu e-mail está em \"Usuários de teste\" no Google Cloud.";
  }
  if (/invalid_client|unauthorized_client/i.test(mensagem)) {
    return "O cliente OAuth não foi aceito. Baixe de novo o JSON do cliente do tipo \"App para computador\".";
  }
  if (/Gmail 403/i.test(mensagem)) {
    return "O Gmail recusou: confira se a \"Gmail API\" está ATIVADA no projeto do Google Cloud.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

const caminho = acharCredenciais();
if (!caminho) {
  console.error("Não achei o arquivo do cliente OAuth (client_secret_....json).");
  console.error("Coloque-o na pasta amostras-privadas/ ou use --credenciais <arquivo>.");
  process.exit(1);
}
const cliente = lerCredenciais(caminho);
console.log("Teste do Gmail (somente leitura). Nada é gravado e o acesso é revogado no fim.\n");

let token;
try {
  const { porta, codigo: promessaCodigo } = await iniciarRetorno();
  const retorno = `http://127.0.0.1:${porta}`;
  const autorizacao = new URL(`${opcoes["base-auth"]}/o/oauth2/v2/auth`);
  autorizacao.search = new URLSearchParams({
    client_id: cliente.id,
    redirect_uri: retorno,
    response_type: "code",
    scope: ESCOPO,
    code_challenge: desafio,
    code_challenge_method: "S256",
    state: estado,
    prompt: "consent",
  }).toString();

  console.log("Abrindo a página de login do Google no seu navegador…");
  console.log("Se não abrir, copie este endereço no navegador:\n");
  console.log(`  ${autorizacao}\n`);
  abrirNoNavegador(autorizacao.toString());

  const codigo = await promessaCodigo;
  const resposta = await postarFormulario(`${opcoes["base-token"]}/token`, {
    code: codigo,
    client_id: cliente.id,
    client_secret: cliente.segredo,
    redirect_uri: retorno,
    grant_type: "authorization_code",
    code_verifier: verificador,
  });
  token = resposta.access_token;
  console.log(`✔ Login aceito. Permissões concedidas: ${resposta.scope}`);

  const perfil = await gmail("profile", token);
  const dominio = String(perfil.emailAddress ?? "").split("@")[1] ?? "?";
  console.log(`✔ Conta do domínio ${dominio}: ${perfil.messagesTotal} mensagens, ${perfil.threadsTotal} conversas`);

  const { labels = [] } = await gmail("labels", token);
  const sistema = labels.filter((l) => l.type === "system").map((l) => l.id).sort();
  console.log(`✔ ${labels.length} marcadores (${labels.length - sistema.length} criados por você)`);
  console.log(`  Do sistema: ${sistema.join(", ")}`);

  // Com --institucional, só as mensagens entregues àquele endereço (as
  // encaminhadas mantêm o "Delivered-To" original). O resto da conta pessoal
  // não é lido.
  const institucional = opcoes.institucional?.trim();
  const busca = institucional ? `deliveredto:${institucional}` : "in:inbox";
  if (institucional) {
    const total = await gmail(`messages?maxResults=500&q=${encodeURIComponent(busca)}`, token);
    const qtd = total.resultSizeEstimate ?? (total.messages ?? []).length;
    console.log(`✔ Mensagens encaminhadas do e-mail institucional: ${qtd}${total.nextPageToken ? " ou mais" : ""}`);
    if (qtd === 0) {
      console.log("  Nenhuma ainda. O encaminhamento só vale para e-mails que chegarem DEPOIS de ativado.");
    }
  }
  const lista = await gmail(`messages?maxResults=20&q=${encodeURIComponent(busca)}`, token);
  const ids = (lista.messages ?? []).map((m) => m.id);
  const dominios = new Map();
  const categorias = new Map();
  for (const id of ids) {
    const m = await gmail(`messages/${id}?format=metadata&metadataHeaders=From`, token);
    const de = m.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
    const dom = (/@([^>\s]+)/.exec(de)?.[1] ?? "?").toLowerCase();
    dominios.set(dom, (dominios.get(dom) ?? 0) + 1);
    for (const l of m.labelIds ?? []) if (l.startsWith("CATEGORY_")) categorias.set(l, (categorias.get(l) ?? 0) + 1);
  }
  console.log(`✔ Últimas ${ids.length} mensagens ${institucional ? "vindas do institucional" : "da caixa de entrada"}:`);
  console.log(`  Domínios dos remetentes: ${[...dominios].map(([d, n]) => `${d} (${n})`).join(", ") || "nenhum"}`);
  console.log(`  Categorias do Gmail: ${[...categorias].map(([c, n]) => `${c} (${n})`).join(", ") || "nenhuma (abas desativadas)"}`);
  console.log("\nFuncionou! Cole a saída a partir de \"Login aceito\" na conversa: não há conteúdo de e-mails nela.");
} catch (erro) {
  const mensagem = String(erro?.message ?? erro);
  console.error(`\n✖ ${mensagem}`);
  const dica = explicar(mensagem);
  if (dica) console.error(`\n${dica}`);
  process.exitCode = 1;
} finally {
  if (token) {
    // Revoga o acesso: o teste não deixa nenhuma permissão ativa para trás.
    await postarFormulario(`${opcoes["base-token"]}/revoke`, { token })
      .then(() => console.log("✔ Acesso revogado no Google."))
      .catch(() => console.log("Não consegui revogar sozinho: remova em myaccount.google.com → Segurança → Apps de terceiros."));
  }
}
