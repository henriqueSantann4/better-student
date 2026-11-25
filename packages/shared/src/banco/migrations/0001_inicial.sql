-- Better Student: esquema inicial (fase 1, MVP desktop).
--
-- Convenções:
--   * id: UUID em TEXT, gerado pelo app (permite criar registros offline).
--   * Datas: TEXT em ISO 8601. "YYYY-MM-DD" para dias, ISO completo para data e hora.
--   * Booleanos: INTEGER 0/1.
--   * criado_em / atualizado_em / excluido_em em toda tabela sincronizável.
--     excluido_em != NULL é exclusão lógica ("tombstone"), usada pela sincronização.
--   * Valores derivados (média, situação, faltas restantes) NÃO são guardados:
--     são calculados em packages/shared/src/regras.
--
-- Regra de ouro: uma migration já publicada nunca é editada. Mudanças viram 0002, 0003...

-- Chave/valor para configurações gerais (semestre atual, pasta de materiais,
-- lembretes padrão por tipo de tarefa). O valor é JSON.
CREATE TABLE configuracao (
  chave         TEXT PRIMARY KEY,
  valor         TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- Cada semestre guarda a própria cópia das regras acadêmicas, para que uma
-- mudança de regra não altere o cálculo de semestres antigos.
CREATE TABLE semestre (
  id                TEXT PRIMARY KEY,
  nome              TEXT NOT NULL,
  inicio            TEXT NOT NULL,
  fim               TEXT NOT NULL,
  frequencia_minima REAL NOT NULL DEFAULT 0.75 CHECK (frequencia_minima BETWEEN 0 AND 1),
  media_aprovacao   REAL NOT NULL DEFAULT 6,
  media_minima_ifa  REAL NOT NULL DEFAULT 4,
  nota_minima_ifa   REAL NOT NULL DEFAULT 6,  -- provisório: questão em aberto
  teto_apos_ifa     REAL NOT NULL DEFAULT 6,
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT NOT NULL,
  excluido_em       TEXT,
  CHECK (fim >= inicio)
);

CREATE TABLE disciplina (
  id                TEXT PRIMARY KEY,
  semestre_id       TEXT NOT NULL REFERENCES semestre(id),
  nome              TEXT NOT NULL,
  sigla             TEXT,
  professor         TEXT,
  total_aulas       INTEGER NOT NULL CHECK (total_aulas > 0),
  -- NULL = usa a frequência mínima do semestre.
  frequencia_minima REAL CHECK (frequencia_minima BETWEEN 0 AND 1),
  cor               TEXT,
  -- NULL = não fez IFA.
  nota_ifa          REAL,
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT NOT NULL,
  excluido_em       TEXT
);
CREATE INDEX idx_disciplina_semestre ON disciplina(semestre_id);

-- Um encontro semanal da grade (ex.: segunda, 07:00–10:30, 4 aulas).
CREATE TABLE horario_aula (
  id               TEXT PRIMARY KEY,
  disciplina_id    TEXT NOT NULL REFERENCES disciplina(id),
  dia_semana       INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo
  inicio           TEXT NOT NULL, -- "HH:MM"
  fim              TEXT NOT NULL, -- "HH:MM"
  quantidade_aulas INTEGER NOT NULL CHECK (quantidade_aulas > 0),
  sala             TEXT,
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL,
  excluido_em      TEXT,
  CHECK (fim > inicio)
);
CREATE INDEX idx_horario_disciplina ON horario_aula(disciplina_id);
CREATE INDEX idx_horario_dia ON horario_aula(dia_semana);

-- Feriados, recessos, semanas de prova, início e fim de aulas.
CREATE TABLE evento_calendario (
  id             TEXT PRIMARY KEY,
  semestre_id    TEXT NOT NULL REFERENCES semestre(id),
  tipo           TEXT NOT NULL CHECK (tipo IN ('feriado', 'recesso', 'semana_provas', 'inicio_aulas', 'fim_aulas', 'outro')),
  titulo         TEXT NOT NULL,
  data_inicio    TEXT NOT NULL,
  data_fim       TEXT NOT NULL,
  suspende_aulas INTEGER NOT NULL DEFAULT 0 CHECK (suspende_aulas IN (0, 1)),
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL,
  excluido_em    TEXT,
  CHECK (data_fim >= data_inicio)
);
CREATE INDEX idx_evento_semestre ON evento_calendario(semestre_id, data_inicio);

-- Uma falta num encontro. quantidade_aulas é COPIADA do horário no momento do
-- registro: se a grade mudar depois, as faltas antigas mantêm o valor. Também
-- permite falta parcial (saiu no meio da aula).
CREATE TABLE falta (
  id               TEXT PRIMARY KEY,
  disciplina_id    TEXT NOT NULL REFERENCES disciplina(id),
  data             TEXT NOT NULL, -- "YYYY-MM-DD"
  horario_aula_id  TEXT REFERENCES horario_aula(id),
  quantidade_aulas INTEGER NOT NULL CHECK (quantidade_aulas > 0),
  observacao       TEXT,
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL,
  excluido_em      TEXT
);
CREATE INDEX idx_falta_disciplina ON falta(disciplina_id);
-- Impede lançar a mesma falta duas vezes. É "parcial" (WHERE) para que uma
-- falta excluída logicamente não bloqueie um novo lançamento.
CREATE UNIQUE INDEX uq_falta_encontro
  ON falta(disciplina_id, data, horario_aula_id)
  WHERE excluido_em IS NULL AND horario_aula_id IS NOT NULL;

CREATE TABLE tarefa (
  id            TEXT PRIMARY KEY,
  disciplina_id TEXT REFERENCES disciplina(id),
  tipo          TEXT NOT NULL CHECK (tipo IN ('prova', 'trabalho', 'lista', 'apresentacao', 'atividade_moodle', 'outro')),
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  prazo         TEXT,
  prioridade    TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
  concluida_em  TEXT,
  -- JSON de RegraLembrete. NULL = usa o padrão do tipo (tabela configuracao).
  lembretes     TEXT,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido_em   TEXT
);
CREATE INDEX idx_tarefa_prazo ON tarefa(prazo);
CREATE INDEX idx_tarefa_disciplina ON tarefa(disciplina_id);

CREATE TABLE subtarefa (
  id            TEXT PRIMARY KEY,
  tarefa_id     TEXT NOT NULL REFERENCES tarefa(id),
  titulo        TEXT NOT NULL,
  ordem         INTEGER NOT NULL,
  concluida     INTEGER NOT NULL DEFAULT 0 CHECK (concluida IN (0, 1)),
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido_em   TEXT
);
CREATE INDEX idx_subtarefa_tarefa ON subtarefa(tarefa_id, ordem);

-- Uma avaliação da disciplina (prova, trabalho...). A média é ponderada pelo peso.
CREATE TABLE avaliacao (
  id            TEXT PRIMARY KEY,
  disciplina_id TEXT NOT NULL REFERENCES disciplina(id),
  nome          TEXT NOT NULL,
  peso          REAL NOT NULL DEFAULT 1 CHECK (peso > 0),
  nota          REAL, -- NULL = ainda não saiu
  nota_maxima   REAL NOT NULL DEFAULT 10 CHECK (nota_maxima > 0),
  data          TEXT,
  -- Liga a avaliação à tarefa da agenda, para não cadastrar a mesma prova duas vezes.
  tarefa_id     TEXT REFERENCES tarefa(id),
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido_em   TEXT,
  CHECK (nota IS NULL OR (nota >= 0 AND nota <= nota_maxima))
);
CREATE INDEX idx_avaliacao_disciplina ON avaliacao(disciplina_id);

-- Lembretes já agendados no sistema operacional. Tabela LOCAL: não é
-- sincronizada, porque cada dispositivo agenda os próprios lembretes e precisa
-- do ID que o SO devolveu para cancelá-los quando a tarefa mudar.
CREATE TABLE lembrete_agendado (
  id         TEXT PRIMARY KEY,
  tarefa_id  TEXT NOT NULL REFERENCES tarefa(id),
  dispara_em TEXT NOT NULL,
  id_no_so   TEXT,
  criado_em  TEXT NOT NULL
);
CREATE INDEX idx_lembrete_tarefa ON lembrete_agendado(tarefa_id);
