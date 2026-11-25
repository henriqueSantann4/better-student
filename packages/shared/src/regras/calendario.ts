import type { DataIso, DiaSemana, EventoCalendario, HorarioAula } from "../tipos.ts";
import { diaSemanaDe } from "../datas.ts";

export interface DiaLetivo {
  /** Se há aula neste dia. */
  letivo: boolean;
  /** Dia da grade que vale (num sábado letivo, o dia que ele segue). */
  diaDaGrade: DiaSemana;
  /** Evento que explica a exceção (feriado, recesso, sábado letivo). */
  motivo: EventoCalendario | null;
}

function cobre(evento: EventoCalendario, data: DataIso): boolean {
  return evento.excluidoEm === null && evento.dataInicio <= data && data <= evento.dataFim;
}

/**
 * Como fica um dia, considerando o calendário acadêmico:
 * - feriado ou recesso que suspende aulas → não letivo;
 * - sábado letivo → letivo, com a grade do dia que ele segue;
 * - domingo → não letivo; fora isso, vale a grade do próprio dia.
 *
 * Datas "YYYY-MM-DD" se comparam como texto, por isso as comparações
 * com <= funcionam direto.
 */
export function diaLetivo(data: DataIso, eventos: readonly EventoCalendario[]): DiaLetivo {
  const suspende = eventos.find((e) => e.suspendeAulas && cobre(e, data));
  const diaSemana = diaSemanaDe(data);
  if (suspende) return { letivo: false, diaDaGrade: diaSemana, motivo: suspende };

  const sabado = eventos.find((e) => e.tipo === "sabado_letivo" && e.segueDiaSemana !== null && cobre(e, data));
  if (sabado) return { letivo: true, diaDaGrade: sabado.segueDiaSemana!, motivo: sabado };

  return { letivo: diaSemana !== 0, diaDaGrade: diaSemana, motivo: null };
}

/** Os encontros da grade que acontecem numa data (vazio em feriados). */
export function aulasDoDia(
  data: DataIso,
  horarios: readonly HorarioAula[],
  eventos: readonly EventoCalendario[],
): { dia: DiaLetivo; aulas: HorarioAula[] } {
  const dia = diaLetivo(data, eventos);
  return { dia, aulas: dia.letivo ? horarios.filter((h) => h.diaSemana === dia.diaDaGrade) : [] };
}

/** Eventos de hoje em diante, em ordem, para a lista de "próximos". */
export function proximosEventos(
  eventos: readonly EventoCalendario[],
  hoje: DataIso,
  limite = 5,
): EventoCalendario[] {
  return eventos
    .filter((e) => e.excluidoEm === null && e.dataFim >= hoje)
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))
    .slice(0, limite);
}

export type TipoDia =
  /** Dia de aula normal, dentro do semestre. */
  | "letivo"
  /** Feriado ou recesso: sem aula. */
  | "sem_aula"
  | "sabado_letivo"
  | "prova_final"
  | "fechamento"
  /** Fim de semana ou fora do semestre. */
  | "fora";

export interface MarcacaoDia {
  tipo: TipoDia;
  /** Eventos que cobrem o dia (sem os internos, do tipo "outro"). */
  eventos: EventoCalendario[];
}

/**
 * Como pintar um dia na visão de mês, na mesma lógica da legenda do SUAP.
 * A ordem importa: fechamento e prova final vencem o resto; um feriado
 * vence o fato de ser dia de semana dentro do semestre.
 */
export function marcarDia(
  data: DataIso,
  eventos: readonly EventoCalendario[],
  semestre: { inicio: DataIso; fim: DataIso },
): MarcacaoDia {
  const doDia = eventos.filter((e) => cobre(e, data));
  const tem = (tipo: EventoCalendario["tipo"]) => doDia.some((e) => e.tipo === tipo);
  const visiveis = doDia.filter((e) => e.tipo !== "outro");

  let tipo: TipoDia;
  if (tem("fim_aulas")) tipo = "fechamento";
  else if (tem("prova_final")) tipo = "prova_final";
  else if (doDia.some((e) => e.suspendeAulas)) tipo = "sem_aula";
  else if (tem("sabado_letivo")) tipo = "sabado_letivo";
  else {
    const diaSemana = diaSemanaDe(data);
    const noSemestre = semestre.inicio <= data && data <= semestre.fim;
    tipo = noSemestre && diaSemana >= 1 && diaSemana <= 5 ? "letivo" : "fora";
  }
  return { tipo, eventos: visiveis };
}
