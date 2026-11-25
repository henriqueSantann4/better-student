# Como contribuir

Obrigado pelo interesse no Better Student! Este guia explica como o projeto funciona e o que esperamos das contribuições.

## Princípios do produto

Toda funcionalidade nova precisa respeitar estes princípios. PRs que vão contra eles não serão aceitos, mesmo que funcionem bem.

1. **Leveza.** O app deve continuar abrindo rápido e consumindo pouca memória. Recursos pesados, como modelos de IA, são **opcionais** e carregados só quando usados.
2. **Local-first.** Tudo funciona offline. Nenhum dado do estudante sai do dispositivo sem uma ação explícita dele.
3. **Privacidade.** Senhas e tokens ficam no cofre do sistema operacional, nunca em texto puro, em logs ou no banco.
4. **Sem competição entre pessoas.** O Better Student não tem rankings, placares, comparação com colegas ou qualquer mecânica de competição social. Comparações são só **do estudante consigo mesmo** (por exemplo: "sua frequência melhorou 4% em relação ao semestre passado").
5. **Pronto para outras instituições.** Nada de regras do IFSP fixas no código. Regras de nota, falta e calendário são configuráveis, e integrações (SUAP, Moodle...) são **adaptadores** isolados.

## Arquitetura em uma frase

Interface em **React + TypeScript**, núcleo nativo **fino** em **Rust** (Tauri 2), regras de negócio em TypeScript no pacote `packages/shared`, que é reaproveitado pelo app de celular.

Na dúvida sobre onde colocar código:

| Tipo de código | Onde fica |
|---|---|
| Telas e componentes | `apps/desktop/src` |
| Regras acadêmicas (média, faltas, parser de datas), tipos, protocolo de sincronização | `packages/shared` |
| Acesso ao sistema (arquivos, rede local, notificações, cofre de senhas) | `apps/desktop/src-tauri` |

## Convenções

- **Idioma do código:** nomes de domínio em português (`Disciplina`, `Tarefa`, `totalAulas`), para casar com o vocabulário acadêmico brasileiro. Termos técnicos consagrados podem ficar em inglês.
- **Textos da interface:** nunca escreva texto fixo em componentes. Use as chaves de tradução em `apps/desktop/src/locales/pt-BR.json`.
- **IDs:** sempre UUID, para a sincronização entre dispositivos funcionar.
- **Exclusões:** são lógicas (`excluidoEm`), não apagam a linha, porque a sincronização precisa saber o que foi apagado.
- **Commits:** mensagens curtas e no imperativo, em português (ex.: `adiciona cálculo de faltas por encontro`).

## Fluxo

1. Abra uma *issue* descrevendo o problema ou a ideia antes de começar algo grande.
2. Faça um *fork* e crie um branch a partir de `main`.
3. Rode `pnpm typecheck` antes de abrir o PR.
4. Descreva no PR o que mudou e como testar.
