fn main() {
    // Lista os comandos do app para o Tauri gerar uma permissão para cada um
    // (`allow-versao-nucleo`, `allow-abrir-suap`, `allow-entregar-suap`).
    // Com isso, cada janela só chama o que a sua "capability" permitir: a
    // janela do SUAP, por exemplo, só pode chamar `entregar_suap`.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "versao_nucleo",
            "abrir_suap",
            "entregar_suap",
            "email_conectar",
            "email_conectado",
            "email_desconectar",
            "email_buscar",
            "moodle_conectar",
            "moodle_conectado",
            "moodle_chave",
            "moodle_desconectar",
        ]),
    ))
    .expect("erro ao preparar o build do Tauri");
}
