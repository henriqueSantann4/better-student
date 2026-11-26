//! Materiais: as pastas de cada disciplina no disco.
//!
//! A interface (a página web dentro do app) não pode mexer em arquivos do
//! computador. Estes comandos fazem o mínimo por ela, e TODOS só trabalham
//! dentro da pasta de materiais: os nomes de pasta e de arquivo não podem
//! ter barras nem "..", e o caminho final é conferido depois de resolvido.
//! Assim, mesmo um erro na interface não alcança outros arquivos.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

/// Maior arquivo que o app baixa do Moodle (500 MB).
const MAXIMO_DOWNLOAD: u64 = 500 * 1024 * 1024;

#[derive(serde::Serialize)]
pub struct ArquivoMaterial {
    nome: String,
    tamanho: u64,
    /// Última alteração, em milissegundos desde 1970 (como o `Date` do JS).
    modificado: u64,
}

#[derive(serde::Serialize)]
pub struct PastaMaterial {
    pasta: String,
    arquivos: Vec<ArquivoMaterial>,
}

/// A raiz precisa ser um caminho absoluto; é criada se não existir.
fn raiz_valida(raiz: &str) -> Result<PathBuf, String> {
    let caminho = PathBuf::from(raiz.trim());
    if !caminho.is_absolute() {
        return Err("a pasta de materiais precisa ser um caminho completo".into());
    }
    fs::create_dir_all(&caminho).map_err(|e| format!("não consegui criar a pasta de materiais: {e}"))?;
    caminho.canonicalize().map_err(|e| e.to_string())
}

