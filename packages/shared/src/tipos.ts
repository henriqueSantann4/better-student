/**
 * Tipos de domínio do Better Student.
 *
 * Espelham as tabelas de `banco/migrations` (no banco as colunas são
 * snake_case; aqui, camelCase). Todos os IDs são UUID para permitir criar
 * registros offline em vários dispositivos sem conflito.
 *
 * Valores derivados (média, situação, faltas restantes) não aparecem aqui:
 * são calculados em `regras/`.
 */

export type Uuid = string;

/** Data/hora em ISO 8601 (ex.: "2026-11-24T21:13:00-03:00"). */
export type DataHoraIso = string;

/** Só a data, em ISO 8601 (ex.: "2026-11-24"). */
export type DataIso = string;

/** Horário do dia no formato "HH:MM" (ex.: "07:00"). */
export type Hora = string;

/** Campos presentes em todo registro sincronizável. */
export interface Registro {
  id: Uuid;
  criadoEm: DataHoraIso;
  atualizadoEm: DataHoraIso;
  /** Exclusão lógica ("tombstone"), necessária para a sincronização. */
  excluidoEm: DataHoraIso | null;
}

/**
 * Regras acadêmicas de um semestre. O padrão é o do IFSP, mas tudo é
 * configurável. Cada semestre guarda a própria cópia, para que uma mudança
 * de regra não altere o cálculo dos semestres antigos.
 */
export interface RegrasAcademicas {
  /** Frequência mínima, de 0 a 1 (padrão 0.75). */
  frequenciaMinima: number;
  /** Média a partir da qual o aluno é aprovado direto (padrão 6). */
  mediaAprovacao: number;
  /** Média a partir da qual o aluno vai para o IFA em vez de reprovar (padrão 4). */
  mediaMinimaIfa: number;
  /** Nota que precisa tirar no IFA para passar (padrão provisório 6: questão em aberto). */
  notaMinimaIfa: number;
  /** Média final máxima de quem passou pelo IFA (padrão 6). */
  tetoAposIfa: number;
}

export const REGRAS_PADRAO_IFSP: Readonly<RegrasAcademicas> = {
  frequenciaMinima: 0.75,
  mediaAprovacao: 6,
  mediaMinimaIfa: 4,
  notaMinimaIfa: 6,
  tetoAposIfa: 6,
};

export interface Semestre extends Registro, RegrasAcademicas {
  /** Ex.: "2026.2" */
  nome: string;
  inicio: DataIso;
  fim: DataIso;
}

export interface Disciplina extends Registro {
  semestreId: Uuid;
  nome: string;
  sigla: string | null;
  professor: string | null;
  /** Total de aulas da disciplina no semestre (ex.: 100). Base do cálculo de faltas. */
  totalAulas: number;
  /** Frequência mínima própria, de 0 a 1. `null` = usa a do semestre. */
  frequenciaMinima: number | null;
  cor: string | null;
  /** Nota tirada no IFA. `null` = não fez IFA. */
  notaIfa: number | null;
  /** Última importação do SUAP. `null` = nunca importada. */
  suap: DadosSuap | null;
}

/**
 * "Retrato" da disciplina no SUAP, na última importação. São os números
 * oficiais (totais), separados das faltas que o app registra por data.
 */
export interface DadosSuap {
  codigo: string | null;
  diario: string | null;
  aulasCumpridas: number | null;
  faltas: number | null;
  /** Sobre as aulas já dadas, de 0 a 1 (é o que o SUAP mostra). */
  frequencia: number | null;
  situacao: string | null;
  etapas: { numero: number; nota: number | null; faltas: number | null }[];
  media: number | null;
  /** Nota da Avaliação Final (IFA). */
  naf: number | null;
  /** Média Final da Disciplina. */
  mfd: number | null;
  /** "Atualizado em" informado pelo próprio SUAP. */
  atualizadoEm: string | null;
  /** Quando o app fez a importação. */
  importadoEm: DataHoraIso;
}

export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Um encontro semanal na grade horária (ex.: segunda, 07:00–10:30, 4 aulas). */
export interface HorarioAula extends Registro {
  disciplinaId: Uuid;
  /** 0 = domingo ... 6 = sábado */
  diaSemana: DiaSemana;
  inicio: Hora;
  fim: Hora;
  /** Quantas aulas este encontro vale (uma falta no dia = esta quantidade). */
  quantidadeAulas: number;
  sala: string | null;
}

export type TipoEventoCalendario =
  | "feriado"
  | "recesso"
  | "semana_provas"
  | "inicio_aulas"
  | "fim_aulas"
  | "outro";

export interface EventoCalendario extends Registro {
  semestreId: Uuid;
  tipo: TipoEventoCalendario;
  titulo: string;
  dataInicio: DataIso;
  dataFim: DataIso;
  /** Se não há aula nesses dias (feriado, recesso). O parser usa isso. */
  suspendeAulas: boolean;
}

/**
 * Uma falta num encontro. `quantidadeAulas` é copiada do horário no momento
 * do registro, para que uma mudança na grade não altere faltas antigas.
 */
export interface Falta extends Registro {
  disciplinaId: Uuid;
  data: DataIso;
  horarioAulaId: Uuid | null;
  quantidadeAulas: number;
  observacao: string | null;
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
  /** Lembretes próprios desta tarefa. `null` = usa o padrão do tipo. */
  lembretes: RegraLembrete | null;
}

export interface Subtarefa extends Registro {
  tarefaId: Uuid;
  titulo: string;
  ordem: number;
  concluida: boolean;
}

/** Uma avaliação da disciplina. A média é ponderada pelo `peso`. */
export interface Avaliacao extends Registro {
  disciplinaId: Uuid;
  nome: string;
  peso: number;
  /** `null` = a nota ainda não saiu. */
  nota: number | null;
  /** Nota máxima da avaliação (padrão 10). A média é sempre levada para a escala 0–10. */
  notaMaxima: number;
  data: DataIso | null;
  tarefaId: Uuid | null;
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

/**
 * Lembrete já agendado no sistema operacional. Fica só no dispositivo (não é
 * sincronizado): cada aparelho agenda os próprios lembretes.
 */
export interface LembreteAgendado {
  id: Uuid;
  tarefaId: Uuid;
  disparaEm: DataHoraIso;
  /** ID devolvido pelo SO, usado para cancelar o lembrete. */
  idNoSo: string | null;
  criadoEm: DataHoraIso;
}
