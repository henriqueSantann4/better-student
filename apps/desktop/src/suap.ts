import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { configuracao, type Banco } from "@better-student/shared";

/**
 * Endereço padrão do SUAP. É só o valor inicial: cada usuário pode trocar
 * pelo SUAP do seu instituto (fica salvo na configuração "suapServidor").
 */
export const SERVIDOR_SUAP_PADRAO = "https://suap.ifsp.edu.br/";

/** O modo automático depende da janela do SUAP, que só existe no app Tauri. */
export const suapAutomaticoDisponivel = isTauri;

export async function lerServidorSuap(banco: Banco): Promise<string> {
  return (await configuracao.ler<string>(banco, "suapServidor")) ?? SERVIDOR_SUAP_PADRAO;
}

export async function gravarServidorSuap(banco: Banco, servidor: string): Promise<void> {
  await configuracao.gravar(banco, "suapServidor", servidor);
}

/**
 * Abre a janela do SUAP e espera o boletim. O núcleo Rust manda o HTML pelo
 * evento "suap:boletim" quando o script da janela consegue buscá-lo (depois
 * que o usuário entra no SUAP). Devolve uma função para desistir da espera.
 */
export async function buscarBoletimNoSuap(
  servidor: string,
  aoReceber: (html: string) => void,
): Promise<UnlistenFn> {
  const parar = await listen<string>("suap:boletim", (evento) => {
    parar();
    aoReceber(evento.payload);
  });
  try {
    await invoke("abrir_suap", { servidor });
  } catch (erro) {
    parar();
    throw erro;
  }
  return parar;
}
