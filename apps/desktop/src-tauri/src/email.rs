//! E-mail institucional por IMAP (Gmail), com senha de app.
//!
//! Por que isto fica no núcleo Rust, e não no TypeScript:
//! - IMAP é uma conexão TLS direta (porta 993), que a janela do app não abre;
//! - a senha de app vive no cofre do sistema (Credential Manager do Windows)
//!   e só o Rust a lê: o TypeScript manda a senha UMA vez, ao conectar, e
//!   nunca mais a recebe de volta;
//! - decodificar e-mail (MIME, acentos, anexos) é trabalho de biblioteca.
//!
//! Tudo é SOMENTE LEITURA: a caixa é aberta com EXAMINE e o conteúdo é lido
//! com BODY.PEEK, então nada é marcado como lido, movido ou apagado no Gmail.

use std::collections::HashSet;

use imap::types::Flag;
use mail_parser::MessageParser;
use serde::Serialize;

const SERVIDOR: &str = "imap.gmail.com";
const PORTA: u16 = 993;
/// Nome do item no cofre do sistema ("serviço", no vocabulário do keyring).
const SERVICO_COFRE: &str = "Better Student (e-mail IMAP)";
/// Quantos e-mails buscar por vez, para não baixar a caixa inteira de uma vez.
const LOTE_FETCH: usize = 25;
/// Corpo guardado por e-mail (em caracteres). O resto fica no Gmail.
const LIMITE_CORPO: usize = 50_000;
/// Versão HTML guardada (em bytes). Maior que isso, fica só o texto.
const LIMITE_HTML: usize = 400_000;
/// Imagens anexadas ao próprio e-mail (as do "cid:") entram no HTML até este total.
const LIMITE_IMAGENS: usize = 3 * 1024 * 1024;

/// Um e-mail já decodificado, como o TypeScript recebe.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailBruto {
    uid: u32,
    de_nome: String,
    de_email: String,
    assunto: String,
    /// ISO 8601. Vem do cabeçalho Date; se faltar, da data de chegada no servidor.
    data: String,
    corpo: String,
    /// Versão HTML, com as imagens anexadas já embutidas. A tela mostra num
    /// quadro isolado, sem scripts. `None` = o e-mail só tem texto (ou é grande demais).
    html: Option<String>,
    lido: bool,
    estrela: bool,
}

/// Resultado de uma busca. Se `uid_validity` mudar entre buscas, o servidor
/// renumerou a caixa e o app precisa jogar fora a cópia local e buscar de novo.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lote {
    uid_validity: u32,
    emails: Vec<EmailBruto>,
}

fn cofre(endereco: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICO_COFRE, endereco).map_err(|e| format!("cofre do sistema indisponível: {e}"))
}

type Sessao = imap::Session<native_tls::TlsStream<std::net::TcpStream>>;

/// Abre a conexão TLS e faz o login. A mensagem de erro nunca contém a senha.
fn entrar(endereco: &str, senha: &str) -> Result<Sessao, String> {
    let tls = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| format!("não consegui preparar a conexão segura: {e}"))?;
    let cliente = imap::connect((SERVIDOR, PORTA), SERVIDOR, &tls)
        .map_err(|e| format!("não consegui falar com o Gmail: {e}"))?;
    cliente.login(endereco, senha).map_err(|(erro, _)| traduzir_erro_login(&erro.to_string()))
}

/// Explica em português os erros de login mais comuns do Gmail.
fn traduzir_erro_login(mensagem: &str) -> String {
    let m = mensagem.to_lowercase();
    if m.contains("application-specific password required") {
        "O Gmail pediu uma senha de app: parece que foi usada a senha normal da conta.".into()
    } else if m.contains("authenticationfailed") || m.contains("invalid credentials") {
        "E-mail ou senha de app recusados. Confira o e-mail completo e as 16 letras da senha de app.".into()
    } else if m.contains("web login required") || m.contains("webalert") {
        "O Google pediu um login pelo navegador antes. Entre na conta pelo navegador e tente de novo.".into()
    } else {
        format!("o Gmail recusou o login: {mensagem}")
    }
}

