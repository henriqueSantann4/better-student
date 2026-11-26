-- Better Student: provas e trabalhos que vêm do "Detalhar" do SUAP.
--
-- Uma avaliação com data no SUAP vira tarefa (origem 'suap') ou se junta a
-- uma tarefa que o aluno já tinha anotado (mesma disciplina, tipo e dia).
-- `suap_chave` diz de qual avaliação veio (disciplina, etapa e sigla) e
-- `suap_data` guarda a última data vista no SUAP: o prazo só é mexido quando
-- o SUAP muda a data, para não desfazer o que o aluno ajustou à mão.

ALTER TABLE tarefa ADD COLUMN suap_chave TEXT;
ALTER TABLE tarefa ADD COLUMN suap_data TEXT;
