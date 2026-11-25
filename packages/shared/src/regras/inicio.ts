/**
 * Regras da tela Início: qual dia de aula mostrar e quais prazos vêm primeiro.
 */
import type { DataIso, EventoCalendario, HorarioAula, Tarefa, TipoTarefa } from "../tipos.ts";
import { deDataIso, hojeIso, paraDataIso } from "../datas.ts";
import { aulasDoDia, type DiaLetivo } from "./calendario.ts";

/** "HH:MM" do momento, no fuso local (compara direto com o início/fim das aulas). */
function horaDe(agora: Date): string {
  return `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
}

export interface DiaDeAulas {
  data: DataIso;
  /** Quantos dias depois de hoje (0 = hoje, 1 = amanhã...). */
  distancia: number;
  dia: DiaLetivo;
  aulas: HorarioAula[];
}

/**
 * O dia de aula que interessa agora: hoje, enquanto ainda houver aula para
 * acontecer (ou acontecendo); quando a última aula de hoje termina, passa a
 * ser o próximo dia com aula, pulando fim de semana, feriado e recesso.
 * Não passa do fim do semestre (`ate`).
 */
export function proximoDiaDeAulas(
  agora: Date,
  horarios: readonly HorarioAula[],
  eventos: readonly EventoCalendario[],
  ate: DataIso | null = null,
  limiteDias = 21,
): DiaDeAulas | null {
  const hoje = deDataIso(hojeIso(agora));
  const hora = horaDe(agora);
  for (let distancia = 0; distancia <= limiteDias; distancia++) {
    const data = paraDataIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + distancia));
    if (ate && data > ate) return null;
    const { dia, aulas } = aulasDoDia(data, horarios, eventos);
    if (aulas.length === 0) continue;
    if (distancia === 0 && aulas.every((a) => a.fim <= hora)) continue; // as de hoje já acabaram
    return { data, distancia, dia, aulas: [...aulas].sort((a, b) => a.inicio.localeCompare(b.inicio)) };
  }
  return null;
}

export type EstadoAula = "encerrada" | "agora" | "depois";

/** Situação de uma aula de hoje em relação ao momento atual. */
export function estadoDaAula(aula: Pick<HorarioAula, "inicio" | "fim">, agora: Date): EstadoAula {
  const hora = horaDe(agora);
  if (aula.fim <= hora) return "encerrada";
  if (aula.inicio <= hora) return "agora";
  return "depois";
}

/** As três filas da tela Início. */
export type FilaPrazo = "provas" | "trabalhos" | "tarefas";

export function filaDoTipo(tipo: TipoTarefa): FilaPrazo {
  if (tipo === "prova") return "provas";
  if (tipo === "trabalho" || tipo === "apresentacao") return "trabalhos";
  return "tarefas";
}

export interface ProximosPrazos {
  provas: Tarefa[];
  trabalhos: Tarefa[];
  tarefas: Tarefa[];
  /** Pendentes com prazo já vencido (aparecem como aviso, não nas filas). */
  atrasadas: Tarefa[];
}

/** As `quantidade` próximas de cada fila, só as pendentes com prazo daqui em diante. */
export function proximosPrazos(tarefas: readonly Tarefa[], agora: Date, quantidade = 2): ProximosPrazos {
  const pendentes = tarefas
    .filter((t) => t.excluidoEm === null && t.concluidaEm === null && t.prazo !== null)
    .sort((a, b) => a.prazo!.localeCompare(b.prazo!));
  const momento = agora.getTime();
  const futuras = pendentes.filter((t) => new Date(t.prazo!).getTime() >= momento);
  const fila = (f: FilaPrazo) => futuras.filter((t) => filaDoTipo(t.tipo) === f).slice(0, quantidade);
  return {
    provas: fila("provas"),
    trabalhos: fila("trabalhos"),
    tarefas: fila("tarefas"),
    atrasadas: pendentes.filter((t) => new Date(t.prazo!).getTime() < momento),
  };
}
