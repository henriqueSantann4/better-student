/**
 * Leitor do boletim do SUAP (página "Boletim" do aluno, salva ou copiada do
 * navegador). Não faz nenhuma requisição: só interpreta o HTML recebido.
 *
 * As colunas são achadas pelo TEXTO do cabeçalho, não pela posição. Assim,
 * cursos com 2 ou 4 etapas, ou uma coluna a mais numa versão futura do SUAP,
 * não quebram a leitura.
 */
import { expandirColspan, linhasDe, rotulosDoCabecalho, textoDe, trecho } from "./html.ts";

export interface EtapaSuap {
  numero: number;
  nota: number | null;
  faltas: number | null;
}

export interface DisciplinaSuap {
  /** Número do diário no SUAP (identifica a turma). */
  diario: string | null;
  /** Nome já formatado (ex.: "Banco de Dados I"). */
  nome: string;
  /** Código da disciplina no SUAP (ex.: "XYZALP1"). */
  codigo: string | null;
  aulasPrevistas: number | null;
  aulasCumpridas: number | null;
  faltas: number | null;
  /** Frequência sobre as aulas JÁ dadas, de 0 a 1, como o SUAP mostra. */
  frequencia: number | null;
  situacao: string | null;
  etapas: EtapaSuap[];
  media: number | null;
  /** Nota da Avaliação Final (o IFA). */
  naf: number | null;
  /** Média Final da Disciplina. */
  mfd: number | null;
}

export interface BoletimSuap {
  /** Ex.: { ano: 2026, periodo: 2 }. `null` se a página não informar. */
  periodo: { ano: number; periodo: number } | null;
  /** "Atualizado em" do SUAP, em ISO local (ex.: "2026-11-25T10:46"). */
  atualizadoEm: string | null;
  disciplinas: DisciplinaSuap[];
}

export type MotivoErroBoletim = "sem_tabela" | "sem_disciplinas";

export class ErroBoletim extends Error {
  readonly motivo: MotivoErroBoletim;

  // Sem "constructor(public readonly motivo)": o Node roda TypeScript só
  // apagando os tipos, e essa sintaxe gera código, então ele não aceita.
  constructor(motivo: MotivoErroBoletim) {
    super(motivo === "sem_tabela" ? "Tabela do boletim não encontrada." : "Nenhuma disciplina no boletim.");
    this.name = "ErroBoletim";
    this.motivo = motivo;
  }
}

/** Remove acentos e padroniza para comparar textos. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** "80 Aulas" → 80; "5,40" → 5.4; "81,25%" → 0.8125; "-" → null. */
export function lerNumero(texto: string | undefined): number | null {
  if (!texto) return null;
  const achado = /-?\d+(?:[.,]\d+)?/.exec(texto.replace(/\.(?=\d{3}\b)/g, ""));
  if (!achado) return null;
  const valor = Number(achado[0].replace(",", "."));
  // Arredonda para não carregar ruído de ponto flutuante (83,33% → 0.8333, e não 0.83329999…).
  return texto.includes("%") ? Number((valor / 100).toFixed(6)) : valor;
}

const MINUSCULAS = new Set(["a", "à", "ao", "aos", "as", "às", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por"]);
const ROMANOS = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

/** "BANCO DE DADOS I" → "Banco de Dados I". */
export function formatarNome(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra, i) => {
      if (ROMANOS.test(palavra)) return palavra.toUpperCase();
      if (i > 0 && MINUSCULAS.has(palavra)) return palavra;
      return palavra.charAt(0).toLocaleUpperCase("pt-BR") + palavra.slice(1);
    })
    .join(" ");
}

/** "ALGORITMOS E LÓGICA (XYZALP1) - SUP.10001" → nome e código. */
function separarDisciplina(texto: string): { nome: string; codigo: string | null } {
  const achado = /^(.*?)\s*\(([^()]+)\)\s*(?:-.*)?$/.exec(texto);
  if (!achado) return { nome: formatarNome(texto), codigo: null };
  return { nome: formatarNome(achado[1]!), codigo: achado[2]!.trim() };
}

