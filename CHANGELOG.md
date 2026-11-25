# Histórico de versões

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.1.0] (em elaboração)

### Corrigido

- **Notas:** a nota da etapa no SUAP deixa de ser tratada como final quando ainda há avaliação por fazer. Na "soma simples", o SUAP vai somando o que sai; com o trabalho que falta anotado no app, a disciplina fica "em andamento" em vez de ir para o IFA.

### Mudou

- **Notas:** a conta agora é em pontos: quanto já está garantido, quanto ainda vale e quanto falta para passar.
- **Notas:** cada avaliação diz quanto vale (ex.: prova de 7, trabalho de 3) e, por padrão, pesa o quanto vale. Isso cobre a soma de pontos, a média e fórmulas como (P1+T1+P2+T2)/2.

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
