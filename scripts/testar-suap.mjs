#!/usr/bin/env node
/**
 * Fase 0: teste de viabilidade da API do SUAP.
 *
 * Descobre o que a API do SUAP da instituição expõe para um aluno, mostrando
 * só a ESTRUTURA das respostas (nomes de campos e tipos), nunca os valores.
 * A saída pode ser colada numa issue ou conversa sem expor dados pessoais.
 *
 * Uso:
 *   pnpm testar:suap
 *   pnpm testar:suap -- --servidor https://suap.ifsp.edu.br --ano 2026 --periodo 2
 *
 * Privacidade:
 *   - A senha é digitada sem aparecer na tela e só vive na memória deste
 *     processo. Nada é gravado em disco.
 *   - O script só faz requisições GET (leitura), e só para o servidor do SUAP.
 *   - Números longos (matrícula, IDs) são mascarados nos caminhos exibidos.
 *
 * Não usa nenhuma dependência: só o Node (fetch e readline são nativos).
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";

// O pnpm 10 repassa o "--" de "pnpm script -- --opcao" para o script, e o
// parseArgs entende "--" como "acabaram as opções". Por isso ele sai daqui.
const argumentos = process.argv.slice(2).filter((a, i) => !(i === 0 && a === "--"));

const { values: opcoes } = parseArgs({
  args: argumentos,
  options: {
    servidor: { type: "string", default: "https://suap.ifsp.edu.br" },
    ano: { type: "string" },
    periodo: { type: "string" },
    limite: { type: "string", default: "40" },
  },
});

const SERVIDOR = opcoes.servidor.replace(/\/+$/, "");
const hoje = new Date();
const ANO = opcoes.ano ?? String(hoje.getFullYear());
const PERIODO = opcoes.periodo ?? (hoje.getMonth() >= 6 ? "2" : "1");
const LIMITE = Number(opcoes.limite);

/**
 * Caminhos a testar. São PALPITES: os da API v2 clássica do SUAP e variações
 * que versões mais novas costumam usar. O script também segue os links que
 * aparecerem nas respostas (descoberta automática).
 */
const CANDIDATOS = [
  "/api/eu/",
  "/api/v2/minhas-informacoes/meus-dados/",
  "/api/v2/minhas-informacoes/meus-periodos-letivos/",
  `/api/v2/minhas-informacoes/boletim/${ANO}/${PERIODO}/`,
  `/api/v2/minhas-informacoes/turmas-virtuais/${ANO}/${PERIODO}/`,
  "/api/v2/minhas-informacoes/minhas-turmas-virtuais/",
  "/api/edu/meus-dados-aluno/",
  "/api/edu/periodos/",
  "/api/edu/meus-periodos-letivos/",
  `/api/edu/boletim/${ANO}/${PERIODO}/`,
  `/api/edu/turmas-virtuais/${ANO}/${PERIODO}/`,
  "/api/edu/aluno/",
  "/api/ensino/meus-dados-aluno/",
  "/api/ensino/periodos/",
  `/api/ensino/boletim/${ANO}/${PERIODO}/`,
  `/api/ensino/turmas-virtuais/${ANO}/${PERIODO}/`,
  // API nova (usada pela biblioteca suapy, 2025+):
  `/api/ensino/meu-boletim/${ANO}/${PERIODO}/`,
  "/api/ensino/meus-periodos-letivos/",
  "/api/ensino/meus-diarios/",
  `/api/ensino/minhas-turmas-virtuais/${ANO}/${PERIODO}/`,
  "/api/ensino/minhas-proximas-avaliacoes/",
  "/api/ensino/requisitos-conclusao/",
  "/api/comum/minhas-informacoes/",
  "/api/rh/eu/",
];

// ---------------------------------------------------------------------------
// Entrada da matrícula e da senha (a senha não aparece enquanto é digitada)
// ---------------------------------------------------------------------------

let silenciar = false;
const saidaControlada = new Writable({
  write(pedaco, _codificacao, pronto) {
    if (!silenciar) process.stdout.write(pedaco);
    pronto();
  },
});

async function pedirCredenciais() {
  // No terminal, o readline repete na tela o que é digitado; "silenciar"
  // desliga essa repetição durante a senha. Ler linha a linha (iterador)
  // também funciona quando a entrada vem de um pipe.
  const rl = createInterface({ input: process.stdin, output: saidaControlada, terminal: Boolean(process.stdin.isTTY) });
  const linhas = rl[Symbol.asyncIterator]();
  process.stdout.write("Matrícula: ");
  const usuario = String((await linhas.next()).value ?? "").trim();
  process.stdout.write("Senha (não aparece enquanto você digita): ");
  silenciar = true;
  const senha = String((await linhas.next()).value ?? "");
  silenciar = false;
  process.stdout.write("\n");
  rl.close();
  return { usuario, senha };
}

// ---------------------------------------------------------------------------
// Utilitários de privacidade: estrutura sem valores
// ---------------------------------------------------------------------------

/** Mascara números longos (matrícula, IDs) num caminho. */
function mascarar(caminho) {
  return caminho.replace(/\d{5,}/g, "<n>");
}

