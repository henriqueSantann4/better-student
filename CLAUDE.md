# CLAUDE.md: contexto do projeto Better Student

Este arquivo passa o contexto de uma conversa de planejamento (feita no Claude) para continuar o desenvolvimento no Claude Code. **O plano completo está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Leia esse arquivo antes de qualquer tarefa grande.**

## Sobre o projeto

**Better Student** é um app de desktop leve para estudantes de graduação. Ele junta agenda de provas e tarefas, grade horária, controle de faltas, notas, materiais por disciplina, e-mail institucional e integração com SUAP e Moodle. Tem um app de celular companheiro que sincroniza com o PC pela rede local; a função de destaque é a **foto do quadro**, que cai automaticamente na pasta da disciplina.

- Autor: Antonio, estudante de Sistemas de Informação no IFSP – Campus Votuporanga.
- Repositório público, **licença MIT**, aberto a contribuições.
- Interface e código de domínio **em português (PT-BR)**, com i18n desde o início.

## Stack (decidida)

| Parte | Tecnologia |
|---|---|
| Desktop | **Tauri 2** (núcleo Rust *fino*) + **React** + **TypeScript** + Vite |
| Celular (fase 3) | React Native + Expo, **Android primeiro** (iOS depois, via GitHub Actions + AltStore/SideStore) |
| Compartilhado | `packages/shared` (tipos, regras acadêmicas, parser, protocolo de sincronização) |
| Banco | SQLite nos dois lados; arquivos ficam no disco, o banco guarda só caminhos |
| IDs | UUID; exclusão lógica (`excluidoEm`) |
| i18n | i18next + react-i18next (`apps/desktop/src/locales/pt-BR.json`) |
| Gerenciador | pnpm workspaces |
| Plataforma inicial | **Windows**, depois Linux, depois macOS |

## Versões

- **1.0.0** (25/11/2026, tag `v1.0.0`): tudo o que está marcado [feito] ou [testar] abaixo. Resumo em [`CHANGELOG.md`](CHANGELOG.md).
- **1.1.0**: em elaboração. O que entrar nela vai para a seção `[1.1.0]` do CHANGELOG.
- A versão fica em quatro lugares, que devem andar juntos: `apps/desktop/package.json`, `packages/shared/package.json`, `apps/desktop/src-tauri/tauri.conf.json` e `apps/desktop/src-tauri/Cargo.toml`.

## Estado atual

