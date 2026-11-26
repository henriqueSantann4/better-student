//! Login no Moodle pelo mesmo caminho do app oficial ("Moodle app").
//!
//! Como funciona (ver admin/tool/mobile/launch.php no código do Moodle):
//! 1. o app abre, numa janela própria, `launch.php?service=moodle_mobile_app
//!    &passport=<aleatório>&urlscheme=betterstudent`;
//! 2. o usuário entra normalmente (no IFSP, pelo botão "SUAP IFSP");
//! 3. o Moodle redireciona para `betterstudent://token=<base64>`, onde o
//!    base64 contém `md5(endereço do site + passport):::chave[:::privada]`.
//! A janela intercepta esse endereço (ele nunca é "aberto"), confere o md5 e
//! guarda a chave no cofre do sistema. A janela do Moodle não tem permissão
//! para chamar nenhum comando do app: quem age é o Rust, que só observa os
//! endereços que ela visita.

use base64::Engine;
use md5::{Digest, Md5};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const JANELA_MOODLE: &str = "moodle";
const SERVICO_COFRE: &str = "Better Student (Moodle)";
const ESQUEMA: &str = "betterstudent";
/// Clica sozinho no botão "SUAP IFSP" da página de login (ver `moodle.js`).
const SCRIPT_MOODLE: &str = include_str!("moodle.js");
/// Avisado à janela principal quando, na tentativa escondida, o SUAP pede login.
const PRECISA_ENTRAR: &str = "precisa_entrar_suap";

fn cofre(site: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICO_COFRE, site).map_err(|e| format!("cofre do sistema indisponível: {e}"))
}

