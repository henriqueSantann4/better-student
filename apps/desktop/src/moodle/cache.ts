/**
 * Última foto do Moodle (salas, notas e lista de arquivos), guardada no banco
 * para as telas abrirem na hora, sem esperar a rede. Ela é refeita a cada
 * atualização (ao abrir o app e no botão Atualizar). Os ARQUIVOS em si não
 * são baixados aqui: só a lista, com nome e tamanho.
 */
import {
  casarDisciplinaMoodle,
  configuracao,
  type ArquivoMoodle,
  type AtividadeMoodle,
  type Banco,
  type Disciplina,
  type DisciplinaMoodle,
  type NotaMoodle,
} from "@better-student/shared";
import { carregarArquivosDaSala, carregarPainel, carregarNotasDaSala, moodleDisponivel } from "./api";

export interface CacheMoodle {
  atualizadoEm: string;
  salas: DisciplinaMoodle[];
  /** Por id da sala. Sala que falhou na última busca fica com o que tinha antes. */
  notas: Record<number, NotaMoodle[]>;
  arquivos: Record<number, ArquivoMoodle[]>;
}

export async function lerCacheMoodle(banco: Banco): Promise<CacheMoodle | null> {
  if (!moodleDisponivel() && import.meta.env.DEV) return cacheDeExemplo();
  return configuracao.ler<CacheMoodle>(banco, "cacheMoodle");
}

/**
 * Busca tudo de uma vez: atividades da linha do tempo e, de cada sala, as
 * notas e a lista de arquivos (em paralelo). Uma sala que falhar não derruba
 * as outras: fica com os dados da busca anterior.
 */
export async function buscarMoodle(
  site: string,
  anterior: CacheMoodle | null,
): Promise<{ cache: CacheMoodle; atividades: AtividadeMoodle[] }> {
  const painel = await carregarPainel(site);
  const cache: CacheMoodle = { atualizadoEm: new Date().toISOString(), salas: painel.disciplinas, notas: {}, arquivos: {} };
  await Promise.all(
    painel.disciplinas.map(async (sala) => {
      const [notas, arquivos] = await Promise.allSettled([
        carregarNotasDaSala(site, sala.id, painel.info.idUsuario),
        carregarArquivosDaSala(site, sala.id),
      ]);
      const notasAntes = anterior?.notas[sala.id];
      const arquivosAntes = anterior?.arquivos[sala.id];
      if (notas.status === "fulfilled") cache.notas[sala.id] = notas.value;
      else if (notasAntes) cache.notas[sala.id] = notasAntes;
      if (arquivos.status === "fulfilled") cache.arquivos[sala.id] = arquivos.value;
      else if (arquivosAntes) cache.arquivos[sala.id] = arquivosAntes;
    }),
  );
  return { cache, atividades: painel.atividades };
}

export async function gravarCacheMoodle(banco: Banco, cache: CacheMoodle): Promise<void> {
  await configuracao.gravar(banco, "cacheMoodle", cache);
}

/** A sala do Moodle de uma disciplina do app (pelo código do SUAP ou pelo nome). */
export function salaDaDisciplina(cache: CacheMoodle | null, disciplina: Disciplina, todas: readonly Disciplina[]): DisciplinaMoodle | null {
  return cache?.salas.find((s) => casarDisciplinaMoodle(s, todas)?.id === disciplina.id) ?? null;
}

/** Só em desenvolvimento, no navegador: uma foto inventada para ver as telas. */
async function cacheDeExemplo(): Promise<CacheMoodle> {
  const [{ notasDeExemplo }, { arquivosMoodleDeExemplo }] = await Promise.all([import("./exemplos"), import("../exemplosMateriais")]);
  const lidas = notasDeExemplo();
  const cache: CacheMoodle = { atualizadoEm: new Date().toISOString(), salas: lidas.map((n) => n.sala), notas: {}, arquivos: {} };
  for (const n of lidas) {
    cache.notas[n.sala.id] = n.notas;
    cache.arquivos[n.sala.id] = arquivosMoodleDeExemplo();
  }
  return cache;
}