- [feito] Estrutura do monorepo criada e com o primeiro commit.
- [feito] Desktop "olá mundo": React com menu lateral (Agenda, Grade, Faltas, Notas, Materiais) e um comando Tauri `versao_nucleo` de exemplo.
- [feito] `packages/shared/src/tipos.ts`: rascunho dos tipos (Semestre, Disciplina, HorarioAula, Tarefa, Subtarefa, RegraLembrete).
- [feito] O app abre no Windows com `pnpm dev`, e o banco é criado em `%APPDATA%\io.github.betterstudent.app\better-student.db` com a migration 0001 aplicada.
- [feito] Modelo de dados do SQLite: migration `packages/shared/src/banco/migrations/0001_inicial.sql`, carregada pelo `tauri-plugin-sql` (o Rust só roda as migrations; as consultas vêm do TypeScript).
- [feito] Regras de média, faltas e situação (com IFA) em `packages/shared/src/regras/`, com testes (`node:test`, sem dependência extra).
- [feito] Camada de acesso: repositórios em `packages/shared/src/banco/` sobre a interface `Banco` (desktop usa `@tauri-apps/plugin-sql`; testes usam `node:sqlite`).
- [feito] Telas de **Grade** (disciplinas + semana) e **Faltas** (aulas de hoje com "Faltei", resumo por disciplina, lançamento manual, histórico). Criação do primeiro semestre.
- [feito] **Importação do boletim do SUAP** (página salva ou colada): leitor em `packages/shared/src/importacao/`, migration 0002 com o "retrato" do SUAP em cada disciplina. As faltas do app e as do SUAP ficam separadas; o limite usa a maior das duas.
- [feito] Primeiro acesso pelo boletim: o semestre é criado a partir do período do boletim, com **datas estimadas** (o SUAP não informa início/fim; migration 0003 marca isso), editáveis em Grade → Editar semestre.
- [feito] **Calendário acadêmico** como pacote de dados (`packages/shared/calendarios/*.json`, nada fixo no código): datas reais do semestre, feriados/recessos (sem aula) e sábados letivos (grade de outro dia). Migration 0004 recria `evento_calendario` com os tipos novos. Tela "Calendário".
- [testar] **Modo automático do SUAP** (precisa testar no Tauri): janela do SUAP dentro do app; o usuário entra na página real (o login tem reCAPTCHA invisível, então o app NÃO guarda senha nem faz login sozinho). O script `src-tauri/src/suap.js` busca `/edu/aluno/<matrícula>/boletins/` e entrega pelo comando `entregar_suap`, o único que a capability `suap.json` libera.
- [feito] App abre maximizado.
- [feito] Calendário dentro da **Agenda** (1.1): um mês por vez com setas (`MiniCalendario` em `telas/Calendario.tsx`), pintado pela legenda; clicar num dia filtra a lista. A aba "Calendário" separada saiu.
- [testar] **E-mail por IMAP** (precisa testar no app): assistente de conexão (abre as páginas da conta Google e testa a senha de app), senha no cofre do Windows (`keyring`), busca incremental só leitura no núcleo Rust (`src-tauri/src/email.rs`: `imap` + `mail-parser`), cópia local na tabela `email` (migration 0005) e classificação nas abas em `shared/email`. No modo navegador, e-mails de exemplo inventados.
- [testar] **Moodle** (precisa testar no app): login pelo SUAP no mesmo fluxo do app oficial (`admin/tool/mobile/launch.php`); a janela intercepta `betterstudent://token=…`, confere o md5 e guarda a chave no cofre (`src-tauri/src/moodle.rs`). A interface chama a API REST direto (o Moodle libera CORS; a CSP libera `https://*.edu.br`). Tela "Moodle" com disciplinas (casadas com as do app pelo código do SUAP ou pelo nome, `shared/moodle/casar.ts`) e próximas atividades.
- [feito] Rust instalado na máquina de desenvolvimento: `cargo check` em `apps/desktop/src-tauri` valida o núcleo.
- [feito] **Agenda:** tarefas com prazo, prioridade, disciplina e subtarefas, agrupadas (atrasadas, hoje, amanhã, 7 dias...). As atividades do Moodle entram sozinhas (migration 0006: `origem`/`origem_id`/`url`; reimportar atualiza, e o que some da linha do tempo antes do prazo é marcado como entregue).
- [feito] **Leitor de frases** (`shared/regras/frase.ts`, sem IA): "prova de POO quinta 19h" → tipo, disciplina (iniciais, código, nome), data e hora; sem hora, usa o horário da aula do dia; sem data, fica sem prazo (não inventa). Campo único no topo da Agenda, com prévia. Tarefas aparecem no Calendário (marca vermelha = prova).
- [testar] **SUAP num clique só** (precisa testar no app): a janela do SUAP traz **boletim + horários + calendário**. Horários vêm da aba "Locais e Horários de Aula" (`/edu/aluno/<m>/locais-aula/`, leitor em `shared/importacao/horariosSuap.ts`): aulas seguidas da mesma disciplina no mesmo dia viram um encontro, com sala e professor da lista de diários. Reimportar substitui os horários das disciplinas do quadro (`importarHorarios`). O calendário vem de `/eventos/calendario_eventos/` → link do calendário acadêmico do período.
- [feito] **Notas** (simplificada na 1.1): mostra só o que o SUAP já tem (etapas, NAF, MFD, situação) e as próximas provas e trabalhos de cada disciplina, vindos da Agenda. **Decisão do Antonio:** o app não prevê média nem recuperação, porque cada professor calcula de um jeito (soma simples, fórmula, média) e pedir o valor de cada prova ao aluno é irreal. As regras `notaDaDisciplina`/`pontosDasAvaliacoes` e a tabela `avaliacao` continuam em `shared`, mas a interface não usa. Em Configurações, das regras só aparece a frequência mínima. O "Detalhar" do SUAP (`/edu/detalhar_matricula_diario_boletim/...`, leitor em `shared/importacao/detalheNotasSuap.ts`) vem no mesmo "Atualizar do SUAP", fica em `disciplina.suap_detalhe` (migration 0007) e aparece ao clicar na nota; a conta só é refeita para soma e média (o SUAP não mostra a fórmula). [testar] As notas do Moodle vêm de `gradereport_user_get_grade_items` (uma chamada por sala, `carregarNotas` em `apps/desktop/src/moodle/api.ts`; leitor `lerNotasMoodle` em `shared/moodle/moodle.ts`), buscadas ao abrir a tela de Notas e casadas com as disciplinas por `casarDisciplinaMoodle`. Não são guardadas no banco. No modo navegador, notas de exemplo (`moodle/exemplos.ts`).
- [feito] **Instituição e Configurações:** perfis em `packages/shared/instituicoes/*.json` (leitor e regras em `shared/instituicao/perfil.ts`; o app junta os arquivos com `import.meta.glob` em `apps/desktop/src/instituicoes.ts`). O IFSP tem os 57 campi do site oficial; SUAP vale para todos, o Moodle é por campus (só Votuporanga confirmado). "Outra instituição" = perfil genérico. Primeiro acesso pergunta faculdade e campus (tela `EscolherInstituicao`) e grava SUAP/Moodle na configuração; o semestre nasce com as regras do perfil. O nome da recuperação (IFA) e o gênero dele vêm do perfil (`textosRecuperacao`). Tela **Configurações**: faculdade/campus, regras do semestre, endereços e contas conectadas, lembretes por tipo de tarefa (`shared/regras/lembretes.ts`, ainda sem agendar no Windows), tema (claro/escuro/sistema, no localStorage) e pasta de materiais.
- [feito] **Início** (tela padrão ao abrir): o dia de aula que interessa (hoje enquanto houver aula por acontecer; depois da última, o próximo dia letivo, pulando feriado e fim de semana: `proximoDiaDeAulas` em `shared/regras/inicio.ts`), as 2 próximas provas, trabalhos e tarefas (`proximosPrazos`) e no máximo 4 avisos clicáveis (faltas perto do limite, atrasadas, evento do calendário na semana). Pensada para ser lida num relance: nada além disso.
- [testar] **Materiais** (1.1): pastas por disciplina no disco (`pastaDaDisciplina`, `PASTA_SEM_DISCIPLINA` em `shared/materiais/materiais.ts`); o banco não guarda arquivos, a lista vem do disco. Comandos do núcleo em `src-tauri/src/materiais.rs` (`materiais_listar`, `materiais_copiar`, `materiais_abrir`, `materiais_baixar_moodle`), que só aceitam nomes simples e conferem que o caminho fica dentro da pasta de materiais. O download do Moodle é feito no Rust (`ureq` com `native-tls`), com a chave lida do cofre e só para `/webservice/pluginfile.php/` do site conectado. Arquivos do Moodle vêm de `core_course_get_contents` (`lerArquivosMoodle`); "já baixado" = existe arquivo com o mesmo nome na pasta. Arrastar arquivos para a janela copia para a pasta aberta (evento de arrastar do Tauri). Sem seletor de arquivos por enquanto (pediria o plugin de diálogo).
- [testar] **Atualização ao abrir** (1.1, `apps/desktop/src/sincronizacao.tsx`): SUAP, Moodle e e-mail em paralelo, uma vez ao abrir e no botão Atualizar do menu. O SUAP abre a janela ESCONDIDA (`abrir_suap` com `silencioso`), que aproveita os cookies da sessão; se pedir login, o script chama `suap_sem_sessao` e o app mostra "Entrar no SUAP". A gravação sem prévia é `sincronizarSuap` (`shared/importacao/sincronizarSuap.ts`), que recusa boletim de outro período. O Moodle guarda salas, notas e lista de arquivos em `configuracao.cacheMoodle` (`moodle/cache.ts`); Notas e Materiais leem dali.
- [testar] **Novidades e avisos vistos** (1.1): cada fonte registra o que trouxe de novo na tabela `novidade` (migration 0009, `banco/novidades.ts`); a primeira busca de cada fonte não gera novidade. A caixa "Enquanto você estava fora" (`telas/Novidades.tsx`) abre junto com o app, sempre. Avisos (`shared/regras/avisos.ts`) têm `chave` e `nivel`; o check grava o nível em `configuracao.avisosDispensados`, e o aviso volta se o nível subir.
- [testar] **Provas do SUAP na Agenda** (1.1, `shared/importacao/provasSuap.ts`, migration 0008 com `tarefa.suap_chave`/`suap_data`): avaliações com data no "Detalhar" viram tarefas (origem "suap"), no horário da aula do dia; juntam com a anotação do aluno (mesma disciplina, tipo e dia); data mudada no SUAP muda o prazo (só quando o SUAP muda, para não desfazer ajuste do aluno); sumiu do SUAP, a criada pelo SUAP é apagada e a do aluno só perde a marca. Data passada entra concluída.
- [próximo] **Candidatos para a 1.1** (a definir com o Antonio): perfis de outras universidades públicas (ex.: UNESP, que também usa Moodle), conferindo regras e endereços em fontes oficiais; notificações agendadas no Windows (questão 6); o "Relatório de Faltas do Período" (faltas por data).

