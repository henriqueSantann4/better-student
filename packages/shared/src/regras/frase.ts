/**
 * Leitor de frases da Agenda, SEM IA: só regras.
 *
 * "prova de POO quinta 19h" → tipo prova, disciplina POO, próxima quinta, 19:00.
 *
 * Regras do projeto (CLAUDE.md):
 * - resolve a data ("dia 12", "amanhã", "quinta", "12/12") e consulta a grade
 *   daquele dia, descontando feriados;
 * - uma aula no dia → preenche disciplina e horário; várias → devolve as
 *   opções para o usuário escolher; nenhuma → aviso;
 * - o que o usuário ESCREVEU sempre vence o que foi deduzido.
 */
import type { DataIso, Disciplina, EventoCalendario, HorarioAula, TipoTarefa } from "../tipos.ts";
import { deDataIso, paraDataIso } from "../datas.ts";
import { aulasDoDia } from "./calendario.ts";

export interface ContextoFrase {
  agora: Date;
  disciplinas: readonly Disciplina[];
  horarios: readonly HorarioAula[];
  eventos: readonly EventoCalendario[];
}

export type AvisoFrase =
  | "semAulaNoDia"
  /** A disciplina escrita não tem aula na data escrita (a hora fica em aberto). */
  | "disciplinaSemAulaNoDia"
  | "variasAulasNoDia"
  | "variasDisciplinas"
  | "dataNoPassado";

export interface FraseLida {
  titulo: string;
  tipo: TipoTarefa;
  /** Tipo veio de uma palavra da frase (e não do padrão). */
  tipoEscrito: boolean;
  disciplinaId: string | null;
  /** Como a disciplina foi achada: escrita na frase, ou deduzida pela grade. */
  disciplinaOrigem: "escrita" | "grade" | null;
  /** Quando há dúvida, as disciplinas possíveis para o usuário escolher. */
  opcoesDisciplina: string[];
  data: DataIso | null;
  dataOrigem: "escrita" | "grade" | null;
  hora: string | null;
  horaOrigem: "escrita" | "grade" | null;
  avisos: AvisoFrase[];
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Minúsculas, sem acentos, só letras/números/":"/"/" separados por espaço. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:/]+/g, " ")
    .trim();
}

const PALAVRAS_VAZIAS = new Set(["a", "ao", "as", "da", "das", "de", "do", "dos", "e", "em", "na", "no", "o", "os", "para", "com"]);

// ---------------------------------------------------------------------------
// Tipo
// ---------------------------------------------------------------------------

const TIPOS: [RegExp, TipoTarefa][] = [
  [/\b(prova|provas|avaliacao|exame|p1|p2|p3|recuperacao|ifa|teste)\b/, "prova"],
  [/\b(apresentacao|apresentar|seminario|defesa)\b/, "apresentacao"],
  [/\b(lista|listas|exercicio|exercicios)\b/, "lista"],
  [/\b(trabalho|trabalhos|projeto|relatorio|atividade|entrega|tarefa)\b/, "trabalho"],
];

function lerTipo(texto: string): TipoTarefa | null {
  return TIPOS.find(([padrao]) => padrao.test(texto))?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Data e hora
// ---------------------------------------------------------------------------

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, dom: 0, segunda: 1, seg: 1, terca: 2, ter: 2, quarta: 3, qua: 3,
  quinta: 4, qui: 4, sexta: 5, sex: 5, sabado: 6, sab: 6,
};

function somarDias(data: Date, dias: number): Date {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  d.setDate(d.getDate() + dias);
  return d;
}

