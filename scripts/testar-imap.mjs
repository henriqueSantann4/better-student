#!/usr/bin/env node
/**
 * Fase 0: teste do e-mail institucional por IMAP com SENHA DE APP.
 *
 * A senha de app é uma senha de 16 letras que o Google gera para programas de
 * e-mail (em myaccount.google.com/apppasswords). Ela só existe se a
 * instituição permitir; este script descobre se funciona.
 *
 * Uso:
 *   pnpm testar:imap
 *
 * Privacidade:
 *   - A senha é digitada sem aparecer na tela, só vive na memória e nunca é
 *     escrita na saída (nem nas mensagens de erro).
 *   - A caixa é aberta em modo SOMENTE LEITURA (EXAMINE): nada é marcado como
 *     lido, movido ou apagado.
 *   - A saída mostra só contagens, nomes de pastas e domínios de remetentes.
 *
 * Sem dependências: o IMAP é um protocolo de texto sobre TLS (node:tls).
 */
import { isIP } from "node:net";
import { connect } from "node:tls";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";

// O pnpm 10 repassa o "--" de "pnpm script -- --opcao"; ele sai daqui.
const argumentos = process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--"));
const { values: opcoes } = parseArgs({
  args: argumentos,
  options: {
    servidor: { type: "string", default: "imap.gmail.com" },
    porta: { type: "string", default: "993" },
    // Só para testar o próprio script contra um servidor falso com certificado próprio.
    inseguro: { type: "boolean", default: false },
  },
});

// ---------------------------------------------------------------------------
// Entrada do e-mail e da senha (a senha não aparece enquanto é digitada)
// ---------------------------------------------------------------------------

let silenciar = false;
const saidaControlada = new Writable({
  write(pedaco, _codificacao, pronto) {
    if (!silenciar) process.stdout.write(pedaco);
    pronto();
  },
});

async function pedirCredenciais() {
  const rl = createInterface({ input: process.stdin, output: saidaControlada, terminal: Boolean(process.stdin.isTTY) });
  const linhas = rl[Symbol.asyncIterator]();
  process.stdout.write("E-mail institucional: ");
  const usuario = String((await linhas.next()).value ?? "").trim();
  process.stdout.write("Senha de app, 16 letras (não aparece enquanto você digita): ");
  silenciar = true;
  // O Google mostra a senha em grupos ("abcd efgh ijkl mnop"); os espaços não fazem parte dela.
  const senha = String((await linhas.next()).value ?? "").replace(/\s+/g, "");
  silenciar = false;
  process.stdout.write("\n");
  rl.close();
  return { usuario, senha };
}

// ---------------------------------------------------------------------------
// Cliente IMAP mínimo
// ---------------------------------------------------------------------------

