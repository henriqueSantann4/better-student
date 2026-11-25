-- Better Student: "retrato" do SUAP em cada disciplina.
--
-- O SUAP informa TOTAIS por disciplina (faltas, aulas dadas, notas por
-- etapa), enquanto o app registra cada falta com a data. São dados de
-- naturezas diferentes, então ficam separados: as colunas suap_* guardam a
-- última importação, e as faltas do app continuam na tabela `falta`.
--
-- Todas são opcionais: disciplinas criadas à mão, ou de outras instituições,
-- simplesmente ficam com NULL. (O SQLite só aceita uma coluna por ALTER TABLE.)

ALTER TABLE disciplina ADD COLUMN suap_codigo TEXT;          -- ex.: "XYZALP1"
ALTER TABLE disciplina ADD COLUMN suap_diario TEXT;          -- número do diário (turma)
ALTER TABLE disciplina ADD COLUMN suap_aulas_cumpridas INTEGER;
ALTER TABLE disciplina ADD COLUMN suap_faltas INTEGER;
ALTER TABLE disciplina ADD COLUMN suap_frequencia REAL;      -- sobre as aulas já dadas, de 0 a 1
ALTER TABLE disciplina ADD COLUMN suap_situacao TEXT;        -- ex.: "Cursando (Aguarda Carga Horária)"
ALTER TABLE disciplina ADD COLUMN suap_etapas TEXT;          -- JSON: [{ numero, nota, faltas }]
ALTER TABLE disciplina ADD COLUMN suap_media REAL;
ALTER TABLE disciplina ADD COLUMN suap_naf REAL;             -- nota da avaliação final (IFA)
ALTER TABLE disciplina ADD COLUMN suap_mfd REAL;             -- média final da disciplina
ALTER TABLE disciplina ADD COLUMN suap_atualizado_em TEXT;   -- "Atualizado em" do próprio SUAP
ALTER TABLE disciplina ADD COLUMN suap_importado_em TEXT;    -- quando o app importou (NULL = nunca)
