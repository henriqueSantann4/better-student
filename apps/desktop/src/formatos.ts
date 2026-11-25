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

/** Ex.: "30/11" */
export function formatarDiaMes(data: DataIso): string {
  return new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "2-digit" }).format(deDataIso(data));
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

/**
 * Data na lista de e-mails, como no Gmail: só a hora se for hoje, dia e mês
 * se for deste ano, data completa se for de outro ano. Com `completa`, usada
 * ao abrir o e-mail: data e hora sempre.
 */
export function formatarDataEmail(iso: string, completa = false): string {
  const data = new Date(iso);
  const agora = new Date();
  const lingua = i18n.language;
  if (completa) {
    return new Intl.DateTimeFormat(lingua, { dateStyle: "medium", timeStyle: "short" }).format(data);
  }
  if (data.toDateString() === agora.toDateString()) {
    return new Intl.DateTimeFormat(lingua, { hour: "2-digit", minute: "2-digit" }).format(data);
  }
  if (data.getFullYear() === agora.getFullYear()) {
    return new Intl.DateTimeFormat(lingua, { day: "numeric", month: "short" }).format(data);
  }
  return new Intl.DateTimeFormat(lingua).format(data);
}

/**
 * Prazo curto, para listas: "hoje, 19:00", "amanhã, 07:00", "sex., 07:00"
 * (até 6 dias) ou "sex., 12/12". Prazo às 23:59 é "o dia todo": sem hora.
 */
export function formatarPrazo(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  const lingua = i18n.language;
  const hora =
    data.getHours() === 23 && data.getMinutes() === 59
      ? ""
      : `, ${new Intl.DateTimeFormat(lingua, { hour: "2-digit", minute: "2-digit" }).format(data)}`;
  const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioDoDia(data) - inicioDoDia(agora)) / 86_400_000);
  if (dias === 0) return `${i18n.t("comum.hoje")}${hora}`;
  if (dias === 1) return `${i18n.t("comum.amanha")}${hora}`;
  if (dias > 1 && dias < 7) return `${new Intl.DateTimeFormat(lingua, { weekday: "short" }).format(data)}${hora}`;
  return `${new Intl.DateTimeFormat(lingua, { weekday: "short", day: "2-digit", month: "2-digit" }).format(data)}${hora}`;
}

/** Erros do SQLite chegam como texto; isto identifica a violação de um índice único. */
export function ehDuplicado(erro: unknown): boolean {
  return /UNIQUE/i.test(String(erro));
}
