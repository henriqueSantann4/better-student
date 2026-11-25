import type { Disciplina, Falta, RegrasAcademicas } from "../tipos.ts";
import { pisoSeguro } from "./comparacao.ts";

export interface ResumoFaltas {
  /** Aulas faltadas até agora. */
  faltas: number;
  /** Máximo de aulas que pode faltar sem reprovar: ⌊totalAulas × (1 − frequênciaMínima)⌋. */
  limite: number;
  /** Aulas que ainda pode faltar (0 se já passou do limite). */
  restantes: number;
  /** Frequência considerando o semestre inteiro: (totalAulas − faltas) ÷ totalAulas. */
  frequencia: number;
  /** Faltou mais que o limite: reprovação automática, independentemente da nota. */
  reprovadoPorFalta: boolean;
}

/**
 * Resumo das faltas de uma disciplina. As faltas contam por aula, não por dia:
 * cada registro de falta soma a sua `quantidadeAulas`.
 *
 * O limite é arredondado para baixo porque falta é um número inteiro de aulas:
 * com 70 aulas e 75% de frequência, 17 faltas dão 24,3% (ok), mas 18 dão
 * 25,7% (reprova). Então o limite é 17, e não 17,5.
 */
export function resumirFaltas(
  disciplina: Pick<Disciplina, "totalAulas" | "frequenciaMinima">,
  faltas: readonly Falta[],
  regras: Pick<RegrasAcademicas, "frequenciaMinima">,
): ResumoFaltas {
  const frequenciaMinima = disciplina.frequenciaMinima ?? regras.frequenciaMinima;
  const total = disciplina.totalAulas;

  const faltadas = faltas
    .filter((f) => f.excluidoEm === null)
    .reduce((soma, f) => soma + f.quantidadeAulas, 0);

  const limite = pisoSeguro(total * (1 - frequenciaMinima));

  return {
    faltas: faltadas,
    limite,
    restantes: Math.max(0, limite - faltadas),
    frequencia: total > 0 ? Math.max(0, (total - faltadas) / total) : 1,
    reprovadoPorFalta: faltadas > limite,
  };
}

/**
 * Quantos encontros inteiros ainda dá para perder, dado quantas aulas cada
 * encontro vale. Ex.: 25 aulas restantes e encontros de 4 aulas → 6 encontros.
 */
export function encontrosRestantes(aulasRestantes: number, aulasPorEncontro: number): number {
  if (aulasPorEncontro <= 0) return 0;
  return Math.floor(aulasRestantes / aulasPorEncontro);
}

export type NivelFaltas = "ok" | "atencao" | "reprovado";

/**
 * Nível de alerta das faltas, para a interface:
 * - "reprovado": passou do limite;
 * - "atencao": já usou 75% do limite, ou mais uma falta de um encontro
 *   (`aulasPorEncontro`) estoura o limite;
 * - "ok": o resto.
 */
export function nivelFaltas(resumo: ResumoFaltas, aulasPorEncontro = 0): NivelFaltas {
  if (resumo.reprovadoPorFalta) return "reprovado";
  if (resumo.faltas >= resumo.limite * 0.75) return "atencao";
  if (aulasPorEncontro > 0 && resumo.restantes < aulasPorEncontro) return "atencao";
  return "ok";
}
