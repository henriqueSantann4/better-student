import { deDataIso, type DataIso, type DiaSemana } from "@better-student/shared";
import i18n from "./i18n";

/**
 * Formatação de datas e números pelo `Intl`, nativo do navegador. Os nomes
 * dos dias e os formatos seguem o idioma ativo do i18next, então nada aqui
 * precisa ser traduzido à mão.
 */

/** 1º de janeiro de 2023 foi um domingo: serve de referência para os nomes dos dias. */
const DOMINGO_REFERENCIA = new Date(2023, 0, 1);

export function nomeDia(dia: DiaSemana, estilo: "long" | "short" = "long"): string {
  const data = new Date(DOMINGO_REFERENCIA);
  data.setDate(1 + dia);
  const nome = new Intl.DateTimeFormat(i18n.language, { weekday: estilo }).format(data);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** Ex.: "seg., 23/11" */
export function formatarData(data: DataIso): string {
  return new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "2-digit", month: "2-digit" }).format(
    deDataIso(data),
  );
}

/** Ex.: "01/08/2026" */
export function formatarDataCompleta(data: DataIso): string {
  return new Intl.DateTimeFormat(i18n.language).format(deDataIso(data));
}

/** "2026-11-25T10:46" (hora local, sem fuso) → "25/11/2026 10:46" */
export function formatarDataHora(dataHora: string): string {
  const [data, hora] = dataHora.split("T");
  return hora ? `${formatarDataCompleta(data!)} ${hora.slice(0, 5)}` : formatarDataCompleta(data!);
}

/** Ex.: 0.925 → "92,5%". Com `casas = 2`, igual ao SUAP: 0.7778 → "77,78%". */
export function formatarPercentual(valor: number, casas = 1): string {
  return new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: casas }).format(valor);
}

/** Ex.: 5.4 → "5,4"; null → "–" */
export function formatarNota(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "–";
  return new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(valor);
}

/** Erros do SQLite chegam como texto; isto identifica a violação de um índice único. */
export function ehDuplicado(erro: unknown): boolean {
  return /UNIQUE/i.test(String(erro));
}
