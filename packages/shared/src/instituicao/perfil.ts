/**
 * Perfil de instituição: um arquivo JSON por faculdade (pasta
 * `packages/shared/instituicoes/`), com as regras acadêmicas, os sistemas
 * (SUAP, Moodle, e-mail) e os campi.
 *
 * É daqui que sai tudo o que é "da faculdade": o aluno escolhe a instituição
 * e o campus uma vez, e o app preenche o resto. Como fica num arquivo de
 * dados, incluir outra faculdade não exige mexer no código.
 */
import type { Banco } from "../banco/banco.ts";
import { configuracao } from "../banco/configuracao.ts";
import { REGRAS_PADRAO_IFSP, type RegrasAcademicas } from "../tipos.ts";

export interface EmailInstituicao {
  /** Quem hospeda o e-mail (hoje o app só sabe ler contas Google, por IMAP). */
  provedor: "google" | "microsoft" | "outro";
  /** Domínio dos alunos (ex.: "aluno.exemplo.edu.br"), para sugerir o endereço. */
  dominio: string | null;
}

export interface SistemasInstituicao {
  /** Endereço do SUAP, ou `null` se a instituição não usa. */
  suap: string | null;
  /** Endereço do Moodle, ou `null` se não usa (ou se é por campus). */
  moodle: string | null;
  email: EmailInstituicao | null;
}

export interface Campus {
  id: string;
  nome: string;
  site?: string;
  /** O que for diferente no campus (ex.: o Moodle próprio). */
  sistemas?: Partial<SistemasInstituicao>;
  /** Pacotes de calendário deste campus (ids da pasta calendarios/). */
  calendarios?: string[];
}

export interface PerfilInstituicao {
  formato: 1;
  id: string;
  sigla: string;
  nome: string;
  fonte?: string;
  observacao?: string;
  regras: RegrasAcademicas;
  /** Como a instituição chama a prova de recuperação (ex.: "IFA", "recuperação"). */
  recuperacao: string;
  /** Gênero do nome, para o texto sair certo: "o IFA" (m), "a recuperação" (f). */
  recuperacaoGenero: "m" | "f";
  sistemas: SistemasInstituicao;
  campi: Campus[];
}

/** O que o aluno escolheu, guardado na configuração "instituicao". */
export interface EscolhaInstituicao {
  instituicaoId: string;
  /** `null` = não informou o campus (ou a instituição não tem campi). */
  campusId: string | null;
}

/**
 * Para quem é de uma faculdade que ainda não tem perfil no app: regras comuns
 * (a frequência mínima de 75% é a da LDB, que vale para todo o país) e
 * nenhum sistema. Tudo pode ser ajustado em Configurações.
 */
export const PERFIL_GENERICO: PerfilInstituicao = {
  formato: 1,
  id: "outra",
  sigla: "Outra",
  nome: "Outra instituição",
  regras: { ...REGRAS_PADRAO_IFSP },
  recuperacao: "recuperação",
  recuperacaoGenero: "f",
  sistemas: { suap: null, moodle: null, email: null },
  campi: [],
};

export class ErroPerfilInstituicao extends Error {
  constructor(motivo: string) {
    super(`Perfil de instituição inválido: ${motivo}`);
    this.name = "ErroPerfilInstituicao";
  }
}

function numero(valor: unknown, nome: string): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) throw new ErroPerfilInstituicao(`${nome} inválido`);
  return valor;
}

function endereco(valor: unknown, nome: string): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string" || !/^https?:\/\//.test(valor)) throw new ErroPerfilInstituicao(`${nome} precisa ser um endereço http(s)`);
  return valor;
}