/// Um nome simples (de pasta ou de arquivo), sem separadores nem "..".
fn nome_valido(nome: &str) -> Result<&str, String> {
    let ok = !nome.is_empty()
        && nome.len() <= 255
        && nome != "."
        && nome != ".."
        && !nome.chars().any(|c| matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*') || c.is_control());
    if ok {
        Ok(nome)
    } else {
        Err(format!("nome inválido: {nome}"))
    }
}

/// Caminho de uma pasta de disciplina, conferindo que fica dentro da raiz.
fn pasta_dentro(raiz: &Path, pasta: &str) -> Result<PathBuf, String> {
    let caminho = raiz.join(nome_valido(pasta)?);
    fs::create_dir_all(&caminho).map_err(|e| format!("não consegui criar a pasta {pasta}: {e}"))?;
    let real = caminho.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(raiz) {
        return Err("caminho fora da pasta de materiais".into());
    }
    Ok(real)
}

/// Um nome que ainda não existe na pasta: "aula.pdf", "aula (2).pdf"...
fn nome_livre(pasta: &Path, nome: &str) -> PathBuf {
    let candidato = pasta.join(nome);
    if !candidato.exists() {
        return candidato;
    }
    let (base, extensao) = match nome.rfind('.') {
        Some(i) if i > 0 => (&nome[..i], &nome[i..]),
        _ => (nome, ""),
    };
    (2..)
        .map(|n| pasta.join(format!("{base} ({n}){extensao}")))
        .find(|c| !c.exists())
        .expect("sempre há um nome livre")
}

/// Pasta padrão: Documentos\Better Student\Materiais.
#[tauri::command]
pub fn materiais_pasta_padrao(app: AppHandle) -> Result<String, String> {
    let documentos = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(documentos.join("Better Student").join("Materiais").to_string_lossy().into_owned())
}

/// Cria as pastas que faltarem e lista os arquivos de cada uma (sem subpastas
/// nem arquivos ocultos ou temporários do Office).
#[tauri::command]
pub fn materiais_listar(raiz: String, pastas: Vec<String>) -> Result<Vec<PastaMaterial>, String> {
    let raiz = raiz_valida(&raiz)?;
    pastas
        .iter()
        .map(|pasta| {
            let caminho = pasta_dentro(&raiz, pasta)?;
            let mut arquivos: Vec<ArquivoMaterial> = fs::read_dir(&caminho)
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .filter_map(|entrada| {
                    let nome = entrada.file_name().to_string_lossy().into_owned();
                    let dados = entrada.metadata().ok()?;
                    if !dados.is_file() || nome.starts_with('.') || nome.starts_with("~$") {
                        return None;
                    }
                    let modificado = dados
                        .modified()
                        .ok()
                        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                        .map_or(0, |d| d.as_millis() as u64);
                    Some(ArquivoMaterial { nome, tamanho: dados.len(), modificado })
                })
                .collect();
            arquivos.sort_by_key(|a| a.nome.to_lowercase());
            Ok(PastaMaterial { pasta: pasta.clone(), arquivos })
        })
        .collect()
}

/// Copia arquivos (arrastados para a tela) para a pasta da disciplina. Se já
/// existir um com o mesmo nome, o novo ganha um número. Devolve os nomes finais.
#[tauri::command]
pub fn materiais_copiar(raiz: String, pasta: String, origens: Vec<String>) -> Result<Vec<String>, String> {
    let raiz = raiz_valida(&raiz)?;
    let destino = pasta_dentro(&raiz, &pasta)?;
    let mut nomes = Vec::new();
    for origem in origens {
        let origem = PathBuf::from(origem);
        // Só arquivos: pastas arrastadas são ignoradas.
        if !origem.is_file() {
            continue;
        }
        let nome = origem.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let final_ = nome_livre(&destino, nome_valido(&nome)?);
        fs::copy(&origem, &final_).map_err(|e| format!("não consegui copiar {nome}: {e}"))?;
        nomes.push(final_.file_name().unwrap_or_default().to_string_lossy().into_owned());
    }
    Ok(nomes)
}

/// Abre um arquivo no programa padrão do Windows, ou a pasta no Explorer
/// (sem `arquivo`). Feito aqui, e não pela interface, para valer a regra de
/// só abrir o que está dentro da pasta de materiais.
#[tauri::command]
pub fn materiais_abrir(app: AppHandle, raiz: String, pasta: Option<String>, arquivo: Option<String>) -> Result<(), String> {
    let raiz = raiz_valida(&raiz)?;
    let mut alvo = match pasta {
        Some(p) => pasta_dentro(&raiz, &p)?,
        None => raiz.clone(),
    };
    if let Some(nome) = arquivo {
        alvo = alvo.join(nome_valido(&nome)?);
        if !alvo.is_file() {
            return Err("arquivo não encontrado".into());
        }
    }
    app.opener()
        .open_path(alvo.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("não consegui abrir: {e}"))
}

/// Baixa um arquivo do Moodle direto para a pasta da disciplina.
///
/// A chave do Moodle é lida do cofre aqui mesmo e não passa pela interface.
/// Só aceita endereços de arquivo (`/webservice/pluginfile.php/`) do próprio
/// site conectado, para a chave nunca ser enviada a outro lugar. Grava num
/// arquivo temporário e só renomeia no fim: um download cortado não deixa
/// arquivo pela metade com o nome certo.
#[tauri::command]
pub async fn materiais_baixar_moodle(
    raiz: String,
    pasta: String,
    nome: String,
    url: String,
    site: String,
) -> Result<u64, String> {
    // Rede e disco são lentos: roda fora da thread principal.
    tauri::async_runtime::spawn_blocking(move || baixar(&raiz, &pasta, &nome, &url, &site))
        .await
        .map_err(|e| e.to_string())?
}

fn baixar(raiz: &str, pasta: &str, nome: &str, url: &str, site: &str) -> Result<u64, String> {
    let raiz = raiz_valida(raiz)?;
    let destino = pasta_dentro(&raiz, pasta)?.join(nome_valido(nome)?);

    let site_url: tauri::Url = site.trim().parse().map_err(|_| "endereço do Moodle inválido".to_string())?;
    let mut endereco: tauri::Url = url.parse().map_err(|_| "endereço do arquivo inválido".to_string())?;
    if endereco.scheme() != "https"
        || endereco.host_str() != site_url.host_str()
        || !endereco.path().contains("/webservice/pluginfile.php/")
    {
        return Err("o arquivo não é do Moodle conectado".into());
    }
    let chave = crate::moodle::moodle_chave(site.to_string())?;
    endereco.query_pairs_mut().append_pair("token", &chave);

    let tls = native_tls::TlsConnector::new().map_err(|e| e.to_string())?;
    let agente = ureq::AgentBuilder::new()
        .tls_connector(Arc::new(tls))
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(60))
        .build();
    let resposta = agente.get(endereco.as_str()).call().map_err(|e| match e {
        // Não repete o endereço no erro: ele contém a chave.
        ureq::Error::Status(codigo, _) => format!("o Moodle respondeu HTTP {codigo}"),
        ureq::Error::Transport(t) => format!("falha de conexão com o Moodle: {}", t.kind()),
    })?;
    // O Moodle responde 200 com um JSON de erro quando a chave não vale.
    if resposta.content_type() == "application/json" {
        return Err("o Moodle recusou o download (chave expirada?)".into());
    }

    let temporario = destino.with_extension("baixando");
    let mut saida = fs::File::create(&temporario).map_err(|e| e.to_string())?;
    let mut leitor = resposta.into_reader().take(MAXIMO_DOWNLOAD + 1);
    let copiados = std::io::copy(&mut leitor, &mut saida).map_err(|e| {
        let _ = fs::remove_file(&temporario);
        format!("download interrompido: {e}")
    })?;
    saida.flush().map_err(|e| e.to_string())?;
    drop(saida);
    if copiados > MAXIMO_DOWNLOAD {
        let _ = fs::remove_file(&temporario);
        return Err("arquivo grande demais (mais de 500 MB)".into());
    }
    fs::rename(&temporario, &destino).map_err(|e| {
        let _ = fs::remove_file(&temporario);
        format!("não consegui salvar {nome}: {e}")
    })?;
    Ok(copiados)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn recusa_nomes_que_saem_da_pasta() {
        for ruim in ["", ".", "..", "a/b", "a\\b", "C:", "x?.pdf", "nome\u{0}"] {
            assert!(nome_valido(ruim).is_err(), "deveria recusar {ruim:?}");
        }
        assert!(nome_valido("Matemática Aplicada à Informática").is_ok());
        assert!(nome_valido("aula 1 (2).pdf").is_ok());
    }

    #[test]
    fn numera_quando_o_nome_ja_existe() {
        let pasta = std::env::temp_dir().join(format!("bs-materiais-{}", std::process::id()));
        fs::create_dir_all(&pasta).unwrap();
        fs::write(pasta.join("aula.pdf"), b"1").unwrap();
        fs::write(pasta.join("aula (2).pdf"), b"2").unwrap();
        assert_eq!(nome_livre(&pasta, "aula.pdf"), pasta.join("aula (3).pdf"));
        assert_eq!(nome_livre(&pasta, "nova.pdf"), pasta.join("nova.pdf"));
        fs::remove_dir_all(&pasta).unwrap();
    }

    #[test]
    fn raiz_precisa_ser_absoluta() {
        assert!(raiz_valida("Documentos\\Materiais").is_err());
    }
}