## Regras de domínio importantes (padrão IFSP, sempre configuráveis)

- **Semestral.** O foco é o semestre atual; os anteriores ficam como histórico de menor importância.
- **Faltas contam por aula, não por dia.** Cada disciplina tem `totalAulas` (ex.: Projeto de Extensão 1 = 100 aulas), e cada encontro da grade vale `quantidadeAulas`. O limite é `totalAulas × 25%`. Frequência abaixo de 75% significa reprovação automática.
- **Notas:** média ≥ 6 aprova. Média entre 4 e 6 vai para o **IFA** (recuperação); quem passa no IFA fica com média final **limitada a 6**. Média < 4 reprova direto. *Em aberto: qual nota é preciso tirar no IFA.*
- **Parser de linguagem natural, sem IA:** "prova dia 12" resolve a data e consulta a grade. Uma aula no dia preenche a disciplina e o horário; várias aulas mostram botões de escolha; nenhuma aula mostra um aviso. O que o usuário escreveu sempre vence a dedução.
- **Foto do quadro:** a disciplina é definida pelo horário da foto, com tolerância de 15 min após o fim da aula (desde que a próxima aula não tenha começado). Fora de qualquer janela, a foto vai para `_Sem disciplina`.
- **Notificações:** configuráveis (quantidade, antecedência, intervalo), com padrão por tipo de tarefa. Os lembretes são **agendados no SO**, porque o app **não roda em segundo plano**.
- **Pasta padrão de materiais:** `Documentos\Better Student\Materiais`, trocável pelo usuário.

