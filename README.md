<p align="center">
  <img src="docs/icone-fonte.png" width="96" alt="Ícone do Better Student" />
</p>

<h1 align="center">Better Student</h1>

<p align="center">
  App de desktop leve para estudantes de graduação.<br/>
  Agenda, grade horária, faltas, notas, materiais e uma ponte direta entre o celular e o PC.
</p>

> 🚧 **Em desenvolvimento inicial.** Ainda não existe versão utilizável.

## O que o app vai fazer

- 📅 **Agenda** de provas, trabalhos e tarefas, com lembretes configuráveis
- 🕒 **Grade horária**, com a próxima aula e a sala
- ✅ **Controle de faltas** calculado pela carga horária de cada disciplina
- 🧮 **Calculadora de notas**: quanto preciso tirar para passar?
- 📁 **Materiais organizados por disciplina**, automaticamente
- 📸 **Foto do quadro**: tire no celular e ela cai na pasta certa do PC
- ✉️ **E-mail institucional** com prioridade para avisos de professores e detecção de prazos
- 🔌 **Integração com SUAP e Moodle**
- 🃏 **Flashcards** com repetição espaçada

Mais detalhes em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Princípios

- **Leve:** abre rápido, consome pouca memória e tem instalador pequeno.
- **Local-first:** funciona offline. Seus dados ficam no seu computador e no seu celular.
- **Privado:** o pareamento é feito por QR code, a sincronização é criptografada e as senhas ficam no cofre do sistema.
- **Sem competição:** nada de rankings ou comparações com outras pessoas. A única comparação é com você mesmo.

## Estrutura do repositório

```
better-student/
├── apps/
│   ├── desktop/          # App de desktop: Tauri 2 (Rust) + React + TypeScript
│   │   ├── src/          # Interface (React)
│   │   └── src-tauri/    # Núcleo nativo (Rust)
│   └── mobile/           # App de celular: React Native + Expo (fase 3)
├── packages/
│   └── shared/           # Tipos, regras acadêmicas e protocolo de sincronização
└── docs/                 # Arquitetura e decisões
```

## Rodando em desenvolvimento (Windows)

### Pré-requisitos

1. **Node.js 22+** e **pnpm** (`npm install -g pnpm`)
2. **Rust**: instale pelo [rustup](https://rustup.rs)
3. **Microsoft C++ Build Tools**: no instalador do Visual Studio Build Tools, marque "Desenvolvimento para desktop com C++"
4. **WebView2**: já vem instalado no Windows 10 (atualizado) e no Windows 11

Guia oficial: <https://tauri.app/start/prerequisites/>

### Comandos

```bash
pnpm install       # instala as dependências
pnpm dev           # abre o app em modo desenvolvimento
pnpm typecheck     # checa os tipos de todos os pacotes
pnpm build         # gera o instalador (.exe/.msi) em apps/desktop/src-tauri/target/release/bundle
```

A primeira execução de `pnpm dev` demora alguns minutos porque compila o Rust. As próximas são rápidas.

## Contribuindo

Contribuições são bem-vindas! Leia o [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de abrir um PR.

## Licença

[MIT](LICENSE)