/** Põe um texto entre aspas no formato do IMAP (escapando \ e "). */
function aspas(texto) {
  return `"${texto.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function abrirConexao() {
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: opcoes.servidor,
      port: Number(opcoes.porta),
      // O nome do servidor vai no TLS (SNI) só quando é um nome, não um IP.
      servername: isIP(opcoes.servidor) ? undefined : opcoes.servidor,
      rejectUnauthorized: !opcoes.inseguro,
    });
    let buffer = "";
    let espera = null; // { tag, resolve, reject }
    let saudacao = true;

    socket.setEncoding("utf8");
    socket.setTimeout(30_000, () => socket.destroy(new Error("o servidor não respondeu a tempo")));
    socket.on("error", (erro) => (espera ? espera.reject(erro) : reject(erro)));
    socket.on("data", (dados) => {
      buffer += dados;
      if (saudacao) {
        const fim = buffer.indexOf("\r\n");
        if (fim < 0) return;
        const linha = buffer.slice(0, fim);
        buffer = buffer.slice(fim + 2);
        saudacao = false;
        if (/^\* (OK|PREAUTH)/i.test(linha)) resolve(cliente);
        else reject(new Error(`saudação inesperada: ${linha}`));
        return;
      }
      if (!espera) return;
      // A resposta termina na linha que começa com a etiqueta do comando.
      const final = new RegExp(`(^|\\r\\n)${espera.tag} (OK|NO|BAD)([^\\r\\n]*)\\r\\n`).exec(buffer);
      if (!final) return;
      const fimResposta = final.index + final[0].length;
      const corpo = buffer.slice(0, final.index);
      buffer = buffer.slice(fimResposta);
      const atual = espera;
      espera = null;
      if (final[2].toUpperCase() === "OK") atual.resolve(corpo);
      else atual.reject(new Error(final[3].trim() || final[2]));
    });

    let contador = 0;
    const cliente = {
      /** Envia um comando e devolve as linhas "não etiquetadas" da resposta. */
      comando(texto) {
        const tag = `A${String(++contador).padStart(3, "0")}`;
        return new Promise((ok, falha) => {
          espera = { tag, resolve: ok, reject: falha };
          socket.write(`${tag} ${texto}\r\n`);
        });
      },
      fechar() {
        socket.end();
      },
    };
  });
}

/** Explica os erros mais prováveis em português (sem nunca repetir a senha). */
function explicar(mensagem) {
  if (/application-specific password required/i.test(mensagem)) {
    return "O Google pediu uma SENHA DE APP: parece que foi usada a senha normal da conta. Gere uma em myaccount.google.com/apppasswords (com a conta institucional).";
  }
  if (/AUTHENTICATIONFAILED|Invalid credentials/i.test(mensagem)) {
    return "Usuário ou senha de app recusados. Confira o e-mail completo e as 16 letras da senha de app (sem espaços). Se o IFSP não permitir senhas de app, este é o erro que aparece.";
  }
  if (/web login required|WEBALERT|ALERT/i.test(mensagem)) {
    return "O Google exige um login pelo navegador antes. Entre na conta institucional pelo navegador e tente de novo.";
  }
  if (/IMAP access is disabled|IMAP.*(desativ|disabled)/i.test(mensagem)) {
    return "O acesso IMAP está desativado na conta (ou pelo administrador do IFSP).";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|não respondeu/i.test(mensagem)) {
    return "Não consegui falar com o servidor do Gmail. Confira a internet (ou se a rede bloqueia a porta 993).";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

console.log(`Teste do e-mail por IMAP (${opcoes.servidor}), somente leitura. Nada é gravado.\n`);
const { usuario, senha } = await pedirCredenciais();
if (!usuario || !senha) {
  console.error("E-mail e senha de app são obrigatórios.");
  process.exit(1);
}

let imap;
try {
  imap = await abrirConexao();
  // LOGIN com a senha entre aspas. A senha nunca vai para a saída.
  await imap.comando(`LOGIN ${aspas(usuario)} ${aspas(senha)}`);
  console.log("\n✔ Login aceito: o IFSP permite IMAP com senha de app.");

  const pastas = await imap.comando('LIST "" "*"');
  const nomes = [...pastas.matchAll(/^\* LIST \(([^)]*)\) "[^"]*" (.+)$/gm)].map((m) => ({
    marcas: m[1],
    nome: m[2].replace(/^"|"$/g, ""),
  }));
  const especiais = nomes.filter((p) => /\\(All|Sent|Drafts|Trash|Junk|Important|Flagged)/i.test(p.marcas));
  console.log(`✔ ${nomes.length} pastas (${especiais.length} especiais do Gmail)`);

  // EXAMINE = abrir só para leitura (SELECT marcaria mensagens como lidas ao abrir).
  const caixa = await imap.comando("EXAMINE INBOX");
  const total = Number(/^\* (\d+) EXISTS/im.exec(caixa)?.[1] ?? 0);
  console.log(`✔ Caixa de entrada: ${total} mensagens`);

  const naoLidas = await imap.comando("SEARCH UNSEEN");
  const qtdNaoLidas = (/^\* SEARCH ?(.*)$/im.exec(naoLidas)?.[1] ?? "").trim().split(/\s+/).filter(Boolean).length;
  console.log(`✔ Não lidas: ${qtdNaoLidas}`);

  if (total > 0) {
    const inicio = Math.max(1, total - 19);
    // BODY.PEEK não marca como lido. Só o cabeçalho "From", para contar os domínios.
    const cabecalhos = await imap.comando(`FETCH ${inicio}:${total} (BODY.PEEK[HEADER.FIELDS (FROM)])`);
    const dominios = new Map();
    for (const [, dom] of cabecalhos.matchAll(/^From:[^\r\n]*@([^>\s\r\n]+)/gim)) {
      const d = dom.toLowerCase();
      dominios.set(d, (dominios.get(d) ?? 0) + 1);
    }
    console.log(`✔ Últimas ${total - inicio + 1} mensagens, domínios dos remetentes:`);
    console.log(`  ${[...dominios].map(([d, n]) => `${d} (${n})`).join(", ") || "nenhum"}`);
  }

  await imap.comando("LOGOUT").catch(() => undefined);
  console.log("\nFuncionou! Cole a saída a partir de \"Login aceito\" na conversa: não há conteúdo de e-mails nela.");
} catch (erro) {
  // A mensagem do servidor nunca contém a senha; mesmo assim, por garantia, ela é removida.
  const mensagem = String(erro?.message ?? erro).split(senha).join("***");
  console.error(`\n✖ ${mensagem}`);
  const dica = explicar(mensagem);
  if (dica) console.error(`\n${dica}`);
  process.exitCode = 1;
} finally {
  imap?.fechar();
}
