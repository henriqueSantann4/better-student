<p align="center">
  <img src="docs/icone-fonte.png" width="96" alt="Ícone do Better Student" />
</p>

<h1 align="center">Better Student</h1>

<p align="center">
  App de desktop leve para estudantes de graduação.<br/>
  Agenda, grade horária, faltas, notas, materiais e uma ponte direta entre o celular e o PC.
</p>

## Como instalar (Windows 10 e 11)

1. Abra a página de **[versões do app](../../releases/latest)** (aba *Releases* do GitHub).
2. Em **Assets**, baixe o arquivo que termina em **`x64-setup.exe`** (por exemplo, `Better Student_1.1.0_x64-setup.exe`).
3. Abra o arquivo baixado. O Windows pode mostrar **"O Windows protegeu o computador"**: isso acontece porque o instalador não tem assinatura digital (que é paga), não porque tem algo errado. Clique em **Mais informações** e depois em **Executar assim mesmo**.
4. Siga o instalador. Ele não pede senha de administrador: instala só para o seu usuário.
5. Abra o **Better Student**. Na primeira vez ele pergunta a sua faculdade e o seu campus e pede para você entrar no SUAP uma vez; daí em diante, ele busca suas disciplinas, horários, notas e provas sozinho sempre que você abrir.

Depois de instalado, o app **se atualiza sozinho**: ao abrir, se houver versão nova, ele baixa, instala e reabre (sem internet, abre normalmente). Seus dados continuam onde estavam. Para desinstalar, use *Configurações do Windows → Aplicativos*.

> Seus dados ficam só no seu computador. A senha do SUAP nunca passa pelo app (você entra na página do próprio SUAP), e as senhas do e-mail e a chave do Moodle ficam no cofre do Windows.

## O que o app faz

- **Início:** as próximas aulas, os próximos prazos, as notificações e os e-mails mais recentes, num relance
- **Agenda** de provas, trabalhos e tarefas, com o calendário acadêmico do campus; escreva "prova de POO quinta 19h" e ela entende
- **Provas e trabalhos do SUAP** entram sozinhos na Agenda (e mudam se o professor mudar a data)
- **Grade horária**, com a sala de cada aula
- **Controle de faltas** calculado pela carga horária de cada disciplina
- **Notas** do SUAP e do Moodle, com o detalhamento de cada avaliação e o critério de cálculo do professor
- **Materiais** numa pasta por disciplina, com os arquivos do Moodle para baixar
- **E-mail institucional**, separado em Principal, Atualizações e Divulgação
- **Integração com SUAP e Moodle**, atualizada ao abrir o app

Em breve: lembretes no Windows, app de celular (foto do quadro direto na pasta da disciplina) e flashcards.

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

## Publicando uma versão

1. Troque a versão nos quatro arquivos (`apps/desktop/package.json`, `packages/shared/package.json`, `apps/desktop/src-tauri/tauri.conf.json` e `apps/desktop/src-tauri/Cargo.toml`) e registre as mudanças no [`CHANGELOG.md`](CHANGELOG.md).
2. Faça o commit no `main` e envie.
3. Crie e envie a tag da versão:

   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

O workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) compila o app num Windows do GitHub, roda os testes e publica a versão na aba Releases, com o instalador e o `latest.json` (que os apps instalados consultam para se atualizar). Se a tag não bater com a versão dos quatro arquivos, ele para antes de compilar.

**Assinatura das atualizações:** o app só instala atualização assinada com a chave do projeto. A chave pública fica em `plugins.updater.pubkey` no `tauri.conf.json`; a privada e a senha dela ficam só com o mantenedor e nos segredos do repositório (`TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Para gerar o par: `pnpm --filter @better-student/desktop tauri signer generate -w %USERPROFILE%\.tauri\better-student.key`. Perder a chave privada impede atualizar quem já instalou (seria preciso reinstalar à mão).

## Contribuindo

Contribuições são bem-vindas! Leia o [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de abrir um PR.

## Licença

[MIT](LICENSE)
