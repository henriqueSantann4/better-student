-- Better Student: calendário acadêmico completo.
--
-- A tabela evento_calendario da 0001 só aceitava alguns tipos (CHECK). O
-- SQLite não deixa alterar um CHECK, então a tabela é recriada: cria a nova,
-- copia os dados, apaga a antiga e renomeia. Nenhuma outra tabela aponta para
-- ela, então a troca é segura.
--
-- Novidades:
--   * tipos novos: prova_final, sabado_letivo, prazo, evento;
--   * segue_dia_semana: num sábado letivo, qual dia da grade vale (0–6);
--   * origem: de qual pacote de calendário o evento veio (para reimportar
--     sem duplicar). NULL = criado pelo usuário.

CREATE TABLE evento_calendario_nova (
  id               TEXT PRIMARY KEY,
  semestre_id      TEXT NOT NULL REFERENCES semestre(id),
  tipo             TEXT NOT NULL CHECK (tipo IN (
                     'feriado', 'recesso', 'inicio_aulas', 'fim_aulas', 'semana_provas',
                     'prova_final', 'sabado_letivo', 'prazo', 'evento', 'outro')),
  titulo           TEXT NOT NULL,
  data_inicio      TEXT NOT NULL,
  data_fim         TEXT NOT NULL,
  suspende_aulas   INTEGER NOT NULL DEFAULT 0 CHECK (suspende_aulas IN (0, 1)),
  segue_dia_semana INTEGER CHECK (segue_dia_semana BETWEEN 0 AND 6),
  origem           TEXT,
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL,
  excluido_em      TEXT,
  CHECK (data_fim >= data_inicio)
);

INSERT INTO evento_calendario_nova
  (id, semestre_id, tipo, titulo, data_inicio, data_fim, suspende_aulas, criado_em, atualizado_em, excluido_em)
SELECT id, semestre_id, tipo, titulo, data_inicio, data_fim, suspende_aulas, criado_em, atualizado_em, excluido_em
FROM evento_calendario;

DROP TABLE evento_calendario;
ALTER TABLE evento_calendario_nova RENAME TO evento_calendario;

CREATE INDEX idx_evento_semestre ON evento_calendario(semestre_id, data_inicio);