/** Confere um perfil vindo de JSON e devolve com os tipos certos. */
export function lerPerfilInstituicao(dados: unknown): PerfilInstituicao {
  const p = dados as Partial<PerfilInstituicao> & Record<string, unknown>;
  if (!p || typeof p !== "object") throw new ErroPerfilInstituicao("não é um objeto");
  if (p.formato !== 1) throw new ErroPerfilInstituicao("formato desconhecido");
  if (typeof p.id !== "string" || typeof p.nome !== "string" || typeof p.sigla !== "string") {
    throw new ErroPerfilInstituicao("faltam id, sigla ou nome");
  }
  const r = (p.regras ?? {}) as Partial<RegrasAcademicas>;
  const regras: RegrasAcademicas = {
    frequenciaMinima: numero(r.frequenciaMinima, "frequenciaMinima"),
    mediaAprovacao: numero(r.mediaAprovacao, "mediaAprovacao"),
    mediaMinimaIfa: numero(r.mediaMinimaIfa, "mediaMinimaIfa"),
    notaMinimaIfa: numero(r.notaMinimaIfa, "notaMinimaIfa"),
    tetoAposIfa: numero(r.tetoAposIfa, "tetoAposIfa"),
  };
  if (regras.frequenciaMinima > 1) throw new ErroPerfilInstituicao("frequenciaMinima vai de 0 a 1");

  const s = (p.sistemas ?? {}) as Partial<SistemasInstituicao>;
  const campi = Array.isArray(p.campi) ? p.campi : [];
  for (const c of campi) {
    if (!c || typeof c.id !== "string" || typeof c.nome !== "string") throw new ErroPerfilInstituicao("campus sem id ou nome");
    endereco(c.sistemas?.suap, `suap do campus ${c.id}`);
    endereco(c.sistemas?.moodle, `moodle do campus ${c.id}`);
  }
  if (new Set(campi.map((c) => c.id)).size !== campi.length) throw new ErroPerfilInstituicao("campi com id repetido");

  return {
    formato: 1,
    id: p.id,
    sigla: p.sigla,
    nome: p.nome,
    ...(typeof p.fonte === "string" ? { fonte: p.fonte } : {}),
    ...(typeof p.observacao === "string" ? { observacao: p.observacao } : {}),
    regras,
    recuperacao: typeof p.recuperacao === "string" && p.recuperacao ? p.recuperacao : "recuperação",
    recuperacaoGenero: p.recuperacaoGenero === "m" ? "m" : "f",
    sistemas: { suap: endereco(s.suap, "suap"), moodle: endereco(s.moodle, "moodle"), email: s.email ?? null },
    campi: [...campi].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/** Sistemas valendo para o campus: os da instituição, com o que o campus muda por cima. */
export function sistemasDoCampus(perfil: PerfilInstituicao, campus: Campus | null): SistemasInstituicao {
  return { ...perfil.sistemas, ...(campus?.sistemas ?? {}) };
}

/** Campus cujo Moodle é este endereço (para adivinhar o campus de quem já usava o app). */
export function campusPeloMoodle(perfil: PerfilInstituicao, site: string | null): Campus | null {
  if (!site) return null;
  const limpo = (url: string) => url.replace(/\/+$/, "").toLowerCase();
  return perfil.campi.find((c) => c.sistemas?.moodle && limpo(c.sistemas.moodle) === limpo(site)) ?? null;
}

/** Perfil e campus escolhidos, achados na lista de perfis conhecidos. */
export interface InstituicaoEscolhida {
  perfil: PerfilInstituicao;
  campus: Campus | null;
  sistemas: SistemasInstituicao;
}

export function resolverEscolha(perfis: readonly PerfilInstituicao[], escolha: EscolhaInstituicao): InstituicaoEscolhida {
  const perfil = perfis.find((p) => p.id === escolha.instituicaoId) ?? PERFIL_GENERICO;
  const campus = perfil.campi.find((c) => c.id === escolha.campusId) ?? null;
  return { perfil, campus, sistemas: sistemasDoCampus(perfil, campus) };
}

export async function lerEscolhaInstituicao(banco: Banco): Promise<EscolhaInstituicao | null> {
  return configuracao.ler<EscolhaInstituicao>(banco, "instituicao");
}

/**
 * Grava a escolha e já preenche os endereços dos sistemas (SUAP e Moodle)
 * com os do perfil. Quem quiser outro endereço troca depois em Configurações.
 */
export async function gravarEscolhaInstituicao(
  banco: Banco,
  perfis: readonly PerfilInstituicao[],
  escolha: EscolhaInstituicao,
): Promise<InstituicaoEscolhida> {
  const resolvida = resolverEscolha(perfis, escolha);
  await configuracao.gravar(banco, "instituicao", escolha);
  await configuracao.gravar(banco, "suapServidor", resolvida.sistemas.suap);
  await configuracao.gravar(banco, "moodleSite", resolvida.sistemas.moodle);
  return resolvida;
}

/**
 * Pedaços de texto sobre a recuperação, já com o artigo certo, para as
 * traduções: "no IFA" / "na recuperação", "para o IFA" / "para a recuperação".
 */
export function textosRecuperacao(perfil: Pick<PerfilInstituicao, "recuperacao" | "recuperacaoGenero">) {
  const r = perfil.recuperacao;
  const m = perfil.recuperacaoGenero === "m";
  return {
    recuperacao: r,
    /** Com inicial maiúscula, para começar frase ou etiqueta. */
    Recuperacao: r.charAt(0).toLocaleUpperCase("pt-BR") + r.slice(1),
    oRec: `${m ? "o" : "a"} ${r}`,
    noRec: `${m ? "no" : "na"} ${r}`,
    paraRec: `para ${m ? "o" : "a"} ${r}`,
  };
}