/// Testa o login e, se der certo, guarda a senha de app no cofre do sistema.
#[tauri::command]
pub async fn email_conectar(endereco: String, senha: String) -> Result<(), String> {
    // O Google mostra a senha em grupos ("abcd efgh ..."): os espaços não fazem parte dela.
    let senha: String = senha.chars().filter(|c| !c.is_whitespace()).collect();
    tauri::async_runtime::spawn_blocking(move || {
        let mut sessao = entrar(&endereco, &senha)?;
        let _ = sessao.logout();
        cofre(&endereco)?
            .set_password(&senha)
            .map_err(|e| format!("não consegui guardar a senha no cofre do sistema: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Diz se há uma senha guardada para este endereço (sem revelá-la).
#[tauri::command]
pub fn email_conectado(endereco: String) -> bool {
    cofre(&endereco).and_then(|c| c.get_password().map_err(|e| e.to_string())).is_ok()
}

/// Apaga a senha de app do cofre.
#[tauri::command]
pub fn email_desconectar(endereco: String) -> Result<(), String> {
    match cofre(&endereco)?.delete_credential() {
        Ok(()) => Ok(()),
        // Se já não havia senha, está tudo certo do mesmo jeito.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("não consegui apagar a senha do cofre: {e}")),
    }
}

/// Busca e-mails da caixa de entrada.
///
/// - `desde_uid`: só os que chegaram depois deste (busca incremental). É
///   ignorado se `uid_validity` não bater com o do servidor.
/// - `limite`: no máximo quantos e-mails (os mais recentes).
#[tauri::command]
pub async fn email_buscar(
    endereco: String,
    uid_validity: Option<u32>,
    desde_uid: Option<u32>,
    limite: u32,
) -> Result<Lote, String> {
    tauri::async_runtime::spawn_blocking(move || buscar(&endereco, uid_validity, desde_uid, limite as usize))
        .await
        .map_err(|e| e.to_string())?
}

fn buscar(endereco: &str, uid_validity: Option<u32>, desde_uid: Option<u32>, limite: usize) -> Result<Lote, String> {
    let senha = cofre(endereco)?
        .get_password()
        .map_err(|_| "não há senha de app guardada: conecte o e-mail de novo".to_string())?;
    let mut sessao = entrar(endereco, &senha)?;

    // EXAMINE abre a caixa só para leitura.
    let caixa = sessao.examine("INBOX").map_err(|e| format!("não consegui abrir a caixa de entrada: {e}"))?;
    let validade_servidor = caixa.uid_validity.unwrap_or(0);
    let incremental = uid_validity == Some(validade_servidor);

    let consulta = match desde_uid {
        Some(ultimo) if incremental => format!("UID {}:*", ultimo + 1),
        _ => "ALL".to_string(),
    };
    let encontrados: HashSet<u32> = sessao.uid_search(&consulta).map_err(|e| format!("erro na busca: {e}"))?;
    let mut uids: Vec<u32> = encontrados
        .into_iter()
        // "N:*" sempre devolve pelo menos a última mensagem, mesmo que ela seja antiga.
        .filter(|uid| !incremental || desde_uid.map_or(true, |ultimo| *uid > ultimo))
        .collect();
    uids.sort_unstable();
    let inicio = uids.len().saturating_sub(limite);
    let uids = &uids[inicio..];

    let parser = MessageParser::default();
    let mut emails = Vec::with_capacity(uids.len());
    for grupo in uids.chunks(LOTE_FETCH) {
        let conjunto = grupo.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
        // BODY.PEEK não marca como lido.
        let respostas = sessao
            .uid_fetch(&conjunto, "(UID FLAGS INTERNALDATE BODY.PEEK[])")
            .map_err(|e| format!("erro ao baixar e-mails: {e}"))?;
        for resposta in respostas.iter() {
            let Some(uid) = resposta.uid else { continue };
            let flags = resposta.flags();
            let lido = flags.iter().any(|f| matches!(f, Flag::Seen));
            let estrela = flags.iter().any(|f| matches!(f, Flag::Flagged));
            let chegada = resposta.internal_date().map(|d| d.to_rfc3339()).unwrap_or_default();

            let Some(bruto) = resposta.body() else { continue };
            let Some(mensagem) = parser.parse(bruto) else { continue };
            let remetente = mensagem.from().and_then(|lista| lista.first());
            let corpo = mensagem
                .body_text(0)
                .map(|t| t.into_owned())
                .or_else(|| mensagem.body_html(0).map(|h| html_para_texto(&h)))
                .unwrap_or_default();

            emails.push(EmailBruto {
                uid,
                de_nome: remetente.as_ref().and_then(|r| r.name()).unwrap_or_default().to_string(),
                de_email: remetente.as_ref().and_then(|r| r.address()).unwrap_or_default().to_string(),
                assunto: mensagem.subject().unwrap_or_default().to_string(),
                data: mensagem.date().map(|d| d.to_rfc3339()).unwrap_or(chegada),
                corpo: corpo.chars().take(LIMITE_CORPO).collect(),
                html: html_com_imagens(&mensagem),
                lido,
                estrela,
            });
        }
    }
    let _ = sessao.logout();
    Ok(Lote { uid_validity: validade_servidor, emails })
}

/// A versão HTML do e-mail, com as imagens anexadas (`src="cid:..."`)
/// trocadas por `data:` para aparecerem sem buscar nada fora. Imagens da
/// internet continuam como endereço e carregam ao abrir o e-mail.
fn html_com_imagens(mensagem: &mail_parser::Message<'_>) -> Option<String> {
    use base64::Engine;

    let mut html = mensagem.body_html(0)?.into_owned();
    if html.len() > LIMITE_HTML {
        return None;
    }
    let mut usado = 0usize;
    for parte in mensagem.attachments() {
        let Some(id) = parte.content_id() else { continue };
        let Some(tipo) = parte.content_type() else { continue };
        if !tipo.ctype().eq_ignore_ascii_case("image") {
            continue;
        }
        // Tamanho antes de decodificar: não gasta tempo com imagem que não vai entrar.
        if usado + parte.decoded_len() > LIMITE_IMAGENS {
            continue;
        }
        let dados = parte.decoded();
        if usado + dados.len() > LIMITE_IMAGENS {
            continue;
        }
        let id = id.trim_matches(|c| c == '<' || c == '>');
        let referencia = format!("cid:{id}");
        if !html.contains(&referencia) {
            continue;
        }
        let subtipo = tipo.subtype().unwrap_or("png");
        let embutida = format!(
            "data:image/{subtipo};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&dados)
        );
        html = html.replace(&referencia, &embutida);
        usado += dados.len();
    }
    Some(html)
}

/// Versão em texto de um e-mail que só tem HTML: tira as tags e junta os espaços.
/// O app mostra o e-mail como TEXTO puro, nunca interpreta HTML.
fn html_para_texto(html: &str) -> String {
    let mut texto = String::with_capacity(html.len());
    let mut dentro_tag = false;
    let mut nome_tag = String::new();
    let mut ignorar = false; // dentro de <style> ou <script>
    for c in html.chars() {
        match c {
            '<' => {
                dentro_tag = true;
                nome_tag.clear();
            }
            '>' if dentro_tag => {
                dentro_tag = false;
                let nome = nome_tag.trim_start_matches('/').to_lowercase();
                let fecha = nome_tag.starts_with('/');
                if nome == "style" || nome == "script" {
                    ignorar = !fecha;
                }
                if matches!(nome.as_str(), "br" | "p" | "div" | "tr" | "li" | "h1" | "h2" | "h3") {
                    texto.push('\n');
                }
            }
            _ if dentro_tag => {
                if !c.is_whitespace() && !nome_tag.contains(' ') {
                    nome_tag.push(c);
                } else {
                    nome_tag.push(' ');
                }
            }
            _ if !ignorar => texto.push(c),
            _ => {}
        }
    }
    let texto = texto.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"");
    // Junta espaços repetidos e limita as linhas em branco seguidas a uma.
    let mut resultado = String::new();
    let mut brancas = 0;
    for linha in texto.lines().map(|l| l.split_whitespace().collect::<Vec<_>>().join(" ")) {
        if linha.is_empty() {
            brancas += 1;
            if brancas > 1 {
                continue;
            }
        } else {
            brancas = 0;
        }
        resultado.push_str(&linha);
        resultado.push('\n');
    }
    resultado.trim().to_string()
}

#[cfg(test)]
mod testes {
    use super::{html_com_imagens, html_para_texto};

    #[test]
    fn html_vira_texto() {
        let html = "<html><style>p{color:red}</style><p>Ol&aacute;, <b>turma</b>!</p><p>Prova&nbsp;quinta.</p></html>";
        let texto = html_para_texto(html);
        assert!(texto.contains("turma!"));
        assert!(texto.contains("Prova quinta."));
        assert!(!texto.contains("color"));
    }

    #[test]
    fn embute_imagem_anexada_e_mantem_as_da_internet() {
        let bruto = concat!(
            "From: Professora <prof@exemplo.edu.br>\r\n",
            "Subject: Aula\r\n",
            "MIME-Version: 1.0\r\n",
            "Content-Type: multipart/related; boundary=\"b\"\r\n\r\n",
            "--b\r\n",
            "Content-Type: text/html; charset=utf-8\r\n\r\n",
            "<p>Oi</p><img src=\"cid:logo@x\"><img src=\"https://exemplo.edu.br/a.png\">\r\n",
            "--b\r\n",
            "Content-Type: image/png\r\n",
            "Content-ID: <logo@x>\r\n",
            "Content-Transfer-Encoding: base64\r\n\r\n",
            "iVBORw0KGgo=\r\n",
            "--b--\r\n",
        );
        let mensagem = mail_parser::MessageParser::default().parse(bruto.as_bytes()).unwrap();
        let html = html_com_imagens(&mensagem).unwrap();
        assert!(html.contains("src=\"data:image/png;base64,iVBORw0KGgo=\""));
        assert!(html.contains("https://exemplo.edu.br/a.png"));
        assert!(!html.contains("cid:"));
    }
}
