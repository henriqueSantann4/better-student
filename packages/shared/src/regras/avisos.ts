/**
 * Avisos que pedem atenção (faltas, atrasadas, evento na semana) e o "visto"
 * de cada um.
 *
 * O aluno pode dar o check num aviso para ele sumir. Cada aviso tem um
 * `nivel` que cresce quando a situação piora (mais uma falta, mais uma tarefa
 * atrasada): dispensado num nível, ele só volta se passar desse nível.
 */
import type { Disciplina, EventoCalendario, Falta, HorarioAula, Semestre, Tarefa } from "../tipos.ts";
import type { Banco } from "../banco/banco.ts";
import { configuracao } from "../banco/configuracao.ts";
import { hojeIso } from "../datas.ts";
import { proximosEventos } from "./calendario.ts";
import { nivelFaltas, resumirFaltas } from "./faltas.ts";
import { proximosPrazos } from "./inicio.ts";

/** Eventos do calendário que valem um aviso na semana. */
const EVENTOS_AVISO = new Set(["feriado", "recesso", "sabado_letivo", "prazo", "prova_final", "semana_provas"]);

export type MotivoAviso = "reprovadoFalta" | "noLimite" | "pertoLimite" | "atrasadas" | "evento";

export interface Aviso {
  /** Identifica o aviso entre uma abertura e outra (ex.: "f-<disciplina>"). */
  chave: string;
  /** Cresce quando a situação piora. */
  nivel: number;
  gravidade: "perigo" | "atencao" | "info";
  motivo: MotivoAviso;
  destino: "faltas" | "agenda" | "calendario";
  disciplina?: Disciplina;
  /** Quantas tarefas atrasadas. */
  quantidade?: number;
  evento?: EventoCalendario;
}

export interface DadosAvisos {
  semestre: Semestre;
  disciplinas: readonly Disciplina[];
  horarios: readonly HorarioAula[];
  faltas: readonly Falta[];
  eventos: readonly EventoCalendario[];
  tarefas: readonly Tarefa[];
}

/** Todos os avisos de agora, os mais graves primeiro. */
export function avisosDoMomento(dados: DadosAvisos, agora: Date): Aviso[] {
  const avisos: Aviso[] = [];

  // Faltas: reprovado ou perto do limite. O nível é o número de faltas.
  for (const d of dados.disciplinas) {
    const resumo = resumirFaltas(d, dados.faltas.filter((f) => f.disciplinaId === d.id), dados.semestre, d.suap?.faltas ?? null);
    const porEncontro = Math.max(0, ...dados.horarios.filter((h) => h.disciplinaId === d.id).map((h) => h.quantidadeAulas));
    const nivel = nivelFaltas(resumo, porEncontro);
    if (nivel === "reprovado") {
      avisos.push({ chave: `f-${d.id}`, nivel: resumo.faltas, gravidade: "perigo", motivo: "reprovadoFalta", destino: "faltas", disciplina: d });
    } else if (nivel === "atencao") {
      const motivo = resumo.restantes === 0 ? "noLimite" : "pertoLimite";
      avisos.push({ chave: `f-${d.id}`, nivel: resumo.faltas, gravidade: "atencao", motivo, destino: "faltas", disciplina: d });
    }
  }

  // Atrasadas: o nível é o prazo da mais recente, então uma nova atrasada traz o aviso de volta.
  const { atrasadas } = proximosPrazos(dados.tarefas, agora);
  if (atrasadas.length > 0) {
    const maisRecente = Math.max(...atrasadas.map((t) => Date.parse(t.prazo!)));
    avisos.push({ chave: "atrasadas", nivel: maisRecente, gravidade: "perigo", motivo: "atrasadas", destino: "agenda", quantidade: atrasadas.length });
  }

  // Calendário: o próximo evento importante dos próximos 7 dias.
  const hoje = hojeIso(agora);
  const daquiUmaSemana = hojeIso(new Date(agora.getTime() + 7 * 86_400_000));
  const evento = proximosEventos(dados.eventos, hoje, 20).find((e) => EVENTOS_AVISO.has(e.tipo) && e.dataInicio <= daquiUmaSemana);
  if (evento) avisos.push({ chave: `e-${evento.id}`, nivel: 1, gravidade: "info", motivo: "evento", destino: "calendario", evento });

  const ordem = { perigo: 0, atencao: 1, info: 2 };
  return avisos.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
}

/** Nível em que cada aviso foi dispensado. */
export type AvisosDispensados = Record<string, number>;

/** Tira os avisos que o aluno já viu, a não ser que tenham piorado. */
export function semDispensados(avisos: readonly Aviso[], dispensados: AvisosDispensados): Aviso[] {
  return avisos.filter((a) => !(a.chave in dispensados) || a.nivel > dispensados[a.chave]!);
}

export async function lerAvisosDispensados(banco: Banco): Promise<AvisosDispensados> {
  return (await configuracao.ler<AvisosDispensados>(banco, "avisosDispensados")) ?? {};
}

/**
 * Marca avisos como vistos. Aproveita para esquecer dispensas de avisos que
 * já não existem (ex.: evento que passou), para a lista não crescer sem fim.
 */
export async function dispensarAvisos(banco: Banco, vistos: readonly Aviso[], atuais: readonly Aviso[]): Promise<AvisosDispensados> {
  const antes = await lerAvisosDispensados(banco);
  const existem = new Set(atuais.map((a) => a.chave));
  const depois: AvisosDispensados = {};
  for (const [chave, nivel] of Object.entries(antes)) if (existem.has(chave)) depois[chave] = nivel;
  for (const a of vistos) depois[a.chave] = a.nivel;
  await configuracao.gravar(banco, "avisosDispensados", depois);
  return depois;
}
