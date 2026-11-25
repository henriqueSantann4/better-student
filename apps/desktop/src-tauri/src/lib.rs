//! Núcleo nativo do Better Student.
//!
//! A regra do projeto é manter esta camada fina: aqui fica só o que precisa
//! do sistema operacional (arquivos, rede local, notificações, cofre de
//! senhas). Regras de negócio ficam em TypeScript, no pacote `shared`.

/// Comando de exemplo, chamado pela interface para confirmar que a ponte
/// TypeScript ↔ Rust está funcionando.
#[tauri::command]
fn versao_nucleo() -> String {
    format!("v{}", env!("CARGO_PKG_VERSION"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![versao_nucleo])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Better Student");
}
