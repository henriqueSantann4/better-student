# Histórico de versões

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.1.0] (em elaboração)

### Novo

- **Atualiza sozinho ao abrir:** SUAP, Moodle e e-mail são buscados toda vez que o app abre, sem precisar entrar em cada aba. O SUAP aproveita a sessão que ainda vale (numa janela escondida); se ela expirou, o app mostra "Entrar no SUAP" e, depois do login, grava tudo sem pedir confirmação. No menu fica o botão **Atualizar**, com o estado de cada fonte, para buscar de novo quando quiser.
- **Enquanto você estava fora:** ao abrir o app, uma caixa mostra o que chegou desde a última vez (provas marcadas ou remarcadas no SUAP, notas novas do SUAP e do Moodle, atividades e arquivos novos do Moodle, e-mails da aba Principal) e os avisos de agora. Mesmo sem nada novo ela aparece, para dizer que nada foi perdido.
- **Avisos com "visto":** na caixa e na tela Início, cada aviso tem um check para sumir. Ele só volta se a situação piorar (mais uma falta, uma tarefa nova atrasada).
- **Como a nota é calculada:** na tela de Notas, cada disciplina mostra o texto do professor no plano de ensino da Turma Virtual do SUAP ("Instrumentos e Critérios de Avaliação"), com pesos e fórmula. Se o professor mudar as regras no meio do semestre, dá para reescrever o texto e, depois, voltar ao do SUAP.
- **Busca completa só na primeira vez:** horários, calendário acadêmico e critérios de avaliação, que quase não mudam, são buscados na primeira vez (ou quando falta algum). Nas outras vezes, o app busca só o que muda: boletim, notas e datas de prova. Em Configurações há o botão "Buscar tudo do SUAP de novo".
- **Provas e trabalhos do SUAP na Agenda:** as avaliações com data no "Detalhar" das notas entram sozinhas na Agenda, no horário da aula daquele dia, com a marca "SUAP". Se o professor mudar a data, ela muda no app; se tirar, a tarefa some. Se o aluno já tinha anotado a mesma prova, a anotação dele ganha a marca em vez de duplicar. As que já passaram entram como concluídas, em cinza.
- **Materiais:** uma pasta por disciplina no computador (em Documentos\Better Student\Materiais, trocável em Configurações), mais a "Sem disciplina". A aba lista os arquivos de cada pasta, abre no programa padrão, abre a pasta no Explorer, busca pelo nome em todas as disciplinas e copia para a pasta os arquivos arrastados para a janela. Também lista os arquivos que os professores postaram na sala do Moodle e baixa um a um ou todos de uma vez, marcando os que já foram baixados.
- **Notas do Moodle:** a tela de Notas mostra, em cada disciplina, as atividades do Moodle que já têm nota (como "5,7 de 7") e quantas ainda não foram corrigidas. Clicar no nome abre a atividade no Moodle. As notas vêm da atualização ao abrir o app (com o Moodle conectado), então a tela abre na hora.
- **Notas detalhadas:** o "Atualizar do SUAP" também traz o "Detalhar" de cada disciplina. Na tela de Notas, clicar na nota mostra as avaliações de cada etapa (sigla, descrição, data e nota) e a conta que o SUAP faz: a soma, na "Soma Simples", ou a média. Na "Fórmula", o app avisa que o SUAP não publica qual é. Quando a etapa ainda não fechou mas já há avaliações com nota, o detalhamento aparece aberto.

### Mudou

- **Agenda e Calendário numa aba só:** um mês pequeno com setas (como o calendário do Windows), pintado pelo calendário acadêmico e com marcas nos dias de prova e entrega. Clicar num dia mostra só aquele dia; ao lado ficam as tarefas agrupadas pelo prazo e os eventos do mês.
- **Materiais com a lista do Moodle guardada:** cada disciplina já mostra quantos arquivos estão no Moodle para baixar, e a pasta aberta lista os que faltam, sem precisar clicar para buscar. O download continua só quando o aluno pede.
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
