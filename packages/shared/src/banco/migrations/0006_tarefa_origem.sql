-- Better Student: de onde veio cada tarefa.
--
-- Tarefas importadas (do Moodle, por enquanto) guardam a origem e o id lá,
-- para que importar de novo ATUALIZE a mesma tarefa em vez de duplicar.
-- O índice único é "parcial": vale só para importadas e não excluídas.

ALTER TABLE tarefa ADD COLUMN origem TEXT;      -- NULL = criada no app; 'moodle'
ALTER TABLE tarefa ADD COLUMN origem_id TEXT;   -- id do evento na origem
ALTER TABLE tarefa ADD COLUMN url TEXT;         -- link para abrir na origem

CREATE UNIQUE INDEX uq_tarefa_origem ON tarefa(origem, origem_id)
  WHERE origem IS NOT NULL AND excluido_em IS NULL;
