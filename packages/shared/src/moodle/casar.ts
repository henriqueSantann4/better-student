/**
 * Casa as salas do Moodle com as disciplinas do app.
 *
 * Cada professor nomeia a sala de um jeito ("[2026...(VTPMAIN) 399107]
 * MATEMÁTICA...", "VTPPOOB - PROGRAMAÇÃO...", "Estrutura de Dados 1 - 2026").
 * Quase sempre aparece o código da disciplina no SUAP, que o app já guardou
 * ao importar o boletim. Ordem das tentativas:
 *   1. código do SUAP (ou a sigla) aparecendo no nome/sigla da sala;
 *   2. nome da disciplina contido no nome da sala (sem acentos/maiúsculas).
 */
import type { Disciplina } from "../tipos.ts";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Texto contém a palavra (ou sequência de palavras) inteira. */
function contemPalavras(texto: string, trecho: string): boolean {
  return trecho.length > 0 && ` ${texto} `.includes(` ${trecho} `);
}

export function casarDisciplinaMoodle(
  sala: { nome: string; sigla: string },
  disciplinas: readonly Disciplina[],
): Disciplina | null {
  const texto = normalizar(`${sala.nome} ${sala.sigla}`);

  // 1. Pelo código: o mais confiável. Códigos curtos demais são ignorados.
  for (const d of disciplinas) {
    const codigos = [d.suap?.codigo, d.sigla].filter((c): c is string => !!c && c.length >= 4).map(normalizar);
    if (codigos.some((c) => contemPalavras(texto, c))) return d;
  }

  // 2. Pelo nome: fica com o nome mais longo que couber (o mais específico).
  const porNome = disciplinas
    .filter((d) => contemPalavras(texto, normalizar(d.nome)))
    .sort((a, b) => b.nome.length - a.nome.length);
  return porNome[0] ?? null;
}
