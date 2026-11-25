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

## Estado atual

- ✅ Estrutura do monorepo criada e com o primeiro commit.
- ✅ Desktop "olá mundo": React com menu lateral (Agenda, Grade, Faltas, Notas, Materiais) e um comando Tauri `versao_nucleo` de exemplo.
- ✅ `packages/shared/src/tipos.ts`: rascunho dos tipos (Semestre, Disciplina, HorarioAula, Tarefa, Subtarefa, RegraLembrete).
- ✅ O app abre no Windows com `pnpm dev`, e o banco é criado em `%APPDATA%\io.github.betterstudent.app\better-student.db` com a migration 0001 aplicada.
- ✅ Modelo de dados do SQLite: migration `packages/shared/src/banco/migrations/0001_inicial.sql`, carregada pelo `tauri-plugin-sql` (o Rust só roda as migrations; as consultas vêm do TypeScript).
- ✅ Regras de média, faltas e situação (com IFA) em `packages/shared/src/regras/`, com testes (`node:test`, sem dependência extra).
- ✅ Camada de acesso: repositórios em `packages/shared/src/banco/` sobre a interface `Banco` (desktop usa `@tauri-apps/plugin-sql`; testes usam `node:sqlite`).
- ✅ Telas de **Grade** (disciplinas + semana) e **Faltas** (aulas de hoje com "Faltei", resumo por disciplina, lançamento manual, histórico). Criação do primeiro semestre.
- ✅ **Importação do boletim do SUAP** (página salva ou colada): leitor em `packages/shared/src/importacao/`, migration 0002 com o "retrato" do SUAP em cada disciplina. As faltas do app e as do SUAP ficam separadas; o limite usa a maior das duas.
- ✅ Primeiro acesso pelo boletim: o semestre é criado a partir do período do boletim, com **datas estimadas** (o SUAP não informa início/fim; migration 0003 marca isso), editáveis em Grade → Editar semestre.
- ✅ **Calendário acadêmico** como pacote de dados (`packages/shared/calendarios/*.json`, nada fixo no código): datas reais do semestre, feriados/recessos (sem aula) e sábados letivos (grade de outro dia). Migration 0004 recria `evento_calendario` com os tipos novos. Tela "Calendário".
- 🧪 **Modo automático do SUAP** (precisa testar no Tauri): janela do SUAP dentro do app; o usuário entra na página real (o login tem reCAPTCHA invisível, então o app NÃO guarda senha nem faz login sozinho). O script `src-tauri/src/suap.js` busca `/edu/aluno/<matrícula>/boletins/` e entrega pelo comando `entregar_suap`, o único que a capability `suap.json` libera.
- ✅ App abre maximizado.
- ✅ Calendário com visão de **mês** (padrão, como no SUAP: grade pintada pela legenda + eventos ao lado) e de **lista**.
- 🧪 **E-mail:** campo do e-mail institucional (salvo em `configuracao`) e caixa de entrada estilo Gmail (abas Principal/Atualizações/Divulgação, estrela, busca, leitura). Ainda **sem conexão com o Google**: no modo navegador aparecem e-mails de exemplo inventados (`src/email/exemplos.ts`, fora do build). Próximo passo do e-mail: OAuth do Google + Gmail API (questão em aberto 5).
- ⏭️ **Próximo passo:** tela de **Notas** (avaliações, média e situação com IFA, já aproveitando as notas por etapa do SUAP) e edição do semestre/regras. Depois: importar "Locais e Horários de Aula" (grade) e o "Relatório de Faltas do Período" (faltas por data); janela do SUAP dentro do app (modo automático).

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

## Como trabalhar com o Antonio

- **Pode editar código diretamente, sem pedir permissão.** Pergunte antes **apenas quando for implementar uma ideia nova** (funcionalidade ou abordagem que ainda não foi combinada).
- Responda em **português**.
- Explique o *porquê* das escolhas técnicas: ele está aprendendo Rust e Tauri neste projeto.
- Commits curtos, no imperativo, em português.

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
   - *Testado em 25/11/2026 (`pnpm testar:suap`):* o login de aluno funciona (`POST /api/v2/autenticacao/token/` devolve `token`, `access` e `refresh`), mas **nenhum endpoint de dados de aluno existe** no SUAP do IFSP: nem os da API v2 clássica (`/api/v2/minhas-informacoes/...`) nem os da API nova (`/api/ensino/...`, usados pela biblioteca suapy). `/api/eu/` responde 500 para aluno. Falta perguntar ao IFSP se há API de aluno.
5. Se o Workspace do IFSP permite OAuth de apps não verificados (Gmail API).
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
