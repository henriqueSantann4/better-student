//! Núcleo nativo do Better Student.
//!
//! A regra do projeto é manter esta camada fina: aqui fica só o que precisa
//! do sistema operacional (arquivos, rede local, notificações, cofre de
//! senhas). Regras de negócio ficam em TypeScript, no pacote `shared`.

mod email;
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
/// É `async` de propósito: no Windows, criar uma janela dentro de um comando
/// síncrono trava o app (problema conhecido do WebView2, wry#583).
#[tauri::command]
async fn abrir_suap(app: AppHandle, servidor: String) -> Result<(), String> {
    let url: tauri::Url = servidor.parse().map_err(|_| "endereço do SUAP inválido".to_string())?;
    // Só aceita o SUAP de um instituto, por HTTPS: o mesmo padrão da capability.
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "https" || !host.starts_with("suap.") || !host.ends_with(".edu.br") {
        return Err("o endereço precisa ser https://suap.<instituto>.edu.br".into());
    }

    if let Some(janela) = app.get_webview_window(JANELA_SUAP) {
        // Já aberta: recarrega para o script buscar o boletim de novo.
        janela.navigate(url).map_err(|e| e.to_string())?;
        janela.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, JANELA_SUAP, WebviewUrl::External(url))
        .title("SUAP · Better Student")
        .inner_size(1100.0, 800.0)
        .center()
        .initialization_script(SCRIPT_SUAP)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// O que a janela do SUAP entrega: o boletim e, se achou, os horários de
/// aula e o calendário acadêmico.
#[derive(Clone, serde::Serialize)]
struct PacoteSuap {
    boletim: String,
    horarios: Option<String>,
    calendario: Option<String>,
}

/// Recebido da janela do SUAP: repassa o boletim (e horários/calendário, se vieram)
/// para a janela principal (evento `suap:boletim`), fecha a janela do SUAP e
/// volta ao app. O app mostra uma prévia: nada é gravado sem o usuário confirmar.
#[tauri::command]
fn entregar_suap(
    app: AppHandle,
    janela: WebviewWindow,
    boletim: String,
    horarios: Option<String>,
    calendario: Option<String>,
) -> Result<(), String> {
    if janela.label() != JANELA_SUAP {
        return Err("comando exclusivo da janela do SUAP".into());
    }
    let grande = |texto: &str| texto.len() > TAMANHO_MAXIMO_BOLETIM;
    if grande(&boletim) || horarios.as_deref().is_some_and(grande) || calendario.as_deref().is_some_and(grande) {
        return Err("página do SUAP grande demais".into());
    }
    app.emit_to("main", "suap:boletim", PacoteSuap { boletim, horarios, calendario })
        .map_err(|e| e.to_string())?;
    if let Some(principal) = app.get_webview_window("main") {
        let _ = principal.set_focus();
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
        .invoke_handler(tauri::generate_handler![
            versao_nucleo,
            abrir_suap,
            entregar_suap,
            email::email_conectar,
            email::email_conectado,
            email::email_desconectar,
            email::email_buscar,
            moodle::moodle_conectar,
            moodle::moodle_conectado,
            moodle::moodle_chave,
            moodle::moodle_desconectar
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Better Student");
}
