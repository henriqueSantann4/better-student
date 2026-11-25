//! Núcleo nativo do Better Student.
//!
//! A regra do projeto é manter esta camada fina: aqui fica só o que precisa
//! do sistema operacional (arquivos, rede local, notificações, cofre de
//! senhas). Regras de negócio ficam em TypeScript, no pacote `shared`.

use tauri_plugin_sql::{Migration, MigrationKind};

/// Endereço do banco. O plugin resolve o caminho relativo dentro da pasta de
/// dados do app (no Windows, `%APPDATA%\<identificador do app>`).
const BANCO: &str = "sqlite:better-student.db";

/// Comando de exemplo, chamado pela interface para confirmar que a ponte
/// TypeScript ↔ Rust está funcionando.
#[tauri::command]
fn versao_nucleo() -> String {
    format!("v{}", env!("CARGO_PKG_VERSION"))
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
        .invoke_handler(tauri::generate_handler![versao_nucleo])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Better Student");
}
