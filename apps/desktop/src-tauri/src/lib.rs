//! Núcleo nativo do Better Student.
//!
//! A regra do projeto é manter esta camada fina: aqui fica só o que precisa
//! do sistema operacional (arquivos, rede local, notificações, cofre de
//! senhas). Regras de negócio ficam em TypeScript, no pacote `shared`.

mod email;
mod materiais;
mod moodle;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Endereço do banco. O plugin resolve o caminho relativo dentro da pasta de
/// dados do app (no Windows, `%APPDATA%\<identificador do app>`).
const BANCO: &str = "sqlite:better-student.db";

/// Rótulo da janela do SUAP. A capability `suap.json` vale só para ela.
const JANELA_SUAP: &str = "suap";

/// Script injetado em toda página da janela do SUAP (ver `suap.js`).
const SCRIPT_SUAP: &str = include_str!("suap.js");

/// Limite de tamanho do boletim recebido (5 MB), para não aceitar qualquer coisa.
const TAMANHO_MAXIMO_BOLETIM: usize = 5 * 1024 * 1024;

/// Comando de exemplo, chamado pela interface para confirmar que a ponte
/// TypeScript ↔ Rust está funcionando.
#[tauri::command]
fn versao_nucleo() -> String {
    format!("v{}", env!("CARGO_PKG_VERSION"))
}

