/**
 * "Atualizar do SUAP" completo, sem prévia: é o que roda sozinho ao abrir o
 * app (e no botão Atualizar). Faz, na ordem certa, tudo o que a importação
 * manual faz e diz o que mudou, para a caixa "Enquanto você estava fora".
 */
import type { Disciplina, Semestre } from "../tipos.ts";
import type { Banco } from "../banco/banco.ts";
import { calendario as repoCalendario } from "../banco/calendario.ts";
import { disciplinas as repoDisciplinas } from "../banco/disciplinas.ts";
import { horarios as repoHorarios } from "../banco/horarios.ts";
import type { SemestrePacote } from "../calendario/pacote.ts";
import { periodoDoNome } from "../regras/semestre.ts";
import type { BoletimSuap } from "./boletimSuap.ts";
import type { HorariosSuap } from "./horariosSuap.ts";
import { importarHorarios, type ResultadoHorarios } from "./importarHorarios.ts";
import {
  aplicarDetalhesSuap,
  aplicarImportacao,
  planejarImportacao,
  type DetalheDoDiario,
  type ItemImportacao,
  type ResultadoImportacao,
} from "./importarSuap.ts";
import { importarProvasSuap, type ResultadoProvasSuap } from "./provasSuap.ts";

/** O que veio junto com o boletim na busca automática. */
export interface ExtrasSuap {
  horarios: HorariosSuap | null;
  calendario: SemestrePacote | null;
  /** "Detalhar" de cada disciplina (as avaliações e a forma de cálculo). */
  detalhes: DetalheDoDiario[];
}

export const SEM_EXTRAS: ExtrasSuap = { horarios: null, calendario: null, detalhes: [] };

type Periodo = { ano: number; periodo: number } | null;

/** Mesmo período, ou não dá para saber (aí aceita). */
export function mesmoPeriodo(a: Periodo, b: Periodo): boolean {
  return !a || !b || (a.ano === b.ano && a.periodo === b.periodo);
}

/** Calendário do SUAP só vale se for do mesmo período do semestre (aqui é preciso saber). */
export function calendarioServe(calendario: SemestrePacote | null, semestre: Pick<Semestre, "nome">): boolean {
  const doSemestre = periodoDoNome(semestre.nome);
  const doCalendario = calendario ? periodoDoNome(calendario.periodo) : null;
  return !!doSemestre && !!doCalendario && doSemestre.ano === doCalendario.ano && doSemestre.periodo === doCalendario.periodo;
}

/** Uma nota que apareceu (ou mudou) desde a última atualização. */
export interface NotaNova {
  disciplinaId: string;
  /** "Prova 2", "Etapa 1"... */
  descricao: string;
  nota: number;
}

/**
 * Compara o retrato do SUAP antes e depois. Na primeira vez que uma
 * disciplina recebe notas, nada conta como novidade (seria tudo "novo").
 * Com o "Detalhar", a novidade é por avaliação; sem ele, por etapa do boletim.
 */
export function notasNovas(antes: readonly Disciplina[], depois: readonly Disciplina[]): NotaNova[] {
  const novas: NotaNova[] = [];
  for (const d of depois) {
    const anterior = antes.find((a) => a.id === d.id)?.suap;
    if (!anterior || !d.suap) continue;

    if (d.suap.detalhe && anterior.detalhe) {
      const notaAntes = new Map<string, number | null>();
      for (const e of anterior.detalhe.etapas) for (const a of e.avaliacoes) notaAntes.set(`${e.numero}:${a.sigla}`, a.nota);
      for (const e of d.suap.detalhe.etapas) {
        for (const a of e.avaliacoes) {
          if (a.nota !== null && notaAntes.get(`${e.numero}:${a.sigla}`) !== a.nota) {
            novas.push({ disciplinaId: d.id, descricao: a.descricao ?? a.tipo ?? a.sigla, nota: a.nota });
          }
        }
      }
      continue;
    }
    for (const e of d.suap.etapas) {
      const antes = anterior.etapas.find((x) => x.numero === e.numero)?.nota ?? null;
      if (e.nota !== null && e.nota !== antes) novas.push({ disciplinaId: d.id, descricao: `Etapa ${e.numero}`, nota: e.nota });
    }
  }
  return novas;
}

export interface ResultadoSincronizacaoSuap {
  importacao: ResultadoImportacao;
  horarios: ResultadoHorarios | null;
  provas: ResultadoProvasSuap;
  notasNovas: NotaNova[];
}

/**
 * Aplica tudo o que veio do SUAP no semestre: disciplinas (boletim), horários,
 * "Detalhar", calendário acadêmico e, por fim, as provas e trabalhos com data
 * (que usam os horários para saber a hora). Horários e calendário de outro
 * período são ignorados. `plano` permite usar o que a prévia mostrou.
 */
export async function sincronizarSuap(
  banco: Banco,
  semestre: Semestre,
  boletim: BoletimSuap,
  extras: ExtrasSuap,
  opcoes: { plano?: readonly ItemImportacao[]; cores?: readonly string[]; agora?: Date } = {},
): Promise<ResultadoSincronizacaoSuap> {
  const antes = await repoDisciplinas.listar(banco, semestre.id);
  const plano = opcoes.plano ?? planejarImportacao(boletim, antes);
  const cores = opcoes.cores ?? [];
  // As cores novas continuam o rodízio a partir das disciplinas que já existem.
  const rodizio = cores.length > 0 ? [...cores.slice(antes.length % cores.length), ...cores] : [];

  const importacao = await aplicarImportacao(banco, semestre.id, boletim, plano, rodizio);
  // Depois das disciplinas: os horários precisam delas já criadas para casar.
  const grade = extras.horarios && mesmoPeriodo(extras.horarios.periodo, periodoDoNome(semestre.nome)) ? extras.horarios : null;
  const horarios = grade ? await importarHorarios(banco, semestre.id, grade) : null;
  // O detalhamento casa pelo número do diário, gravado logo acima pelo boletim.
  if (extras.detalhes.length > 0) await aplicarDetalhesSuap(banco, semestre.id, extras.detalhes);
  if (extras.calendario && calendarioServe(extras.calendario, semestre)) {
    await repoCalendario.aplicarPacote(banco, semestre, "suap", extras.calendario);
  }

  const depois = await repoDisciplinas.listar(banco, semestre.id);
  const provas = await importarProvasSuap(
    banco,
    depois,
    await repoHorarios.listarDoSemestre(banco, semestre.id),
    await repoCalendario.listar(banco, semestre.id),
    opcoes.agora,
  );
  return { importacao, horarios, provas, notasNovas: notasNovas(antes, depois) };
}
