import type { Avaliacao, Disciplina, RegrasAcademicas } from "../tipos.ts";
import { calcularSituacao, type Situacao } from "./situacao.ts";

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

/**
 * Média que falta tirar nas avaliações sem nota para chegar a `alvo`
 * (escala 0–10, considerando os pesos). `null` quando não há avaliação
 * pendente. Pode dar ≤ 0 (já garantido) ou > 10 (não dá mais).
 */
export function mediaNecessaria(avaliacoes: readonly Avaliacao[], alvo: number): number | null {
  const ativas = avaliacoes.filter((a) => a.excluidoEm === null);
  const pendentes = ativas.filter((a) => a.nota === null);
  const pesoPendente = pendentes.reduce((s, a) => s + a.peso, 0);
  if (pesoPendente === 0) return null;
  const pesoTotal = ativas.reduce((s, a) => s + a.peso, 0);
  const obtido = ativas
    .filter((a) => a.nota !== null)
    .reduce((s, a) => s + ((a.nota as number) / a.notaMaxima) * 10 * a.peso, 0);
  return (alvo * pesoTotal - obtido) / pesoPendente;
}

/**
 * A conta em PONTOS (de 0 a 10), que é como o aluno pensa: "já tenho 5,4;
 * ainda valem 2,5 pontos; preciso de 0,6 deles para passar".
 */
export interface PontosDaDisciplina {
  /** Pontos já garantidos (das avaliações que já têm nota). */
  garantidos: number;
  /** Pontos ainda em jogo, nas avaliações sem nota. */
  emJogo: number;
  /** Quanto falta para a média de aprovação (≤ 0 = já garantido). */
  faltam: number;
}

/**
 * Pontos pelas avaliações do app. Cada avaliação vale a sua fatia dos 10
 * pontos conforme o peso: com o peso igual ao valor da avaliação (P1 vale 7,
 * trabalho vale 3), isso dá a conta "soma tudo e leva para 10", que cobre a
 * soma simples, a média aritmética e fórmulas como (P1+T1+P2+T2)/2.
 */
export function pontosDasAvaliacoes(avaliacoes: readonly Avaliacao[], alvo: number): PontosDaDisciplina | null {
  const ativas = avaliacoes.filter((a) => a.excluidoEm === null);
  const pesoTotal = ativas.reduce((s, a) => s + a.peso, 0);
  if (pesoTotal === 0) return null;
  const garantidos = ativas
    .filter((a) => a.nota !== null)
    .reduce((s, a) => s + ((a.nota as number) / a.notaMaxima) * a.peso, 0) / pesoTotal * 10;
  const emJogo = (ativas.filter((a) => a.nota === null).reduce((s, a) => s + a.peso, 0) / pesoTotal) * 10;
  return { garantidos, emJogo, faltam: alvo - garantidos };
}

export interface NotaDaDisciplina {
  /**
   * De onde vem a média:
   * - "suap": nota da etapa fechada no SUAP (oficial);
   * - "suap_parcial": o SUAP já mostra uma nota, mas ainda há avaliação por
   *   fazer (na "soma simples", a etapa vai somando o que sai);
   * - "app": só as avaliações anotadas no app; `null`: nada ainda.
   */
  fonte: "suap" | "suap_parcial" | "app" | null;
  media: number | null;
  completa: boolean;
  /** Nota do IFA: a do SUAP (NAF) ou a anotada no app. */
  notaIfa: number | null;
  situacao: Situacao;
  mediaFinal: number | null;
  /** A conta em pontos, enquanto ainda há avaliação sem nota. */
  pontos: PontosDaDisciplina | null;
}

/**
 * Junta a nota do SUAP com as avaliações anotadas no app.
 *
 * O SUAP vence quando a nota está fechada: a MFD, ou a média das etapas sem
 * nenhuma avaliação pendente no app. Se o aluno anotou uma avaliação que
 * ainda vai acontecer (ex.: o trabalho que falta), a nota do SUAP é só o que
 * já foi lançado: ela vira "pontos garantidos", e o que falta entra na conta.
 * Sem nota no SUAP, vale a conta das avaliações do app, como prévia.
 */
export function notaDaDisciplina(
  disciplina: Pick<Disciplina, "suap" | "notaIfa">,
  avaliacoes: readonly Avaliacao[],
  regras: RegrasAcademicas,
  reprovadoPorFalta: boolean,
): NotaDaDisciplina {
  const suap = disciplina.suap;
  const ativas = avaliacoes.filter((a) => a.excluidoEm === null);
  const pendentes = ativas.filter((a) => a.nota === null);
  const etapasCompletas = !!suap && suap.etapas.length > 0 && suap.etapas.every((e) => e.nota !== null);
  // A média de antes do IFA; a MFD (média final) só é usada se a média não vier.
  const mediaSuap = suap && (etapasCompletas || suap.mfd !== null) ? (suap.media ?? suap.mfd) : null;
  const notaIfa = suap?.naf ?? disciplina.notaIfa;

  // SUAP com nota, mas o aluno sabe que ainda falta avaliação: parcial.
  if (mediaSuap !== null && suap!.mfd === null && pendentes.length > 0) {
    // Na soma simples, o valor de cada avaliação pendente são os pontos que ela ainda pode somar.
    const emJogo = pendentes.reduce((s, a) => s + a.notaMaxima, 0);
    const { situacao } = calcularSituacao({ media: mediaSuap, mediaCompleta: false, reprovadoPorFalta, notaIfa, regras });
    return {
      fonte: "suap_parcial",
      media: mediaSuap,
      completa: false,
      notaIfa,
      situacao,
      mediaFinal: null,
      pontos: { garantidos: mediaSuap, emJogo, faltam: regras.mediaAprovacao - mediaSuap },
    };
  }

  const doApp = calcularMedia(avaliacoes);
  const fonte = mediaSuap !== null ? "suap" : doApp.media !== null ? "app" : null;
  const media = fonte === "suap" ? mediaSuap : doApp.media;
  const completa = fonte === "suap" ? true : doApp.completa;

  const calculada = calcularSituacao({ media, mediaCompleta: completa, reprovadoPorFalta, notaIfa, regras });
  // Com a MFD do SUAP, a nota final já está fechada (inclui o IFA, se houve).
  const { situacao } = calculada;
  const mediaFinal = fonte === "suap" && suap?.mfd != null ? suap.mfd : calculada.mediaFinal;

  return {
    fonte,
    media,
    completa,
    notaIfa,
    situacao,
    mediaFinal,
    pontos: fonte === "suap" || pendentes.length === 0 ? null : pontosDasAvaliacoes(ativas, regras.mediaAprovacao),
  };
}