## Princípios que não podem ser quebrados

1. **Leveza.** Nada pesado carregado por padrão; IA só como download opcional.
2. **Local-first e sem segundo plano.** Sincroniza e busca dados só com o app aberto.
3. **Privacidade.** Senhas e tokens ficam no cofre do SO, nunca no banco nem em logs.
4. **Sem competição entre pessoas.** Nada de rankings; a única comparação é do usuário consigo mesmo.
5. **Nada fixo do IFSP no código.** Regras configuráveis; SUAP e Moodle como adaptadores.
6. **O núcleo Rust fica fino.** Regras de negócio ficam em TypeScript, em `packages/shared`.
7. **A instituição preenche tudo.** No primeiro acesso o app pergunta só a faculdade (IFSP já vem marcado) e o campus; dali saem regras acadêmicas (médias, IFA, frequência), endereço do SUAP, Moodle, calendário e o resto. O aluno **nunca** precisa digitar um valor que a instituição já define (ex.: nota mínima do IFA). Tudo pode ser trocado depois na tela **Configurações**, que também reúne notificações, tema e demais preferências. Toda funcionalidade nova que dependa de um valor institucional deve lê-lo do perfil da instituição, não pedir ao usuário nem fixar no código.

## Como trabalhar com o Antonio

- **Pode editar código diretamente, sem pedir permissão.** Pergunte antes **apenas quando for implementar uma ideia nova** (funcionalidade ou abordagem que ainda não foi combinada).
- Responda em **português**.
- Explique o *porquê* das escolhas técnicas: ele está aprendendo Rust e Tauri neste projeto.
- Commits curtos, no imperativo, em português.
- **Sem emojis** em nenhum lugar: código, textos da interface, documentação, commits e respostas. Para marcar estado, use texto (ex.: `[feito]`, `[testar]`).

## Convenções do banco

- Colunas em `snake_case` no SQLite, `camelCase` nos tipos TS. Datas em TEXT ISO, booleanos em INTEGER 0/1.
- Valores derivados (média, situação, faltas restantes) **não** são guardados; são calculados em `shared/regras`.
- Migration publicada nunca é editada: mudanças viram `0002_...sql` e uma nova entrada em `migrations()` no `lib.rs`.
- Parâmetros SQL sempre com `?` (posicional): funciona no plugin do Tauri, no `node:sqlite` e no sql.js.
- Imports dentro de `packages/shared` usam a extensão `.ts` (permite rodar os testes direto no Node 24). Por isso o `tsconfig` tem `erasableSyntaxOnly`: nada de `enum`, `namespace` ou `constructor(public x)`.

