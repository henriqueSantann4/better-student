-- Better Student: como a nota de cada disciplina é calculada.
--
-- O texto vem do plano de ensino da Turma Virtual do SUAP ("Instrumentos e
-- Critérios de Avaliação da Aprendizagem"), escrito pelo professor. Ele quase
-- não muda, então é buscado só na primeira vez (ou quando o aluno pede).
-- O aluno pode reescrever o texto (o professor mudou as regras no meio do
-- semestre); a versão dele fica à parte e pode ser desfeita.

ALTER TABLE disciplina ADD COLUMN suap_criterios TEXT;     -- NULL = nunca buscado; '' = o professor não preencheu
ALTER TABLE disciplina ADD COLUMN criterios_editados TEXT; -- NULL = vale o texto do SUAP