/// Endereço do site sem barra no fim, como o Moodle guarda em `$CFG->wwwroot`.
fn normalizar_site(site: &str) -> Result<String, String> {
    let url: tauri::Url = site.trim().parse().map_err(|_| "endereço do Moodle inválido".to_string())?;
    if url.scheme() != "https" {
        return Err("o endereço do Moodle precisa começar com https://".into());
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

/// Um "passport" aleatório: o Moodle devolve o md5 dele junto com a chave, e
/// assim o app confere que a resposta é deste pedido (e deste site).
fn novo_passport() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("gerador aleatório do sistema indisponível");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn md5_hex(texto: &str) -> String {
    Md5::digest(texto.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// Lê `betterstudent://token=<base64>` e devolve a chave, se o md5 conferir.
fn extrair_chave(endereco: &str, site: &str, passport: &str) -> Result<String, String> {
    let codificado = endereco.split("token=").nth(1).ok_or("resposta do Moodle sem chave")?;
    let codificado = codificado.split(['&', '#']).next().unwrap_or_default();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(codificado)
        .map_err(|_| "chave do Moodle em formato inesperado".to_string())?;
    let texto = String::from_utf8(bytes).map_err(|_| "chave do Moodle em formato inesperado".to_string())?;
    let mut partes = texto.split(":::");
    let assinatura = partes.next().unwrap_or_default();
    let chave = partes.next().ok_or("chave do Moodle em formato inesperado")?;
    // O Moodle calcula md5(wwwroot + passport). Aceita com e sem barra final.
    let confere = assinatura == md5_hex(&format!("{site}{passport}")) || assinatura == md5_hex(&format!("{site}/{passport}"));
    if !confere {
        return Err("a resposta não veio deste Moodle (assinatura não confere)".into());
    }
    Ok(chave.to_string())
}

/// Abre a janela de login do Moodle. O resultado chega à janela principal
/// pelos eventos `moodle:conectado` ou `moodle:erro`.
///
/// `silencioso`: a janela fica ESCONDIDA. Se a sessão do SUAP ainda vale, o
/// login acontece sozinho (o script clica em "SUAP IFSP" e o SUAP devolve ao
/// Moodle sem pedir nada). Se o SUAP pedir usuário e senha, a janela fecha e
/// chega `moodle:erro` com "precisa_entrar_suap": o login é sempre do aluno.
///
/// `async` de propósito: no Windows, criar janela em comando síncrono trava (wry#583).
#[tauri::command]
pub async fn moodle_conectar(app: AppHandle, site: String, silencioso: Option<bool>) -> Result<(), String> {
    let silencioso = silencioso.unwrap_or(false);
    let site = normalizar_site(&site)?;
    if let Some(janela) = app.get_webview_window(JANELA_MOODLE) {
        // A visível é do aluno: uma tentativa escondida não atrapalha.
        if silencioso && janela.is_visible().unwrap_or(false) {
            return Err("a janela do Moodle já está aberta".into());
        }
        let _ = janela.destroy();
    }
    let passport = novo_passport();
    let inicio: tauri::Url = format!(
        "{site}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport={passport}&urlscheme={ESQUEMA}"
    )
    .parse()
    .map_err(|_| "endereço do Moodle inválido".to_string())?;

    let app_navegacao = app.clone();
    let site_navegacao = site.clone();
    WebviewWindowBuilder::new(&app, JANELA_MOODLE, WebviewUrl::External(inicio))
        .title("Moodle · Better Student")
        .inner_size(1000.0, 760.0)
        .center()
        .visible(!silencioso)
        .initialization_script(SCRIPT_MOODLE)
        .on_navigation(move |url| {
            // Escondida e o SUAP pediu login: desiste (a senha é sempre digitada pelo aluno).
            let host = url.host_str().unwrap_or_default();
            if silencioso && host.starts_with("suap.") && url.path().starts_with("/accounts/login") {
                let app = app_navegacao.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = app.emit_to("main", "moodle:erro", PRECISA_ENTRAR);
                    if let Some(janela) = app.get_webview_window(JANELA_MOODLE) {
                        let _ = janela.destroy();
                    }
                });
                return false;
            }
            // Páginas normais (Moodle, SUAP) seguem; o endereço especial com a
            // chave é capturado e bloqueado. Qualquer esquema que não seja
            // http(s) com "token=" conta (o site pode forçar outro esquema).
            if matches!(url.scheme(), "http" | "https") || !url.as_str().contains("token=") {
                return true;
            }
            let resultado = extrair_chave(url.as_str(), &site_navegacao, &passport)
                .and_then(|chave| cofre(&site_navegacao)?.set_password(&chave).map_err(|e| e.to_string()));
            let app = app_navegacao.clone();
            // Fecha a janela e avisa a principal fora deste callback.
            tauri::async_runtime::spawn(async move {
                match resultado {
                    Ok(()) => {
                        let _ = app.emit_to("main", "moodle:conectado", ());
                    }
                    Err(erro) => {
                        let _ = app.emit_to("main", "moodle:erro", erro);
                    }
                }
                if let Some(janela) = app.get_webview_window(JANELA_MOODLE) {
                    let _ = janela.destroy();
                }
                if !silencioso {
                    if let Some(principal) = app.get_webview_window("main") {
                        let _ = principal.set_focus();
                    }
                }
            });
            false
        })
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Fecha a janela do Moodle se ela estiver escondida (o app desistiu de esperar).
#[tauri::command]
pub fn moodle_fechar_escondido(app: AppHandle) {
    if let Some(janela) = app.get_webview_window(JANELA_MOODLE) {
        if !janela.is_visible().unwrap_or(true) {
            let _ = janela.destroy();
        }
    }
}

/// Diz se há uma chave guardada para este Moodle.
#[tauri::command]
pub fn moodle_conectado(site: String) -> bool {
    normalizar_site(&site)
        .and_then(|s| cofre(&s))
        .and_then(|c| c.get_password().map_err(|e| e.to_string()))
        .is_ok()
}

/// Entrega a chave para uma chamada à API do Moodle (feita pela interface).
#[tauri::command]
pub fn moodle_chave(site: String) -> Result<String, String> {
    let site = normalizar_site(&site)?;
    cofre(&site)?.get_password().map_err(|_| "Moodle não conectado".to_string())
}

/// Apaga a chave do cofre. (Para revogar no próprio Moodle: Preferências →
/// Chaves de segurança.)
#[tauri::command]
pub fn moodle_desconectar(site: String) -> Result<(), String> {
    let site = normalizar_site(&site)?;
    match cofre(&site)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("não consegui apagar a chave do cofre: {e}")),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn resposta(site: &str, passport: &str, chave: &str) -> String {
        let bruto = format!("{}:::{chave}:::privada", md5_hex(&format!("{site}{passport}")));
        format!("betterstudent://token={}", base64::engine::general_purpose::STANDARD.encode(bruto))
    }

    #[test]
    fn aceita_a_chave_com_assinatura_certa() {
        let url = resposta("https://moodle.exemplo.edu.br", "abc123", "chave-secreta");
        assert_eq!(extrair_chave(&url, "https://moodle.exemplo.edu.br", "abc123").unwrap(), "chave-secreta");
    }

    #[test]
    fn recusa_resposta_de_outro_pedido_ou_site() {
        let url = resposta("https://moodle.exemplo.edu.br", "abc123", "chave");
        assert!(extrair_chave(&url, "https://moodle.exemplo.edu.br", "outro-passport").is_err());
        assert!(extrair_chave(&url, "https://outro.exemplo.edu.br", "abc123").is_err());
    }

    #[test]
    fn normaliza_o_endereco() {
        assert_eq!(normalizar_site("https://moodle.exemplo.edu.br/").unwrap(), "https://moodle.exemplo.edu.br");
        assert!(normalizar_site("http://moodle.exemplo.edu.br").is_err());
    }
}
