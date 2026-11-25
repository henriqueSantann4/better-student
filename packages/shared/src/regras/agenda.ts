import type { Tarefa } from "../tipos.ts";
import { deDataIso, paraDataIso } from "../datas.ts";

export type GrupoAgenda = "atrasadas" | "hoje" | "amanha" | "semana" | "depois" | "semPrazo" | "concluidas";

export const ORDEM_GRUPOS: readonly GrupoAgenda[] = ["atrasadas", "hoje", "amanha", "semana", "depois", "semPrazo", "concluidas"];

function somarDias(data: string, dias: number): string {
  const d = deDataIso(data);
  d.setDate(d.getDate() + dias);
  return paraDataIso(d);
}

/**
 * Em que grupo da Agenda a tarefa entra, pelo prazo (no fuso local):
 * atrasada (prazo já passou), hoje, amanhã, nos próximos 7 dias, depois,
 * sem prazo. Concluídas ficam à parte, qualquer que seja o prazo.
 */
export function grupoDaTarefa(tarefa: Pick<Tarefa, "prazo" | "concluidaEm">, agora: Date = new Date()): GrupoAgenda {
  if (tarefa.concluidaEm) return "concluidas";
  if (!tarefa.prazo) return "semPrazo";
  if (new Date(tarefa.prazo) < agora) return "atrasadas";
  const dia = paraDataIso(new Date(tarefa.prazo));
  const hoje = paraDataIso(agora);
  if (dia === hoje) return "hoje";
  if (dia === somarDias(hoje, 1)) return "amanha";
  if (dia <= somarDias(hoje, 7)) return "semana";
  return "depois";
}

/** Tarefas separadas por grupo, cada grupo em ordem de prazo. */
export function agruparTarefas<T extends Pick<Tarefa, "prazo" | "concluidaEm">>(
  lista: readonly T[],
  agora: Date = new Date(),
): Record<GrupoAgenda, T[]> {
  const grupos = Object.fromEntries(ORDEM_GRUPOS.map((g) => [g, [] as T[]])) as Record<GrupoAgenda, T[]>;
  for (const t of lista) grupos[grupoDaTarefa(t, agora)].push(t);
  const porPrazo = (a: T, b: T) => (a.prazo ?? "").localeCompare(b.prazo ?? "");
  for (const g of ORDEM_GRUPOS) grupos[g].sort(porPrazo);
  // Concluídas: as mais recentes primeiro.
  grupos.concluidas.sort((a, b) => (b.concluidaEm ?? "").localeCompare(a.concluidaEm ?? ""));
  return grupos;
}