/** Data escrita na frase, sempre a PRÓXIMA ocorrência (nunca no passado). */
function lerData(texto: string, agora: Date): DataIso | null {
  const hoje = somarDias(agora, 0);
  if (/\bdepois de amanha\b/.test(texto)) return paraDataIso(somarDias(hoje, 2));
  if (/\bamanha\b/.test(texto)) return paraDataIso(somarDias(hoje, 1));
  if (/\bhoje\b/.test(texto)) return paraDataIso(hoje);

  // 12/12 ou 12/12/2026
  const completa = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(texto);
  if (completa) {
    const [, d, m, a] = completa;
    let ano = a ? Number(a.length === 2 ? `20${a}` : a) : hoje.getFullYear();
    let data = new Date(ano, Number(m) - 1, Number(d));
    if (!a && data < hoje) data = new Date(++ano, Number(m) - 1, Number(d));
    return paraDataIso(data);
  }

  // "dia 12": o próximo dia 12 (este mês, ou o que vem)
  const dia = /\bdia (\d{1,2})\b/.exec(texto);
  if (dia) {
    const n = Number(dia[1]);
    let data = new Date(hoje.getFullYear(), hoje.getMonth(), n);
    if (data < hoje) data = new Date(hoje.getFullYear(), hoje.getMonth() + 1, n);
    return paraDataIso(data);
  }

  // "quinta", "sexta que vem", "proxima segunda"
  for (const [nome, numero] of Object.entries(DIAS_SEMANA)) {
    const achado = new RegExp(`\\b(proxima |proximo )?${nome}(-feira)?( que vem)?\\b`).exec(texto);
    if (!achado) continue;
    let diferenca = (numero - hoje.getDay() + 7) % 7;
    if (diferenca === 0) diferenca = 7; // "quinta" dita numa quinta = a da semana que vem
    if (achado[3] && diferenca < 7) diferenca += 7; // "quinta que vem" pula a desta semana
    return paraDataIso(somarDias(hoje, diferenca));
  }

  if (/\bsemana que vem\b|\bproxima semana\b/.test(texto)) return paraDataIso(somarDias(hoje, 7));
  return null;
}

