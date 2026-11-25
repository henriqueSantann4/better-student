import type { Banco } from "../banco/banco.ts";
import { configuracao } from "../banco/configuracao.ts";
import type { RegraLembrete, TipoTarefa } from "../tipos.ts";

const HORA = 60;
const DIA = 24 * HORA;

/** Preferência de lembrete de cada tipo de tarefa. `null` = sem lembrete. */
export type LembretesPorTipo = Record<TipoTarefa, RegraLembrete | null>;

/**
 * Padrão de fábrica: provas avisam mais cedo e mais vezes; listas e
 * atividades do Moodle, uma vez na véspera.
 */
export const LEMBRETES_PADRAO: Readonly<LembretesPorTipo> = {
  prova: { quantidade: 3, inicioAntesMinutos: 3 * DIA, intervaloMinutos: DIA },
  trabalho: { quantidade: 2, inicioAntesMinutos: 2 * DIA, intervaloMinutos: DIA },
  apresentacao: { quantidade: 2, inicioAntesMinutos: 2 * DIA, intervaloMinutos: DIA },
  lista: { quantidade: 1, inicioAntesMinutos: DIA, intervaloMinutos: DIA },
  atividade_moodle: { quantidade: 1, inicioAntesMinutos: DIA, intervaloMinutos: DIA },
  outro: { quantidade: 1, inicioAntesMinutos: DIA, intervaloMinutos: DIA },
};

export const TIPOS_TAREFA = Object.keys(LEMBRETES_PADRAO) as TipoTarefa[];

/** Os lembretes escolhidos em Configurações, completando com o padrão o que faltar. */
export async function lerLembretesPadrao(banco: Banco): Promise<LembretesPorTipo> {
  const salvos = (await configuracao.ler<Partial<LembretesPorTipo>>(banco, "lembretesPadrao")) ?? {};
  return { ...LEMBRETES_PADRAO, ...salvos };
}

export async function gravarLembretesPadrao(banco: Banco, lembretes: LembretesPorTipo): Promise<void> {
  await configuracao.gravar(banco, "lembretesPadrao", lembretes);
}

/**
 * Quando cada lembrete de uma tarefa toca: o primeiro `inicioAntesMinutos`
 * antes do prazo e os seguintes a cada `intervaloMinutos`, nunca depois do prazo.
 */
export function momentosDosLembretes(prazo: Date, regra: RegraLembrete): Date[] {
  const momentos: Date[] = [];
  for (let i = 0; i < regra.quantidade; i++) {
    const minutosAntes = regra.inicioAntesMinutos - i * regra.intervaloMinutos;
    if (minutosAntes <= 0) break;
    momentos.push(new Date(prazo.getTime() - minutosAntes * 60_000));
  }
  return momentos;
}
