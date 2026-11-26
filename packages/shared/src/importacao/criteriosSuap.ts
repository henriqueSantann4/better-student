/**
 * Leitor dos "Instrumentos e Critérios de Avaliação da Aprendizagem", do
 * plano de ensino na Turma Virtual do SUAP (/edu/sala_virtual/<diário>/).
 *
 * É texto livre, escrito pelo professor ("Nota Final = T + P1 + P2 + P3",
 * pesos, quando vai para o IFA...). O app não tenta entender a conta: só
 * guarda o texto e mostra, com as quebras de parágrafo.
 */
import { decodificarEntidades } from "./html.ts";

const TITULO = /<h3\b[^>]*>\s*Instrumentos\s+e\s+Crit(?:é|&eacute;)rios\s+de\s+Avalia/i;

/**
 * O texto dos critérios, com uma quebra de linha por parágrafo. `""` quando a
 * seção existe mas o professor não escreveu nada; `null` quando a página não
 * tem a seção (não é a página certa).
 */
export function lerCriteriosAvaliacao(html: string): string | null {
  const inicio = html.search(TITULO);
  if (inicio < 0) return null;
  const depois = html.slice(inicio).replace(/^[\s\S]*?<\/h3>/i, "");
  // A seção termina onde começa a próxima caixa ou aba.
  const fim = depois.search(/<div\b[^>]*class=["'][^"']*\b(?:box|tab)\b|<h3\b/i);
  const corpo = fim >= 0 ? depois.slice(0, fim) : depois;
  const texto = corpo
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");
  return decodificarEntidades(texto)
    .split("\n")
    .map((linha) => linha.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
