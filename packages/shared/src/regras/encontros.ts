/**
 * Contagem de encontros de uma disciplina no semestre, usando a grade e o
 * calendário acadêmico. Ideia: se POO é às terças e o semestre tem 20 terças
 * com aula (tirando feriados e somando sábados letivos com grade de terça),
 * e a disciplina tem 80 aulas, então cada encontro vale 80 ÷ 20 = 4 aulas.
 */
import type { DataIso, EventoCalendario, HorarioAula } from "../tipos.ts";
import { deDataIso, paraDataIso } from "../datas.ts";
import { diaLetivo } from "./calendario.ts";

/**
 * Último dia de aula normal. A prova final (IFA) e o fechamento não são
 * encontros da grade: as aulas terminam na véspera da prova final.
 */
export function fimDasAulas(fimSemestre: DataIso, eventos: readonly EventoCalendario[]): DataIso {
  const provaFinal = eventos
    .filter((e) => e.excluidoEm === null && e.tipo === "prova_final")
    .map((e) => e.dataInicio)
    .sort()[0];
  if (!provaFinal || provaFinal > fimSemestre) return fimSemestre;
  const vespera = deDataIso(provaFinal);
  vespera.setDate(vespera.getDate() - 1);
  return paraDataIso(vespera);
}

/** Cada dia de `inicio` a `fim`, inclusive. */
function* dias(inicio: DataIso, fim: DataIso): Generator<DataIso> {
  const atual = deDataIso(inicio);
  for (let d = paraDataIso(atual); d <= fim; atual.setDate(atual.getDate() + 1), d = paraDataIso(atual)) {
    yield d;
  }
}

/** Quantos encontros (aparições na grade) acontecem entre duas datas. */
export function contarEncontros(
  horarios: readonly Pick<HorarioAula, "diaSemana" | "excluidoEm">[],
  eventos: readonly EventoCalendario[],
  inicio: DataIso,
  fim: DataIso,
): number {
  const ativos = horarios.filter((h) => h.excluidoEm === null);
  if (ativos.length === 0 || fim < inicio) return 0;
  let total = 0;
  for (const data of dias(inicio, fim)) {
    const dia = diaLetivo(data, eventos);
    if (dia.letivo) total += ativos.filter((h) => h.diaSemana === dia.diaDaGrade).length;
  }
  return total;
}

export interface PlanoEncontros {
  /** Encontros no semestre inteiro. */
  total: number;
  /** Encontros que ainda vão acontecer, contando hoje. */
  restantes: number;
  /** Aulas por encontro pelo calendário (pode ter vírgula). `null` sem encontros. */
  aulasPorEncontro: number | null;
  /** O mesmo, arredondado: sugestão para o campo "Vale quantas aulas". */
  sugestao: number | null;
}

export function planejarEncontros(
  totalAulas: number,
  horarios: readonly Pick<HorarioAula, "diaSemana" | "excluidoEm">[],
  eventos: readonly EventoCalendario[],
  semestre: { inicio: DataIso; fim: DataIso },
  hoje: DataIso,
): PlanoEncontros {
  const ultimoDia = fimDasAulas(semestre.fim, eventos);
  const total = contarEncontros(horarios, eventos, semestre.inicio, ultimoDia);
  const desde = hoje > semestre.inicio ? hoje : semestre.inicio;
  const restantes = contarEncontros(horarios, eventos, desde, ultimoDia);
  const aulasPorEncontro = total > 0 ? totalAulas / total : null;
  return {
    total,
    restantes,
    aulasPorEncontro,
    sugestao: aulasPorEncontro === null ? null : Math.max(1, Math.round(aulasPorEncontro)),
  };
}