/** "19h", "19:30", "19h30", "as 7", "7h da noite" → "HH:MM". */
function lerHora(texto: string): string | null {
  const achado =
    /\b(\d{1,2})(?::|h)(\d{2})?\b/.exec(texto) ?? /\bas (\d{1,2})\b(?!\/)/.exec(texto);
  if (!achado) return null;
  let hora = Number(achado[1]);
  const minuto = Number(achado[2] ?? 0);
  if (hora > 23 || minuto > 59) return null;
  if (/\b(da noite|da tarde)\b/.test(texto) && hora < 12) hora += 12;
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Disciplina
// ---------------------------------------------------------------------------

/** Jeitos de se referir a uma disciplina: nome, sigla, código e iniciais. */
function apelidos(d: Disciplina): { iniciais: string[]; palavras: string[]; nome: string } {
  const palavrasNome = normalizar(d.nome).split(" ").filter((p) => !PALAVRAS_VAZIAS.has(p));
  // Número no fim ("1", "2", "I", "II") fica de fora das iniciais-base.
  const ehNumero = (p: string) => /^(\d+|i{1,3}|iv|v|vi{0,3}|ix|x)$/.test(p);
  const base = palavrasNome.filter((p) => !ehNumero(p)).map((p) => p[0]).join("");
  const numero = palavrasNome.filter(ehNumero).join("");
  // "Programação Orientada a Objetos" → "poo"; "Estrutura de Dados 1" → "ed1" e "ed";
  // "Banco de Dados I" → "bdi" e "bd".
  const iniciais = [base + numero, base, d.sigla, d.suap?.codigo]
    .filter((x): x is string => !!x)
    .map((x) => normalizar(x))
    .filter((x) => x.length >= 2);
  // Palavras marcantes do nome (ex.: "matematica", "extensao"), para "prova de matemática".
  const palavras = palavrasNome.filter((p) => p.length >= 5);
  return { iniciais, palavras, nome: palavrasNome.join(" ") };
}

/** Disciplinas citadas na frase (pode ser mais de uma, se houver dúvida). */
function lerDisciplinas(texto: string, disciplinas: readonly Disciplina[]): Disciplina[] {
  const tokens = new Set(texto.split(" "));
  const semVazias = texto.split(" ").filter((p) => !PALAVRAS_VAZIAS.has(p)).join(" ");

  // 1. Nome completo, sigla, código ou iniciais: a citação mais clara.
  const exatas = disciplinas.filter((d) => {
    const a = apelidos(d);
    return a.iniciais.some((i) => tokens.has(i)) || ` ${semVazias} `.includes(` ${a.nome} `);
  });
  if (exatas.length > 0) return exatas;

  // 2. Uma palavra marcante do nome ("matematica", "banco").
  return disciplinas.filter((d) => apelidos(d).palavras.some((p) => tokens.has(p)));
}

// ---------------------------------------------------------------------------
// Frase completa
// ---------------------------------------------------------------------------

export function lerFrase(frase: string, ctx: ContextoFrase): FraseLida {
  const texto = normalizar(frase);
  const tipoEscrito = lerTipo(texto);
  const citadas = lerDisciplinas(texto, ctx.disciplinas);

  const resultado: FraseLida = {
    titulo: frase.trim().replace(/^\p{Ll}/u, (c) => c.toLocaleUpperCase("pt-BR")),
    tipo: tipoEscrito ?? "outro",
    tipoEscrito: tipoEscrito !== null,
    disciplinaId: citadas.length === 1 ? citadas[0]!.id : null,
    disciplinaOrigem: citadas.length === 1 ? "escrita" : null,
    opcoesDisciplina: citadas.length > 1 ? citadas.map((d) => d.id) : [],
    data: lerData(texto, ctx.agora),
    dataOrigem: null,
    hora: lerHora(texto),
    horaOrigem: null,
    avisos: citadas.length > 1 ? ["variasDisciplinas"] : [],
  };
  if (resultado.data) resultado.dataOrigem = "escrita";
  if (resultado.hora) resultado.horaOrigem = "escrita";

  if (resultado.data) {
    if (resultado.data < paraDataIso(ctx.agora)) resultado.avisos.push("dataNoPassado");
    const { aulas } = aulasDoDia(resultado.data, ctx.horarios, ctx.eventos);
    if (resultado.disciplinaId) {
      // Disciplina escrita: sem hora na frase, a prova é no horário da aula
      // daquele dia. Se a disciplina não tem aula no dia, não dá para saber a
      // hora: o prazo fica até o fim do dia, com um aviso.
      const aula = aulas.find((h) => h.disciplinaId === resultado.disciplinaId);
      if (aula && !resultado.hora) {
        resultado.hora = aula.inicio;
        resultado.horaOrigem = "grade";
      } else if (!aula && !resultado.hora) {
        resultado.avisos.push("disciplinaSemAulaNoDia");
      }
    } else if (resultado.opcoesDisciplina.length === 0) {
      // Sem disciplina escrita: a grade do dia decide.
      const doDia = [...new Set(aulas.map((h) => h.disciplinaId))];
      if (doDia.length === 1) {
        resultado.disciplinaId = doDia[0]!;
        resultado.disciplinaOrigem = "grade";
        if (!resultado.hora) {
          resultado.hora = aulas[0]!.inicio;
          resultado.horaOrigem = "grade";
        }
      } else if (doDia.length > 1) {
        resultado.opcoesDisciplina = doDia;
        resultado.avisos.push("variasAulasNoDia");
      } else if (resultado.tipo === "prova" || resultado.tipo === "apresentacao") {
        // Só avisa para o que acontece EM AULA: entrega de trabalho pode ser em qualquer dia.
        resultado.avisos.push("semAulaNoDia");
      }
    }
  }
  // Sem data na frase, a tarefa fica sem prazo: o app não inventa um dia.
  return resultado;
}

/** Junta data e hora locais num prazo ISO. Sem hora, vale até o fim do dia. */
export function prazoDaFrase(lida: Pick<FraseLida, "data" | "hora">): string | null {
  if (!lida.data) return null;
  const [h, m] = (lida.hora ?? "23:59").split(":").map(Number);
  const d = deDataIso(lida.data);
  d.setHours(h!, m!, 0, 0);
  return d.toISOString();
}
