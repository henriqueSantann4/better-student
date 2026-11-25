/**
 * Moodle: leitura das respostas da API oficial (a mesma do app "Moodle").
 * Aqui só ficam tipos e conversões, sem rede: a chamada em si é do desktop.
 *
 * Funções usadas (todas só de leitura):
 * - core_webservice_get_site_info → quem é o usuário e qual o site;
 * - core_enrol_get_users_courses → disciplinas em que está inscrito;
 * - core_calendar_get_action_events_by_timesort → atividades com prazo
 *   (tarefas, questionários, fóruns), as mesmas da "Linha do tempo".
 */

import { textoDe } from "../importacao/html.ts";

export interface InfoSite {
  nomeSite: string;
  nomeUsuario: string;
  idUsuario: number;
}

export interface DisciplinaMoodle {
  id: number;
  nome: string;
  sigla: string;
  /** Progresso de 0 a 100, quando o curso usa conclusão de atividades. */
  progresso: number | null;
}

export interface AtividadeMoodle {
  id: number;
  nome: string;
  /** Tipo do módulo: "assign" (tarefa), "quiz" (questionário), "forum"... */
  tipo: string;
  disciplina: string;
  disciplinaId: number | null;
  /** Prazo em ISO 8601. */
  prazo: string;
  /** Link da atividade no Moodle. */
  url: string;
  /** Texto da ação pendente, quando o Moodle informa (ex.: "Adicionar envio"). */
  acao: string | null;
}

/** Erro que a API do Moodle devolve no corpo (com HTTP 200). */
export class ErroMoodle extends Error {
  readonly codigo: string;

  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroMoodle";
    this.codigo = codigo;
  }
}

/** A API do Moodle responde 200 mesmo com erro; o erro vem em `exception`. */
export function conferirResposta<T>(resposta: unknown): T {
  const r = resposta as { exception?: string; errorcode?: string; message?: string } | null;
  if (r && typeof r === "object" && "exception" in r && r.exception) {
    throw new ErroMoodle(r.errorcode ?? "desconhecido", r.message ?? "erro no Moodle");
  }
  return resposta as T;
}

/** Textos do Moodle vêm com tags e entidades HTML (ex.: "Programa&ccedil;&atilde;o"). */
function limparTexto(texto: unknown): string {
  return textoDe(String(texto ?? ""));
}

export function lerInfoSite(resposta: unknown): InfoSite {
  const r = conferirResposta<{ sitename?: string; fullname?: string; userid?: number }>(resposta);
  return { nomeSite: limparTexto(r.sitename), nomeUsuario: limparTexto(r.fullname), idUsuario: Number(r.userid ?? 0) };
}

export function lerDisciplinasMoodle(resposta: unknown): DisciplinaMoodle[] {
  const lista = conferirResposta<Array<Record<string, unknown>>>(resposta);
  return (Array.isArray(lista) ? lista : [])
    .map((c) => ({
      id: Number(c.id),
      nome: limparTexto(c.displayname ?? c.fullname),
      sigla: limparTexto(c.shortname),
      progresso: typeof c.progress === "number" ? Math.round(c.progress) : null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

interface EventoBruto {
  id: number;
  name?: string;
  activityname?: string;
  modulename?: string;
  timesort?: number;
  url?: string;
  course?: { id?: number; fullname?: string; shortname?: string };
  action?: { name?: string; actionable?: boolean } | null;
}

/** Atividades com prazo, da mais próxima para a mais distante. */
export function lerAtividadesMoodle(resposta: unknown): AtividadeMoodle[] {
  const r = conferirResposta<{ events?: EventoBruto[] }>(resposta);
  return (r.events ?? [])
    .filter((e) => typeof e.timesort === "number")
    .map((e) => ({
      id: e.id,
      nome: limparTexto(e.activityname || e.name),
      tipo: e.modulename ?? "outro",
      disciplina: limparTexto(e.course?.fullname ?? ""),
      disciplinaId: e.course?.id ?? null,
      prazo: new Date(e.timesort! * 1000).toISOString(),
      url: e.url ?? "",
      acao: e.action?.actionable ? limparTexto(e.action.name) || null : null,
    }))
    .sort((a, b) => a.prazo.localeCompare(b.prazo));
}

/**
 * Parâmetros no formato que a API REST do Moodle espera: listas viram
 * `chave[0]=...`, objetos viram `chave[campo]=...`.
 */
export function parametrosMoodle(dados: Record<string, unknown>, prefixo = ""): [string, string][] {
  const pares: [string, string][] = [];
  for (const [chave, valor] of Object.entries(dados)) {
    const nome = prefixo ? `${prefixo}[${chave}]` : chave;
    if (valor === undefined || valor === null) continue;
    if (Array.isArray(valor)) {
      valor.forEach((item, i) => {
        if (item !== null && typeof item === "object") pares.push(...parametrosMoodle(item as Record<string, unknown>, `${nome}[${i}]`));
        else pares.push([`${nome}[${i}]`, String(item)]);
      });
    } else if (typeof valor === "object") {
      pares.push(...parametrosMoodle(valor as Record<string, unknown>, nome));
    } else {
      pares.push([nome, typeof valor === "boolean" ? (valor ? "1" : "0") : String(valor)]);
    }
  }
  return pares;
}