## Amostras reais

- Páginas reais do SUAP (com dados pessoais) ficam em `amostras-privadas/`, que está no `.gitignore`. Nunca copiar valores delas para o código ou testes.
- Os testes usam versões **anônimas** em `packages/shared/src/importacao/fixtures/`. Se a amostra real existir, um teste extra confere que ela ainda é lida.

## Comandos

```bash
pnpm install      # dependências
pnpm dev          # abre o app (Tauri + Vite)
pnpm dev:web      # só a interface no navegador (banco sql.js no localStorage, só em dev)
pnpm typecheck    # checa os tipos de todos os pacotes
pnpm test         # roda os testes (regras e migrations)
pnpm build        # gera o instalador para Windows
```

## Questões em aberto

1. Nota mínima no IFA para aprovação.
2. Meta e categorias das horas complementares do curso de SI (consultar o PPC).
3. Quais funções ficam fora do app do celular (decidir na fase 3).
4. O que a API do SUAP do IFSP expõe; se o Moodle do campus aceita o app oficial do Moodle.
   - *Moodle (25/11/2026):* `ead.vtp.ifsp.edu.br` ("MOODLE DO IFSP") tem `enablemobilewebservice = 1` e login pelo provedor OAuth "SUAP IFSP": **aceita o fluxo do app oficial**.
   - *Testado em 25/11/2026 (`pnpm testar:suap`):* o login de aluno funciona (`POST /api/v2/autenticacao/token/` devolve `token`, `access` e `refresh`), mas **nenhum endpoint de dados de aluno existe** no SUAP do IFSP: nem os da API v2 clássica (`/api/v2/minhas-informacoes/...`) nem os da API nova (`/api/ensino/...`, usados pela biblioteca suapy). `/api/eu/` responde 500 para aluno. Falta perguntar ao IFSP se há API de aluno.
5. Se o Workspace do IFSP permite OAuth de apps não verificados (Gmail API).
   - *Testado em 25/11/2026 (`pnpm testar:gmail`):* **não permite.** O login com a conta @aluno.ifsp.edu.br dá `Erro 400: access_not_configured` ("o admin da sua instituição precisa analisar o app"), mesmo com o usuário de teste cadastrado. Caminhos: pedir ao IFSP para liberar o app (botão "Solicitar acesso"), ou encaminhar os e-mails institucionais para uma conta pessoal e ler essa conta.
   - *Escolhido: encaminhamento.* O OAuth (projeto em modo de teste, cliente "App para computador", escopo `gmail.readonly`) **funciona com a conta pessoal** (testado em 25/11/2026). O app lê só `deliveredto:<e-mail institucional>`. O encaminhamento automático também funciona.
   - **Melhor caminho, escolhido: IMAP com senha de app** (testado em 25/11/2026 com `pnpm testar:imap`). O IFSP permite: login em `imap.gmail.com:993` com o e-mail institucional e uma senha de app (exige verificação em duas etapas). Lê a conta institucional direto, sem encaminhamento e sem o login semanal do modo de teste do OAuth. A senha de app vai para o cofre do SO. Remetentes vistos: `nao-responda.ifsp.edu.br` (sistemas), `ifsp.edu.br` (servidores/professores), `accounts.google.com` (alertas), `gmail.com`.
6. Se as notificações agendadas do Windows funcionam com o instalador do Tauri.
7. O modo de treino de idiomas: em discussão, sem prioridade.

## Roadmap

0. Testes de viabilidade (OAuth Google, Moodle, SUAP, notificação agendada no Windows)
1. **MVP desktop:** agenda + subtarefas, grade, faltas, notas, calendário acadêmico, notificações, parser ← *estamos aqui*
2. Materiais por disciplina, horas complementares, flashcards
3. App Android + sincronização local (QR, nos dois sentidos, foto do quadro)
4. E-mail (classificação, detecção de prazos)
5. SUAP e Moodle
6. IA local opcional (resumo de e-mails)
7. iOS, Linux, macOS, nuvem, comparação entre semestres