/** Descreve a estrutura de um valor JSON sem revelar o conteúdo. */
function estrutura(valor, profundidade = 0) {
  if (valor === null) return "null";
  if (Array.isArray(valor)) {
    if (valor.length === 0) return "[] (vazia)";
    if (profundidade > 4) return `[${valor.length} itens]`;
    return { [`lista de ${valor.length}, cada item`]: estrutura(valor[0], profundidade + 1) };
  }
  if (typeof valor === "object") {
    if (profundidade > 4) return `{${Object.keys(valor).length} campos}`;
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, estrutura(v, profundidade + 1)]));
  }
  if (typeof valor === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(valor)) return "data";
    if (/^(https?:\/\/|\/)/.test(valor)) return "link";
    return "texto";
  }
  return typeof valor === "number" ? "número" : typeof valor;
}

/** Procura caminhos da API dentro de uma resposta, para a descoberta automática. */
function linksDaApi(valor, achados = new Set()) {
  if (typeof valor === "string") {
    const url = valor.startsWith(SERVIDOR) ? valor.slice(SERVIDOR.length) : valor;
    if (/^\/api\/[\w\-/.]*$/.test(url)) achados.add(url.endsWith("/") ? url : `${url}/`);
  } else if (valor && typeof valor === "object") {
    for (const v of Object.values(valor)) linksDaApi(v, achados);
  }
  return achados;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function obterToken(usuario, senha) {
  const resposta = await fetch(`${SERVIDOR}/api/v2/autenticacao/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ username: usuario, password: senha }),
    signal: AbortSignal.timeout(20_000),
  });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const detalhe = corpo && typeof corpo === "object" ? JSON.stringify(corpo) : "(sem detalhes)";
    throw new Error(`Login recusado (HTTP ${resposta.status}): ${detalhe}`);
  }
  return {
    // Versões novas devolvem { access, refresh }; versões antigas, { token }.
    token: corpo?.access ?? corpo?.token,
    formato: Object.keys(corpo ?? {}).join(", "),
  };
}

async function buscar(caminho, cabecalhoAuth) {
  try {
    const resposta = await fetch(`${SERVIDOR}${caminho}`, {
      headers: { Authorization: cabecalhoAuth, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const tipo = resposta.headers.get("content-type") ?? "";
    const corpo = tipo.includes("json") ? await resposta.json().catch(() => null) : null;
    return { status: resposta.status, json: corpo };
  } catch (erro) {
    return { status: "erro", json: null, erro: String(erro?.message ?? erro) };
  }
}

/** Descobre se o servidor aceita "Bearer <token>" ou o formato antigo "JWT <token>". */
async function escolherCabecalho(token) {
  for (const prefixo of ["Bearer", "JWT"]) {
    const { status } = await buscar("/api/eu/", `${prefixo} ${token}`);
    if (status === 200) return `${prefixo} ${token}`;
  }
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

console.log(`Teste da API do SUAP em ${SERVIDOR} (período ${ANO}.${PERIODO})`);
console.log("Nada é gravado em disco. A saída mostra só a estrutura dos dados.\n");

const { usuario, senha } = await pedirCredenciais();
if (!usuario || !senha) {
  console.error("Matrícula e senha são obrigatórias.");
  process.exit(1);
}

let token;
try {
  const resultado = await obterToken(usuario, senha);
  token = resultado.token;
  console.log(`\nOK: Login aceito. Campos devolvidos pelo login: ${resultado.formato}`);
} catch (erro) {
  console.error(`\nERRO: ${erro.message}`);
  console.error("Se a senha estiver certa, o SUAP pode exigir login pelo gov.br ou outro método:");
  console.error("anote a mensagem acima, ela ajuda a decidir o próximo passo.");
  process.exit(1);
}
if (!token) {
  console.error("ERRO: O login não devolveu um token reconhecível.");
  process.exit(1);
}

const cabecalho = await escolherCabecalho(token);
console.log(`OK: Formato de autenticação: ${cabecalho.split(" ")[0]} <token>\n`);

const fila = [...CANDIDATOS];
const visitados = new Set();
const encontrados = [];

while (fila.length > 0 && visitados.size < LIMITE) {
  const caminho = fila.shift();
  if (visitados.has(caminho)) continue;
  visitados.add(caminho);

  const { status, json, erro } = await buscar(caminho, cabecalho);
  const descoberto = !CANDIDATOS.includes(caminho) ? "  (descoberto)" : "";
  console.log(`${String(status).padEnd(5)} ${mascarar(caminho)}${descoberto}${erro ? `  ${erro}` : ""}`);

  if (status === 200 && json !== null) {
    encontrados.push({ caminho: mascarar(caminho), estrutura: estrutura(json) });
    for (const link of linksDaApi(json)) if (!visitados.has(link)) fila.push(link);
  }
}

console.log("\n========== ESTRUTURA DOS ENDPOINTS QUE RESPONDERAM ==========\n");
for (const { caminho, estrutura: e } of encontrados) {
  console.log(`--- ${caminho}`);
  console.log(JSON.stringify(e, null, 2));
  console.log();
}
console.log(`${encontrados.length} endpoint(s) com dados, ${visitados.size} testado(s).`);
console.log("Pode copiar tudo a partir de \"Login aceito\" e colar na conversa: não há valores pessoais.");
