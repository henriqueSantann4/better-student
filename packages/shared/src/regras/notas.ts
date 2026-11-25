import type { Avaliacao } from "../tipos.ts";

export interface ResultadoMedia {
  /** Média ponderada das notas já lançadas, na escala 0–10. `null` se nenhuma saiu. */
  media: number | null;
  /** `true` quando todas as avaliações da disciplina já têm nota. */
  completa: boolean;
}

/**
 * Média ponderada das avaliações: Σ(nota normalizada × peso) ÷ Σ(peso).
 *
 * Cada nota é levada para a escala 0–10 (`nota / notaMaxima × 10`), então um
 * trabalho valendo 5 pontos e uma prova valendo 10 entram na mesma conta.
 * Média simples é só o caso em que todos os pesos são 1.
 *
 * Avaliações sem nota ainda não entram: o resultado é a média parcial do que
 * já saiu, e `completa` avisa se ainda falta alguma.
 */
export function calcularMedia(avaliacoes: readonly Avaliacao[]): ResultadoMedia {
  const ativas = avaliacoes.filter((a) => a.excluidoEm === null);
  const lancadas = ativas.filter((a) => a.nota !== null);

  let somaPonderada = 0;
  let somaPesos = 0;
  for (const a of lancadas) {
    const nota = ((a.nota as number) / a.notaMaxima) * 10;
    somaPonderada += nota * a.peso;
    somaPesos += a.peso;
  }

  return {
    media: somaPesos > 0 ? somaPonderada / somaPesos : null,
    completa: ativas.length > 0 && lancadas.length === ativas.length,
  };
}
