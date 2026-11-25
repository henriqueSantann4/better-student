import type { DataIso, DiaSemana } from "./tipos.ts";

/**
 * Datas "de calendário" (sem hora) sempre no fuso local do usuário.
 *
 * Cuidado clássico: `new Date("2026-11-24")` é interpretado como meia-noite
 * em UTC, que no Brasil (UTC−3) ainda é dia 23. Por isso aqui a data é sempre
 * montada a partir de ano, mês e dia locais.
 */

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Converte um `Date` na data local "YYYY-MM-DD". */
export function paraDataIso(data: Date): DataIso {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** A data de hoje, no fuso local. */
export function hojeIso(agora: Date = new Date()): DataIso {
  return paraDataIso(agora);
}

/** Converte "YYYY-MM-DD" num `Date` à meia-noite local. */
export function deDataIso(data: DataIso): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano!, mes! - 1, dia!);
}

/** Dia da semana (0 = domingo) de uma data "YYYY-MM-DD". */
export function diaSemanaDe(data: DataIso): DiaSemana {
  return deDataIso(data).getDay() as DiaSemana;
}
