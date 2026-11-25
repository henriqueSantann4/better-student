import type { RegrasAcademicas } from "../tipos.ts";
import { aoMenos } from "./comparacao.ts";

export type Situacao =
  /** Ainda faltam notas para fechar a média. */
  | "em_andamento"
  | "aprovado"
  /** Média entre o mínimo do IFA e a média de aprovação; ainda não fez o IFA. */
  | "ifa"
  | "aprovado_ifa"
  | "reprovado_nota"
  | "reprovado_ifa"
  | "reprovado_falta";

export interface EntradaSituacao {
  /** Média da disciplina (ver `calcularMedia`). */
  media: number | null;
  /** Se todas as avaliações já têm nota. */
  mediaCompleta: boolean;
  reprovadoPorFalta: boolean;
  /** Nota do IFA, ou `null` se não fez. */
  notaIfa: number | null;
  regras: RegrasAcademicas;
}

export interface ResultadoSituacao {
  situacao: Situacao;
  /** Média que vale para o histórico. `null` enquanto não dá para saber. */
  mediaFinal: number | null;
}

/**
 * Situação da disciplina pelas regras do semestre (padrão IFSP):
 *
 * 1. Frequência abaixo do mínimo reprova, independentemente da nota. Essa
 *    checagem vem primeiro porque é definitiva mesmo no meio do semestre.
 * 2. Sem todas as notas, a situação fica "em andamento".
 * 3. Média ≥ média de aprovação → aprovado.
 * 4. Média < mínimo do IFA → reprovado.
 * 5. No meio: IFA. Quem passa no IFA fica com a nota do IFA, limitada ao teto.
 */
export function calcularSituacao(entrada: EntradaSituacao): ResultadoSituacao {
  const { media, mediaCompleta, reprovadoPorFalta, notaIfa, regras } = entrada;

  if (reprovadoPorFalta) {
    return { situacao: "reprovado_falta", mediaFinal: mediaCompleta ? media : null };
  }
  if (media === null || !mediaCompleta) {
    return { situacao: "em_andamento", mediaFinal: null };
  }
  if (aoMenos(media, regras.mediaAprovacao)) {
    return { situacao: "aprovado", mediaFinal: media };
  }
  if (!aoMenos(media, regras.mediaMinimaIfa)) {
    return { situacao: "reprovado_nota", mediaFinal: media };
  }
  if (notaIfa === null) {
    return { situacao: "ifa", mediaFinal: null };
  }
  if (aoMenos(notaIfa, regras.notaMinimaIfa)) {
    return { situacao: "aprovado_ifa", mediaFinal: Math.min(notaIfa, regras.tetoAposIfa) };
  }
  return { situacao: "reprovado_ifa", mediaFinal: media };
}
