import type { Disciplina, Semestre } from "../tipos.ts";
import type { Banco } from "../banco/banco.ts";
import { disciplinas as repoDisciplinas } from "../banco/disciplinas.ts";
import type { NovoSemestre } from "../banco/semestres.ts";
import { estimarDatas, nomeDoPeriodo, periodoDaData, periodoDoNome } from "../regras/semestre.ts";
import { normalizar, type BoletimSuap, type DisciplinaSuap } from "./boletimSuap.ts";
import type { DetalheNotasSuap } from "./detalheNotasSuap.ts";

export interface ItemImportacao {
  suap: DisciplinaSuap;
  /** Disciplina do app que corresponde a esta do SUAP. `null` = será criada. */
  existente: Disciplina | null;
}

/**
 * Casa cada disciplina do boletim com uma do semestre, nesta ordem:
 * 1. pelo código do SUAP já gravado numa importação anterior;
 * 2. pela sigla igual ao código;
 * 3. pelo nome, ignorando acentos e maiúsculas.
 * Cada disciplina do app só pode ser usada uma vez.
 */
export function planejarImportacao(boletim: BoletimSuap, existentes: readonly Disciplina[]): ItemImportacao[] {
  const livres = [...existentes];
  const tirar = (achou: (d: Disciplina) => boolean) => {
    const i = livres.findIndex(achou);
    return i >= 0 ? livres.splice(i, 1)[0]! : null;
  };

  return boletim.disciplinas.map((suap) => {
    const codigo = suap.codigo ? normalizar(suap.codigo) : null;
    const existente =
      (codigo && tirar((d) => d.suap?.codigo != null && normalizar(d.suap.codigo) === codigo)) ||
      (codigo && tirar((d) => d.sigla != null && normalizar(d.sigla) === codigo)) ||
      tirar((d) => normalizar(d.nome) === normalizar(suap.nome)) ||
      null;
    return { suap, existente };
  });
}

/**
 * Confere se o boletim é do mesmo período do semestre ("2026/2" × "2026.2").
 * `null` quando não dá para saber (ex.: semestre com nome livre).
 */
export function periodoConfere(boletim: BoletimSuap, semestre: Pick<Semestre, "nome">): boolean | null {
  const doNome = periodoDoNome(semestre.nome);
  if (!boletim.periodo || !doNome) return null;
  return doNome.ano === boletim.periodo.ano && doNome.periodo === boletim.periodo.periodo;
}

/**
 * Semestre a criar a partir do boletim, para quem começa pelo SUAP: o nome
 * vem do período do boletim ("2026/2" → "2026.2") e as datas são estimadas,
 * porque o boletim não informa início nem fim das aulas.
 */
export function semestreDoBoletim(boletim: BoletimSuap, hoje: Date = new Date()): NovoSemestre {
  const periodo = boletim.periodo ?? periodoDaData(hoje);
  return { nome: nomeDoPeriodo(periodo), ...estimarDatas(periodo), datasEstimadas: true };
}

export interface ResultadoImportacao {
  criadas: number;
  atualizadas: number;
  /** Disciplinas sem total de aulas no boletim, que não puderam ser criadas. */
  ignoradas: string[];
}

/**
 * Aplica o plano: cria as disciplinas novas, atualiza o total de aulas das
 * existentes (o SUAP é a fonte oficial) e grava o retrato do SUAP em todas.
 * As faltas registradas no app NÃO são alteradas.
 */
export async function aplicarImportacao(
  banco: Banco,
  semestreId: string,
  boletim: BoletimSuap,
  plano: readonly ItemImportacao[],
  cores: readonly string[] = [],
): Promise<ResultadoImportacao> {
  const resultado: ResultadoImportacao = { criadas: 0, atualizadas: 0, ignoradas: [] };
  let indiceCor = 0;

  for (const { suap, existente } of plano) {
    let id: string;
    if (existente) {
      id = existente.id;
      if (suap.aulasPrevistas && suap.aulasPrevistas !== existente.totalAulas) {
        await repoDisciplinas.atualizar(banco, id, { ...existente, totalAulas: suap.aulasPrevistas });
      }
      resultado.atualizadas++;
    } else {
      if (!suap.aulasPrevistas) {
        resultado.ignoradas.push(suap.nome);
        continue;
      }
      id = await repoDisciplinas.criar(banco, semestreId, {
        nome: suap.nome,
        totalAulas: suap.aulasPrevistas,
        cor: cores.length > 0 ? cores[indiceCor++ % cores.length]! : null,
      });
      resultado.criadas++;
    }

    await repoDisciplinas.gravarSuap(banco, id, {
      codigo: suap.codigo,
      diario: suap.diario,
      aulasCumpridas: suap.aulasCumpridas,
      faltas: suap.faltas,
      frequencia: suap.frequencia,
      situacao: suap.situacao,
      etapas: suap.etapas,
      media: suap.media,
      naf: suap.naf,
      mfd: suap.mfd,
      atualizadoEm: boletim.atualizadoEm,
    });
  }
  return resultado;
}

/** Um "Detalhar" lido, com o número do diário da linha do boletim de onde veio. */
export interface DetalheDoDiario {
  diario: string;
  detalhe: DetalheNotasSuap;
}

/**
 * Grava o detalhamento das notas em cada disciplina do semestre, casando pelo
 * número do diário (gravado pela importação do boletim). Devolve quantas
 * disciplinas receberam o detalhamento.
 */
export async function aplicarDetalhesSuap(
  banco: Banco,
  semestreId: string,
  detalhes: readonly DetalheDoDiario[],
): Promise<number> {
  const lista = await repoDisciplinas.listar(banco, semestreId);
  let gravados = 0;
  for (const { diario, detalhe } of detalhes) {
    const disciplina = lista.find((d) => d.suap?.diario === diario);
    if (!disciplina) continue;
    await repoDisciplinas.gravarDetalheSuap(banco, disciplina.id, detalhe);
    gravados++;
  }
  return gravados;
}

