# Better Student: plano e arquitetura

*Última atualização: 24/11/2026*

## Visão

Um app de desktop **leve** para estudantes de graduação. Ele junta num lugar só a vida acadêmica que hoje fica espalhada entre e-mail, SUAP, Moodle, WhatsApp e papel, e tem um app de celular **companheiro**, com quase todas as funções do desktop e mais a captura de fotos do quadro, que chegam organizadas no PC.

**Nome oficial:** Better Student · **Licença:** MIT · **Repositório:** público, aberto a contribuições.

### Princípios

- **Leve:** abre rápido, consome pouca RAM e tem instalador pequeno. Os recursos pesados, como a IA, são opcionais.
- **Local-first:** funciona offline e os dados ficam no dispositivo do estudante.
- **Sem segundo plano:** o app só busca informações e sincroniza enquanto está aberto, para economizar bateria e recursos. Os lembretes são agendados no próprio sistema operacional (ver "Notificações").
- **Privado e seguro:** o pareamento é feito por QR code, a comunicação é criptografada e as senhas ficam no cofre do sistema operacional.
- **Sem competição entre pessoas:** nada de rankings ou comparação com colegas. A única comparação é do estudante consigo mesmo.
- **Funciona em várias instituições:** regras de nota, falta e calendário são configuráveis, e SUAP e Moodle são adaptadores plugáveis.
- **Pronto para tradução:** a primeira versão é só em PT-BR, mas todos os textos ficam em arquivos de tradução desde o início.

---

## Funcionalidades

### Vida acadêmica (núcleo)

- **Semestres:** o foco é sempre o semestre atual. Os semestres anteriores ficam guardados como histórico, com prioridade menor.
- **Agenda** de provas, trabalhos, listas, apresentações e atividades do Moodle, com prazo, prioridade e **subtarefas (checklist)**.
- **Grade horária**, com a próxima aula e a sala.
- **Controle de faltas** (regras abaixo).
- **Calculadora de notas**, com as regras do IFSP como padrão configurável (regras abaixo).
- **Horas complementares:** registro com certificado anexado e progresso até a meta. A meta e as categorias são configuráveis pelo usuário.
- **Calendário acadêmico:** feriados, início e fim do semestre e semanas de prova.
- **Entrada em linguagem natural:** "amanhã tenho prova de POO às 9h" ou só "prova dia 12" abrem o formulário já preenchido (regras abaixo).

### Notificações

- Lembretes de **provas e tarefas**, e alerta de **tarefas atrasadas**.
- **Totalmente configuráveis:** quantas vezes, quanto tempo antes e com que intervalo. Exemplo: 3 lembretes, começando 3 dias antes, um por dia.
- Um padrão por tipo de tarefa (ex.: provas com 3 lembretes, listas com 1), que pode ser alterado em cada tarefa.

### Materiais

- **Pasta por disciplina:** os documentos (anexos de e-mail, arquivos do Moodle, envios do celular) são separados em `Materiais/<Disciplina>/`.
- **Pasta padrão:** `Documentos\Better Student\Materiais`. O usuário pode trocar, por exemplo, para uma pasta dentro do Google Drive ou OneDrive, e assim ganhar backup de graça.
- **Foto do quadro** (exclusiva do celular), com a disciplina definida pelo horário da foto (regras abaixo).
- **Enviar link ou texto** entre o celular e o PC.

### E-mail institucional (Google Workspace: `@aluno.ifsp.edu.br`)

- Conexão com a conta Google institucional.
- **Classificação e prioridade:** avisos de professores ficam em alta prioridade; eventos e divulgação ficam como "menos importante".
- **Detecção de prazos:** o app reconhece algo como "entrega até dia 15" e sugere criar a tarefa.
- **Resumo de e-mails longos** com IA local (opcional).

### Estudo

- **Flashcards com repetição espaçada.**

### Integrações SUAP e Moodle

| Dado | Fonte provável | Observação |
|---|---|---|
| Notas | SUAP | É a fonte oficial; o Moodle pode ter notas parciais |
| Faltas | SUAP | |
| Horários e salas | SUAP | Preenchem a grade automaticamente |
| Materiais | Moodle | Baixados para `Materiais/<Disciplina>/` |
| Prazos de atividades | Moodle | Viram tarefas na agenda |
| Avisos | Moodle + e-mail | **Precisam de desduplicação**, porque o Moodle costuma mandar o mesmo aviso por e-mail |

