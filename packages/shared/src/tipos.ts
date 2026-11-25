/**
 * Tipos de domínio do Better Student.
 *
 * Rascunho inicial: o modelo de dados definitivo (tabelas do SQLite) será
 * desenhado na próxima etapa. Todos os IDs são UUID para permitir criar
 * registros offline em vários dispositivos sem conflito.
 */

export type Uuid = string;

/** Data/hora em ISO 8601 (ex.: "2026-11-24T21:13:00-03:00"). */
export type DataHoraIso = string;

/** Campos presentes em todo registro sincronizável. */
export interface Registro {
  id: Uuid;
  criadoEm: DataHoraIso;
  atualizadoEm: DataHoraIso;
  /** Exclusão lógica ("tombstone"), necessária para a sincronização. */
  excluidoEm: DataHoraIso | null;
}

export interface Semestre extends Registro {
  /** Ex.: "2026.2" */
  nome: string;
  inicio: DataHoraIso;
  fim: DataHoraIso;
  atual: boolean;
}

export interface Disciplina extends Registro {
  semestreId: Uuid;
  nome: string;
  sigla: string | null;
  professor: string | null;
  /** Total de aulas da disciplina no semestre (ex.: 100). Base do cálculo de faltas. */
  totalAulas: number;
  /** Frequência mínima exigida, de 0 a 1 (padrão 0.75). */
  frequenciaMinima: number;
  cor: string | null;
}

/** Um encontro semanal na grade horária (ex.: segunda, 07:00–10:30, 4 aulas). */
export interface HorarioAula extends Registro {
  disciplinaId: Uuid;
  /** 0 = domingo ... 6 = sábado */
  diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** "HH:mm" */
  inicio: string;
  fim: string;
  /** Quantas aulas este encontro vale (uma falta no dia = esta quantidade). */
  quantidadeAulas: number;
  sala: string | null;
}

export type TipoTarefa =
  | "prova"
  | "trabalho"
  | "lista"
  | "apresentacao"
  | "atividade_moodle"
  | "outro";

export type Prioridade = "baixa" | "media" | "alta";

export interface Tarefa extends Registro {
  disciplinaId: Uuid | null;
  tipo: TipoTarefa;
  titulo: string;
  descricao: string | null;
  prazo: DataHoraIso | null;
  prioridade: Prioridade;
  concluidaEm: DataHoraIso | null;
}

export interface Subtarefa extends Registro {
  tarefaId: Uuid;
  titulo: string;
  ordem: number;
  concluida: boolean;
}

/**
 * Regra de lembrete. Exemplo: 3 lembretes, começando 3 dias antes,
 * um por dia → { quantidade: 3, inicioAntesMinutos: 3 * 24 * 60, intervaloMinutos: 24 * 60 }.
 */
export interface RegraLembrete {
  quantidade: number;
  inicioAntesMinutos: number;
  intervaloMinutos: number;
}
