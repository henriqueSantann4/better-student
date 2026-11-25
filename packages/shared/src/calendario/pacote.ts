/**
 * Pacote de calendário acadêmico: um arquivo JSON com as datas de um campus
 * (ex.: calendarios/ifsp-votuporanga-superiores-2026.json).
 *
 * O calendário fica num ARQUIVO DE DADOS, e não no código, para que nada de
 * uma instituição específica fique fixo no app: qualquer pessoa pode montar o
 * arquivo do seu campus e abrir no app, ou contribuir com ele no repositório.
 */
import type { DataIso, DiaSemana, TipoEventoCalendario } from "../tipos.ts";
import { periodoDoNome, type Periodo } from "../regras/semestre.ts";

export interface EventoPacote {
  tipo: TipoEventoCalendario;
  titulo: string;
  inicio: DataIso;
  /** Último dia. Se omitido, o evento é de um dia só. */
  fim?: DataIso;
  /** Num sábado letivo, qual dia da grade vale (1 = segunda...). */
  segueDiaSemana?: DiaSemana;
}

export interface SemestrePacote {
  /** Ex.: "2026/2" */
  periodo: string;
  inicio: DataIso;
  fim: DataIso;
  eventos: EventoPacote[];
}

export interface PacoteCalendario {
  formato: 1;
  id: string;
  instituicao: string;
  cursos: string;
  fonte?: string;
  observacao?: string;
  semestres: SemestrePacote[];
}

const TIPOS = new Set<TipoEventoCalendario>([
  "feriado", "recesso", "inicio_aulas", "fim_aulas", "semana_provas",
  "prova_final", "sabado_letivo", "prazo", "evento", "outro",
]);
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export class ErroPacote extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroPacote";
  }
}

/**
 * Confere a estrutura de um pacote vindo de um arquivo. Como o arquivo pode
 * ter sido escrito à mão (ou por outra pessoa), nada é aceito sem checar.
 */
export function lerPacoteCalendario(dados: unknown): PacoteCalendario {
  const p = dados as Partial<PacoteCalendario> | null;
  if (!p || typeof p !== "object" || p.formato !== 1) throw new ErroPacote("Formato de calendário desconhecido.");
  if (typeof p.id !== "string" || typeof p.instituicao !== "string" || !Array.isArray(p.semestres)) {
    throw new ErroPacote("Faltam id, instituição ou semestres.");
  }
  for (const s of p.semestres) {
    if (!periodoDoNome(s.periodo ?? "") || !DATA.test(s.inicio) || !DATA.test(s.fim) || s.fim < s.inicio) {
      throw new ErroPacote(`Semestre inválido: ${s.periodo}`);
    }
    for (const e of s.eventos ?? []) {
      const fim = e.fim ?? e.inicio;
      if (!TIPOS.has(e.tipo) || typeof e.titulo !== "string" || !DATA.test(e.inicio) || !DATA.test(fim) || fim < e.inicio) {
        throw new ErroPacote(`Evento inválido em ${s.periodo}: ${e.titulo}`);
      }
      if (e.tipo === "sabado_letivo" && (e.segueDiaSemana === undefined || e.segueDiaSemana < 0 || e.segueDiaSemana > 6)) {
        throw new ErroPacote(`Sábado letivo sem o dia da grade: ${e.inicio}`);
      }
    }
  }
  return p as PacoteCalendario;
}

/** O semestre do pacote que corresponde a um período (ex.: 2026/2). */
export function semestreDoPacote(pacote: PacoteCalendario, periodo: Periodo): SemestrePacote | null {
  return (
    pacote.semestres.find((s) => {
      const p = periodoDoNome(s.periodo);
      return p?.ano === periodo.ano && p.periodo === periodo.periodo;
    }) ?? null
  );
}