function textoOuNulo(texto: string | undefined): string | null {
  const limpo = texto?.trim();
  return limpo && limpo !== "-" ? limpo : null;
}

/** Acha a tabela do boletim: pelo id que o SUAP usa ou, se não houver, pelo cabeçalho. */
function acharTabela(html: string): string | null {
  const porId = /<table\b[^>]*id=["']tabela_boletim["'][^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (porId) return porId[1]!;
  for (const [, tabela] of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const cabecalho = normalizar(textoDe(trecho(tabela!, "thead") ?? ""));
    if (cabecalho.includes("DISCIPLINA") && cabecalho.includes("FALTAS")) return tabela!;
  }
  return null;
}

export function lerBoletimSuap(html: string): BoletimSuap {
  const tabela = acharTabela(html);
  if (!tabela) throw new ErroBoletim("sem_tabela");

  const rotulos = rotulosDoCabecalho(linhasDe(trecho(tabela, "thead") ?? "")).map(normalizar);
  const coluna = (rotulo: string) => rotulos.indexOf(rotulo);
  const iDiario = coluna("DIARIO");
  const iDisciplina = coluna("DISCIPLINA");
  const iPrevistas = coluna("TOTAL DE AULAS PREVISTAS");
  const iCumpridas = coluna("TOTAL DE AULAS CUMPRIDAS");
  const iFaltas = coluna("TOTAL DE FALTAS");
  const iFrequencia = rotulos.findIndex((r) => r.startsWith("% FREQ"));
  const iSituacao = coluna("SITUACAO");
  const iMedia = coluna("MEDIA");
  const iNaf = coluna("NAF");
  const iMfd = rotulos.findIndex((r) => r.startsWith("MFD"));
  const colunasEtapas = rotulos
    .map((r, i) => ({ achado: /^ETAPA (\d+)\/(NOTA|FALTAS)$/.exec(r), i }))
    .filter((x) => x.achado);
  const numerosEtapas = [...new Set(colunasEtapas.map((x) => Number(x.achado![1])))].sort((a, b) => a - b);

  if (iDisciplina < 0) throw new ErroBoletim("sem_tabela");

  const disciplinas: DisciplinaSuap[] = [];
  for (const linha of linhasDe(trecho(tabela, "tbody") ?? "")) {
    const c = expandirColspan(linha);
    const textoDisciplina = c[iDisciplina];
    if (!textoDisciplina) continue;
    const { nome, codigo } = separarDisciplina(textoDisciplina);
    const valor = (i: number) => (i >= 0 ? c[i] : undefined);
    const naEtapa = (numero: number, tipo: "NOTA" | "FALTAS") =>
      lerNumero(valor(colunasEtapas.find((x) => Number(x.achado![1]) === numero && x.achado![2] === tipo)?.i ?? -1));

    disciplinas.push({
      diario: textoOuNulo(valor(iDiario)),
      nome,
      codigo,
      aulasPrevistas: lerNumero(valor(iPrevistas)),
      aulasCumpridas: lerNumero(valor(iCumpridas)),
      faltas: lerNumero(valor(iFaltas)),
      frequencia: lerNumero(valor(iFrequencia)),
      situacao: textoOuNulo(valor(iSituacao)),
      etapas: numerosEtapas.map((numero) => ({
        numero,
        nota: naEtapa(numero, "NOTA"),
        faltas: naEtapa(numero, "FALTAS"),
      })),
      media: lerNumero(valor(iMedia)),
      naf: lerNumero(valor(iNaf)),
      mfd: lerNumero(valor(iMfd)),
    });
  }
  if (disciplinas.length === 0) throw new ErroBoletim("sem_disciplinas");

  const textoPagina = textoDe(html);
  const periodo = /Boletim\s*-\s*(\d{4})\s*\/\s*(\d)/i.exec(textoPagina);
  const atualizado = /Atualizado em:\s*(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}:\d{2})/i.exec(textoPagina);

  return {
    periodo: periodo ? { ano: Number(periodo[1]), periodo: Number(periodo[2]) } : null,
    atualizadoEm: atualizado ? `${atualizado[3]}-${atualizado[2]}-${atualizado[1]}T${atualizado[4]}` : null,
    disciplinas,
  };
}
