-- Detalhamento das notas do SUAP (o "Detalhar" do boletim): as avaliações de
-- cada etapa e a forma de cálculo, guardadas como JSON. É só para mostrar ao
-- aluno de onde veio a nota; o app não calcula nada em cima disso.
ALTER TABLE disciplina ADD COLUMN suap_detalhe TEXT;