### Backlog (depois)

Comparação com o próprio semestre anterior (ex.: "notas +4%, presença −10%"), pomodoro e estatísticas por disciplina, modo foco, captura rápida por atalho global, anotações em Markdown, escanear documento pelo celular, marcar presença pelo celular, resumo semanal, exportar para .ics, tarefas compartilhadas com o grupo e sincronização pela nuvem. O modo de idiomas ainda está em discussão, sem prioridade.

---

## Regras acadêmicas (padrão IFSP, configurável)

### Faltas

As faltas contam **por aula**, não por dia. Cada disciplina tem um **total de aulas** no semestre, e cada encontro da grade vale um certo número de aulas.

- `limiteFaltas = totalAulas × (1 − frequênciaMínima)`, com frequência mínima padrão de 75%.
- Faltar a um encontro soma as aulas daquele encontro.
- Exemplo: *Projeto de Extensão 1* tem 100 aulas no total, então o limite é de **25 aulas**. Se o encontro de 07:00–10:30 vale *N* aulas, o app mostra quantos **encontros** ainda podem ser perdidos: `(25 − faltas) ÷ N`.
- Frequência abaixo do mínimo significa **reprovação automática**, independentemente da nota.

### Notas e situação

| Situação | Condição |
|---|---|
| Aprovado | Média ≥ 6 **e** frequência ≥ 75% |
| IFA (recuperação) | 4 ≤ média < 6 **e** frequência ≥ 75% |
| Aprovado após o IFA | Passou no IFA. A média final fica **limitada a 6**, mesmo que a nota do IFA seja maior |
| Reprovado | Média < 4, frequência < 75%, ou não passou no IFA |

A forma de calcular a média dentro de cada disciplina (pesos das avaliações) é configurável por disciplina, porque depende do professor.

### Parser de linguagem natural

1. **Resolver a data:** "dia 12" vira o próximo dia 12; "quinta", "amanhã" e "semana que vem" funcionam do mesmo jeito.
2. **Consultar a grade** daquele dia, descontando os feriados.
3. **Uma aula** no dia: preenche a disciplina e o horário. **Várias aulas:** mostra botões com as matérias do dia. **Nenhuma aula:** formulário vazio, com um aviso.
4. O que o usuário escreveu explicitamente ("às 14h", "de POO") sempre vence o que o app deduziu.

### Foto do quadro

1. Foto **durante uma aula**: vai para essa disciplina.
2. Foto **até 15 min depois do fim** (configurável): vai para a aula que terminou, desde que a próxima aula ainda não tenha começado.
3. Foto **fora de qualquer janela**: vai para `Materiais/_Sem disciplina/`.
4. Sempre dá para corrigir com um toque.

---

## Arquitetura

```
┌──────────────────────────┐        Wi-Fi (mesma rede)        ┌──────────────────────────┐
│  DESKTOP (Tauri 2)       │  ◄── mDNS descobre o PC ──────── │  CELULAR (React Native)  │
│  UI: React + TypeScript  │  ◄══ WebSocket criptografado ══► │  UI: TypeScript (Expo)   │
│  Núcleo nativo: Rust     │      sincronização nos dois      │  Log de alterações       │
│  SQLite + Materiais/     │      sentidos + envio de fotos   │  SQLite + fotos locais   │
│  IA local opcional       │                                  │  Câmera (só no celular)  │
└──────────────────────────┘                                  └──────────────────────────┘
            ▲
            │ Gmail API (OAuth Google), SUAP API, Moodle Web Services (adaptadores)
```

| Camada | Escolha | Por quê |
|---|---|---|
| Desktop | **Tauri 2** (Rust fino + React/TypeScript) | Instalador de poucos MB e baixo uso de RAM |
| Celular | **React Native + Expo** | App nativo obrigatório; PWA descartado por limitações do iOS |
| Código compartilhado | `packages/shared` | Tipos, regras acadêmicas, parser e protocolo de sincronização |
| Banco | **SQLite** nos dois lados | Um único arquivo, relacional, com transações, multiplataforma |
| Arquivos | Ficam no disco | O banco guarda só o caminho e os metadados |
| IDs | UUID | Evitam conflito em registros criados offline |
| Credenciais | Cofre do SO | Nunca ficam em texto puro |
| Idioma | i18next + `Intl` | Pronto para tradução |

