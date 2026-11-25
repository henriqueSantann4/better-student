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
  /** Corpo em TEXTO puro. Nunca HTML: é mostrado como texto, sem interpretar. */
  corpo: string;
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
