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

export interface NotaDaDisciplina {
  /** De onde vem a média: do SUAP (oficial), das avaliações anotadas no app, ou de nenhum. */
  fonte: "suap" | "app" | null;
  media: number | null;
  completa: boolean;
  /** Nota do IFA: a do SUAP (NAF) ou a anotada no app. */
  notaIfa: number | null;
  situacao: Situacao;
  mediaFinal: number | null;
  /** Média que falta nas avaliações pendentes do app para aprovar direto. */
  precisa: number | null;
}

/**
 * Junta a nota oficial do SUAP com as avaliações anotadas no app.
 *
 * O SUAP vence quando já tem nota: a média das etapas, quando todas saíram,
 * ou a MFD. Antes disso, quem conta é o que o aluno anotou (P1, trabalho...),
 * como uma prévia. Assim a tela é útil o semestre todo, e não só no fim,
 * quando o professor lança a nota da etapa.
 */
export function notaDaDisciplina(
  disciplina: Pick<Disciplina, "suap" | "notaIfa">,
  avaliacoes: readonly Avaliacao[],
  regras: RegrasAcademicas,
  reprovadoPorFalta: boolean,
): NotaDaDisciplina {
  const suap = disciplina.suap;
  const etapasCompletas = !!suap && suap.etapas.length > 0 && suap.etapas.every((e) => e.nota !== null);
  // A média de antes do IFA; a MFD (média final) só é usada se a média não vier.
  const mediaSuap = suap && (etapasCompletas || suap.mfd !== null) ? (suap.media ?? suap.mfd) : null;
  const doApp = calcularMedia(avaliacoes);

  const fonte = mediaSuap !== null ? "suap" : doApp.media !== null ? "app" : null;
  const media = fonte === "suap" ? mediaSuap : doApp.media;
  const completa = fonte === "suap" ? true : doApp.completa;
  const notaIfa = suap?.naf ?? disciplina.notaIfa;

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
    precisa: fonte === "suap" ? null : mediaNecessaria(avaliacoes, regras.mediaAprovacao),
  };
}
