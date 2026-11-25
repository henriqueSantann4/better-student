# Histórico de versões

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.1.0] (em elaboração)

### Mudou

- **Notas mais simples:** a tela mostra as notas que já saíram no SUAP (etapas, recuperação e média final) e as próximas provas e trabalhos de cada disciplina, vindos da Agenda. O app deixou de prever a média e se o aluno vai para a recuperação: para isso precisaria saber quanto vale cada prova, e cada professor calcula de um jeito.
- **Início:** sai o aviso de recuperação.
- **Configurações:** das regras, fica só a frequência mínima, que é o que o app usa (limite de faltas).

## [1.0.0] (25/11/2026)

Primeira versão do app de desktop (Windows).

### Primeiro acesso e configurações

- Pergunta a faculdade e o campus uma vez só; dali saem as regras de aprovação, o SUAP, o Moodle e o calendário. O IFSP vem com os 57 campi; para outras faculdades há um perfil genérico.
- Tela de Configurações: faculdade e campus, regras de aprovação do semestre, endereços e contas conectadas, lembretes por tipo de tarefa, tema (claro, escuro ou do sistema) e pasta de materiais.

### Telas

- **Início:** as aulas do dia que interessa (hoje enquanto houver aula; depois, o próximo dia letivo), as próximas provas, trabalhos e tarefas, e avisos rápidos.
- **Agenda:** tarefas com prazo, prioridade, disciplina e subtarefas; criação por frase ("prova de POO quinta 19h"), sem IA.
- **Grade horária:** disciplinas e semana de aulas.
- **Calendário:** calendário acadêmico em visão de mês ou lista, com feriados, recessos, sábados letivos e as tarefas.
- **Faltas:** limite em dias de aula, frequência atual e prevista, com as faltas do SUAP.
- **Notas:** avaliações com peso, média, quanto falta para aprovar e recuperação (IFA).
- **Moodle:** disciplinas e atividades, que entram sozinhas na Agenda.
- **E-mail:** caixa de entrada do e-mail institucional (IMAP, com senha de app).

### SUAP

- "Atualizar do SUAP" traz, de uma vez, o boletim, os horários de aula e o calendário acadêmico. O login é feito na página do próprio SUAP; o app não guarda a senha.
- Também dá para importar a página do boletim salva ou copiada.

### Privacidade

- Tudo fica no computador (SQLite). Senhas e chaves ficam no cofre do Windows.

[1.1.0]: https://github.com/henriqueSantann4/better-student/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/henriqueSantann4/better-student/releases/tag/v1.0.0
