/**
 * Ponte entre a tela de e-mail e o núcleo Rust (src-tauri/src/email.rs).
 *
 * A senha de app atravessa para o Rust uma única vez, em `conectar`, e vai
 * para o cofre do sistema. Daí em diante o TypeScript nunca a vê: só pede
 * "busque os e-mails desta conta".
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { classificarEmail, emails, type Banco, type EmailRecebido, type LoteRecebido } from "@better-student/shared";

/** A conexão IMAP só existe no app (precisa do núcleo Rust). */
export const conexaoDisponivel = isTauri;

/** Quantos e-mails trazer na primeira vez e, depois, no máximo por atualização. */
const PRIMEIRA_CARGA = 150;
const POR_ATUALIZACAO = 300;

export function conectar(endereco: string, senha: string): Promise<void> {
  return invoke("email_conectar", { endereco, senha });
}

export function estaConectado(endereco: string): Promise<boolean> {
  return invoke<boolean>("email_conectado", { endereco });
}

export async function desconectar(banco: Banco, endereco: string): Promise<void> {
  await invoke("email_desconectar", { endereco });
  await emails.limpar(banco, endereco);
}

export interface ResultadoSincronia {
  quantidade: number;
  /**
   * Os que chegaram agora na aba Principal e ainda não lidos (para a caixa
   * "Enquanto você estava fora"). Vazio na primeira busca: ali tudo é "novo".
   */
  importantes: EmailRecebido[];
}

/** Busca em andamento, por conta: uma segunda chamada espera a mesma busca. */
const emAndamento = new Map<string, Promise<ResultadoSincronia>>();

/**
 * Traz do Gmail só o que é novo (desde o maior UID já guardado) e grava na
 * cópia local. Uma busca por vez: a tela de e-mail e a atualização ao abrir
 * o app compartilham a mesma conexão em vez de abrir duas.
 */
export function sincronizar(banco: Banco, endereco: string): Promise<ResultadoSincronia> {
  const atual = emAndamento.get(endereco);
  if (atual) return atual;
  const busca = (async () => {
    const estado = await emails.estado(banco, endereco);
    const lote = await invoke<LoteRecebido>("email_buscar", {
      endereco,
      uidValidity: estado?.uidValidity ?? null,
      desdeUid: estado?.maiorUid ?? null,
      limite: estado ? POR_ATUALIZACAO : PRIMEIRA_CARGA,
    });
    const quantidade = await emails.gravarLote(banco, endereco, lote);
    const importantes = estado
      ? lote.emails.filter((e) => !e.lido && classificarEmail(e.deEmail, e.assunto) === "principal")
      : [];
    return { quantidade, importantes };
  })().finally(() => emAndamento.delete(endereco));
  emAndamento.set(endereco, busca);
  return busca;
}

/**
 * Abre uma página da conta Google no navegador do sistema, já na conta certa
 * (`authuser`). O plugin só tem permissão para myaccount.google.com.
 */
export async function abrirContaGoogle(caminho: "verificacao" | "senhasDeApp", endereco: string): Promise<void> {
  const destino = caminho === "verificacao" ? "signinoptions/twosv" : "apppasswords";
  const url = `https://myaccount.google.com/${destino}?authuser=${encodeURIComponent(endereco)}`;
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener");
}