/// Abre (ou traz para frente) a janela do SUAP. O usuário faz o login na
/// página do próprio SUAP; o script injetado busca o boletim depois disso.
///
/// `completo`: além do boletim e do "Detalhar" (que mudam ao longo do
/// semestre), busca também horários, calendário e os critérios de avaliação
/// das turmas virtuais, que quase não mudam. O app pede completo só na
/// primeira vez (ou quando o aluno manda buscar tudo de novo).
///
/// `silencioso`: abre a janela ESCONDIDA, para atualizar ao abrir o app sem
/// incomodar. Se a sessão do SUAP ainda vale (o WebView guarda os cookies do
/// site, como um navegador), o script busca tudo e entrega; se pedir login,
/// ele chama `suap_sem_sessao` e o app mostra o botão para entrar. A senha
/// continua nunca passando pelo app.
///
/// É `async` de propósito: no Windows, criar uma janela dentro de um comando
/// síncrono trava o app (problema conhecido do WebView2, wry#583).
#[tauri::command]
async fn abrir_suap(
    app: AppHandle,
    servidor: String,
    silencioso: Option<bool>,
    completo: Option<bool>,
) -> Result<(), String> {
    let silencioso = silencioso.unwrap_or(false);
    let completo = completo.unwrap_or(true);
    let url: tauri::Url = servidor.parse().map_err(|_| "endereço do SUAP inválido".to_string())?;
    // Só aceita o SUAP de um instituto, por HTTPS: o mesmo padrão da capability.
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "https" || !host.starts_with("suap.") || !host.ends_with(".edu.br") {
        return Err("o endereço precisa ser https://suap.<instituto>.edu.br".into());
    }

    if let Some(janela) = app.get_webview_window(JANELA_SUAP) {
        // Já aberta (o usuário está nela, ou outra busca escondida): não mexe.
        if silencioso {
            return Err("a janela do SUAP já está aberta".into());
        }
        // Já aberta: fecha e abre de novo, para o script valer com o modo
        // pedido agora. Os cookies (a sessão do SUAP) continuam.
        let _ = janela.destroy();
    }

    // O modo vai num script à parte, que roda antes do `suap.js`.
    let modo = format!(
        "window.__BETTER_STUDENT_SILENCIOSO__ = {silencioso}; window.__BETTER_STUDENT_COMPLETO__ = {completo};"
    );
    WebviewWindowBuilder::new(&app, JANELA_SUAP, WebviewUrl::External(url))
        .title("SUAP · Better Student")
        .inner_size(1100.0, 800.0)
        .center()
        .visible(!silencioso)
        .initialization_script(&modo)
        .initialization_script(SCRIPT_SUAP)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Chamado pela janela ESCONDIDA do SUAP quando a sessão expirou (a página
/// pede login) ou a busca falhou: avisa o app e fecha a janela.
#[tauri::command]
fn suap_sem_sessao(app: AppHandle, janela: WebviewWindow, motivo: String) -> Result<(), String> {
    if janela.label() != JANELA_SUAP {
        return Err("comando exclusivo da janela do SUAP".into());
    }
    let motivo: String = motivo.chars().take(200).collect();
    app.emit_to("main", "suap:sem_sessao", motivo).map_err(|e| e.to_string())?;
    janela.destroy().map_err(|e| e.to_string())
}

/// Fecha a janela do SUAP se ela estiver escondida (o app desistiu de esperar).
/// A janela visível é do usuário: essa fica.
#[tauri::command]
fn fechar_suap_escondido(app: AppHandle) {
    if let Some(janela) = app.get_webview_window(JANELA_SUAP) {
        if !janela.is_visible().unwrap_or(true) {
            let _ = janela.destroy();
        }
    }
}

/// Página do "Detalhar" de uma disciplina, com o número do diário da linha
/// do boletim de onde ela veio (é por ele que o app acha a disciplina).
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct DetalheSuap {
    diario: String,
    html: String,
}

/// Limite de "Detalhar" aceitos de uma vez (um por disciplina).
const MAXIMO_DETALHES: usize = 40;

/// O que a janela do SUAP entrega: o boletim e, se achou, os horários de
/// aula, o calendário acadêmico e o detalhamento das notas.
#[derive(Clone, serde::Serialize)]
struct PacoteSuap {
    boletim: String,
    horarios: Option<String>,
    calendario: Option<String>,
    detalhes: Vec<DetalheSuap>,
    /// Seção "Instrumentos e Critérios de Avaliação" de cada turma virtual
    /// (só ela: o resto da página tem dados dos colegas, que o app não quer).
    turmas: Vec<DetalheSuap>,
}

/// Recebido da janela do SUAP: repassa o boletim (e horários/calendário, se vieram)
/// para a janela principal (evento `suap:boletim`), fecha a janela do SUAP e
/// volta ao app (se ela estava visível). Na importação pela tela, o app mostra
/// uma prévia; na atualização automática, grava direto.
#[tauri::command]
fn entregar_suap(
    app: AppHandle,
    janela: WebviewWindow,
    boletim: String,
    horarios: Option<String>,
    calendario: Option<String>,
    detalhes: Option<Vec<DetalheSuap>>,
    turmas: Option<Vec<DetalheSuap>>,
) -> Result<(), String> {
    if janela.label() != JANELA_SUAP {
        return Err("comando exclusivo da janela do SUAP".into());
    }
    let grande = |texto: &str| texto.len() > TAMANHO_MAXIMO_BOLETIM;
    let detalhes = detalhes.unwrap_or_default();
    let turmas = turmas.unwrap_or_default();
    if grande(&boletim)
        || horarios.as_deref().is_some_and(grande)
        || calendario.as_deref().is_some_and(grande)
        || detalhes.len() > MAXIMO_DETALHES
        || detalhes.iter().any(|d| grande(&d.html) || d.diario.len() > 32)
        || turmas.len() > MAXIMO_DETALHES
        || turmas.iter().any(|d| grande(&d.html) || d.diario.len() > 32)
    {
        return Err("página do SUAP grande demais".into());
    }
    let escondida = !janela.is_visible().unwrap_or(true);
    app.emit_to("main", "suap:boletim", PacoteSuap { boletim, horarios, calendario, detalhes, turmas })
        .map_err(|e| e.to_string())?;
    if !escondida {
        if let Some(principal) = app.get_webview_window("main") {
            let _ = principal.set_focus();
        }
    }
    janela.close().map_err(|e| e.to_string())
}

/// Migrations do banco, na ordem. Os arquivos `.sql` ficam em
/// `packages/shared` para serem reaproveitados pelo app do celular.
/// `include_str!` embute o texto do arquivo no executável durante a
/// compilação, então o instalador não precisa levar os `.sql` separados.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "esquema inicial",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0001_inicial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "dados do suap",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0002_dados_suap.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "datas estimadas do semestre",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0003_datas_estimadas.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "calendario academico",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0004_calendario.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "email",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0005_email.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "origem da tarefa",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0006_tarefa_origem.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "detalhamento das notas do suap",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0007_suap_detalhe.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "provas e trabalhos do suap na agenda",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0008_tarefa_suap.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "novidades para a caixa ao abrir o app",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0009_novidades.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "criterios de avaliacao das disciplinas",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0010_criterios.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "versao html dos e-mails",
            sql: include_str!("../../../../packages/shared/src/banco/migrations/0011_email_html.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(BANCO, migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            versao_nucleo,
            abrir_suap,
            entregar_suap,
            suap_sem_sessao,
            fechar_suap_escondido,
            email::email_conectar,
            email::email_conectado,
            email::email_desconectar,
            email::email_buscar,
            moodle::moodle_fechar_escondido,
            moodle::moodle_conectar,
            moodle::moodle_conectado,
            moodle::moodle_chave,
            moodle::moodle_desconectar,
            materiais::materiais_pasta_padrao,
            materiais::materiais_listar,
            materiais::materiais_copiar,
            materiais::materiais_abrir,
            materiais::materiais_baixar_moodle
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Better Student");
}
