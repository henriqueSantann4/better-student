/**
 * E-mail institucional: tipos e regras que não dependem de onde os e-mails
 * vêm (Gmail API, no futuro; exemplos fictícios, no modo navegador).
 */
import type { DataHoraIso } from "../tipos.ts";

/**
 * As abas da caixa de entrada, como as do Gmail:
 * - principal: professores, coordenação, secretaria (o que costuma pedir ação);
 * - atualizacoes: avisos automáticos de sistemas (SUAP, Moodle);
 * - divulgacao: eventos, palestras, newsletters ("menos importante").
 */
export type CategoriaEmail = "principal" | "atualizacoes" | "divulgacao";

export interface Remetente {
  nome: string;
  email: string;
}

export interface Email {
  id: string;
  de: Remetente;
  assunto: string;
  /** Começo do texto, para a lista. */
  trecho: string;
  /** Corpo em texto puro (busca, trecho e e-mails sem HTML). */
  corpo: string;
  /**
   * Versão HTML, com as imagens anexadas embutidas. A tela mostra num quadro
   * isolado (sem scripts, sem formulários). `null` = só há texto.
   */
  html: string | null;
  data: DataHoraIso;
  lido: boolean;
  estrela: boolean;
  categoria: CategoriaEmail;
}

/** Confere o formato de um endereço de e-mail (sem tentar ser perfeito). */
export function emailValido(endereco: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endereco.trim());
}

/** Iniciais para o "avatar" do remetente: "Ana Souza" → "AS". */
export function iniciais(nome: string): string {
  const partes = nome
    .replace(/^(prof\.?|profa\.?|dr\.?|dra\.?)\s+/i, "")
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p));
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0] : "";
  return (primeira + ultima).toLocaleUpperCase("pt-BR");
}

/** Busca simples por remetente, assunto e texto, sem diferenciar acentos. */
export function buscarEmails(emails: readonly Email[], termo: string): Email[] {
  const limpar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const alvo = limpar(termo.trim());
  if (!alvo) return [...emails];
  return emails.filter((e) =>
    limpar(`${e.de.nome} ${e.de.email} ${e.assunto} ${e.corpo}`).includes(alvo),
  );
}

/** Ignora acentos e maiúsculas. */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Em qual aba o e-mail entra. Regras simples, pelo remetente e pelo assunto:
 * - Atualizações: mensagens automáticas (nao-responda, noreply, alertas do
 *   Google, Moodle, SUAP);
 * - Divulgação: comunicação, eventos, editais, newsletters;
 * - Principal: o resto, que costuma ser gente (professores, coordenação).
 * Na dúvida vai para Principal: é melhor ver um aviso a mais do que perder
 * um e-mail de professor.
 */
export function classificarEmail(remetente: string, assunto: string): CategoriaEmail {
  const de = semAcento(remetente);
  const [local = "", dominio = ""] = de.split("@");
  const titulo = semAcento(assunto);

  const automatico =
    /(^|[.-])(nao-?responda|no-?reply|naoresponda|donotreply|notifica(cao|coes)?|mailer-daemon)([.-]|$)/.test(local) ||
    /(^|\.)(nao-?responda|no-?reply|naoresponda)\./.test(dominio) ||
    /(^|\.)google\.com$/.test(dominio) ||
    /moodle|suap/.test(local) ||
    /^(moodle|suap)\./.test(dominio);
  if (automatico) return "atualizacoes";

  const divulgacao =
    /^(comunicacao|divulgacao|eventos?|extensao|newsletter|noticias|informativo|marketing|imprensa)\b/.test(local) ||
    /inscric(ao|oes) abertas|edital|convite|webinar|palestra|semana (academica|nacional|internacional)|newsletter|boletim informativo/.test(titulo);
  if (divulgacao) return "divulgacao";

  return "principal";
}

/** Começo do texto, numa linha só, para a lista de e-mails. */
export function trechoDe(corpo: string, tamanho = 180): string {
  const linha = corpo.replace(/\s+/g, " ").trim();
  return linha.length > tamanho ? `${linha.slice(0, tamanho - 1)}…` : linha;
}