### Plataformas
- **Desktop:** Windows → Linux → macOS.
- **Celular:** Android primeiro. O iOS depois, compilado pelo GitHub Actions (macOS, grátis para repositórios públicos) e instalado via AltStore/SideStore com um Apple ID gratuito (a instalação precisa ser renovada a cada 7 dias).

### Sincronização local (dois sentidos, só com os apps abertos)

1. **Pareamento** por QR code (endereço + chave pública), feito uma vez só.
2. Toda alteração vira uma entrada no **log de alterações**. Exclusões ficam marcadas como "tombstones".
3. Quando **os dois apps estão abertos na mesma rede**, eles se encontram por mDNS/Bonjour e trocam o que falta, em ordem.
4. **Conflito:** vence a última edição, campo a campo.
5. Fotos e arquivos vão por uma fila própria, com **ack**. O item só sai da fila do celular depois que o PC confirma.
6. Futuro: o mesmo protocolo passa a falar com um servidor (relay).

### Notificações sem segundo plano

Como o app não fica rodando em segundo plano, os lembretes são **agendados no sistema operacional** no momento em que a tarefa é criada ou editada. O sistema exibe a notificação na hora certa, mesmo com o app fechado:
- **Android:** notificações locais agendadas (expo-notifications).
- **Windows:** notificações agendadas do Windows (*scheduled toast*). Exigem que o app tenha uma identidade registrada pelo instalador. **Precisa ser validado na fase 0.**
- **Plano B no Windows:** uma opção "iniciar com o Windows (minimizado)", desligada por padrão.

### IA local (opcional e leve)
- **Nível 1 (padrão):** parser de regras + banco de horários. Sem modelo, resposta instantânea, roda também no celular.
- **Nível 2 (download opcional, só no desktop):** modelo pequeno e quantizado (0,5–3 bilhões de parâmetros, via llama.cpp) para resumir e-mails. É carregado só quando usado.

### E-mail (Google Workspace)
- OAuth do Google + Gmail API. Durante o desenvolvimento, usar um projeto do Google Cloud em modo de teste (até 100 usuários de teste).
- **Risco:** o administrador do Workspace do IFSP pode bloquear apps não verificados. **Testar na fase 0.**
- **App público:** a leitura de e-mails exige uma auditoria paga do Google. Alternativa: cada usuário cria o próprio projeto OAuth, com um guia no README.

### SUAP e Moodle
- **Moodle:** Web Services oficiais (a mesma API do app oficial do Moodle).
- **SUAP:** API REST com token. Falta confirmar o que a instância do IFSP libera.

---

## Roadmap

| Fase | Entrega |
|---|---|
| **0. Testes de viabilidade** | OAuth do Google com o e-mail do IFSP, token do Moodle, API do SUAP, notificação agendada no Windows |
| **1. MVP desktop (Windows)** | Agenda + subtarefas, grade, faltas, notas, calendário acadêmico, notificações, parser de linguagem natural |
| **2. Materiais e estudo** | Pastas por disciplina, horas complementares, flashcards |
| **3. App Android + sincronização** | Pareamento por QR, sincronização nos dois sentidos, foto do quadro, links e textos |
| **4. E-mail** | Conexão Google, classificação, detecção de prazos |
| **5. SUAP e Moodle** | Adaptadores, importação, desduplicação de avisos |
| **6. IA local opcional** | Resumo de e-mails |
| **7. Expansão** | iOS, Linux, macOS, nuvem, comparação entre semestres |

## Decisões tomadas

Tauri 2 (Rust) + React · React Native + Expo (Android primeiro) · sincronização local nos dois sentidos, só com os apps abertos · pareamento por QR · SQLite · Google Workspace via OAuth · foto classificada pelo horário · parser de regras antes de IA · lembretes configuráveis e agendados no SO · pasta padrão em Documentos (trocável) · subtarefas · sem competição entre pessoas · MIT · PT-BR com i18n · nome oficial "Better Student".

## Questões em aberto

1. **IFA:** que nota é preciso tirar no IFA para passar?
2. **Horas complementares:** meta e categorias do curso de SI (confirmar no PPC do curso).
3. Quais funções ficam fora do app do celular (decidir na fase 3).
4. O que a API do SUAP do IFSP expõe; se o Moodle do campus aceita o app oficial do Moodle.
5. O administrador do Workspace do IFSP permite OAuth de apps não verificados?
6. Notificações agendadas no Windows funcionam com o instalador do Tauri?
