import type { DataIso } from "../tipos.ts";

export interface Periodo {
  ano: number;
  /** 1 = primeiro semestre, 2 = segundo. */
  periodo: number;
}

/** Lê o período de um nome de semestre: "2026.2", "2026/2" ou "2026-2". */
export function periodoDoNome(nome: string): Periodo | null {
  const achado = /(\d{4})\s*[./-]\s*(\d)/.exec(nome);
  return achado ? { ano: Number(achado[1]), periodo: Number(achado[2]) } : null;
}

/** { ano: 2026, periodo: 2 } → "2026.2" */
export function nomeDoPeriodo({ ano, periodo }: Periodo): string {
  return `${ano}.${periodo}`;
}

/** Período provável para uma data: janeiro a junho é o 1º semestre; julho em diante, o 2º. */
export function periodoDaData(data: Date = new Date()): Periodo {
  return { ano: data.getFullYear(), periodo: data.getMonth() >= 6 ? 2 : 1 };
}

/**
 * Datas ESTIMADAS de início e fim das aulas, para quem ainda não sabe as
 * reais. O padrão comum nos institutos federais é: 1º semestre de fevereiro
 * a julho, 2º de agosto a dezembro. O app marca essas datas como estimadas
 * e lembra o usuário de corrigir quando souber o calendário do campus.
 */
export function estimarDatas({ ano, periodo }: Periodo): { inicio: DataIso; fim: DataIso } {
  return periodo === 1
    ? { inicio: `${ano}-02-01`, fim: `${ano}-07-10` }
    : { inicio: `${ano}-08-01`, fim: `${ano}-12-20` };
}
