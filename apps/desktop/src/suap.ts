import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { configuracao, type Banco } from "@better-student/shared";

/** O modo automático depende da janela do SUAP, que só existe no app Tauri. */
export const suapAutomaticoDisponivel = isTauri;

/**
 * Endereço do SUAP, que vem do perfil da instituição escolhida (e pode ser
 * trocado em Configurações). `null` = a instituição não usa SUAP.
 */
export async function lerServidorSuap(banco: Banco): Promise<string | null> {
  return configuracao.ler<string>(banco, "suapServidor");
}

export async function gravarServidorSuap(banco: Banco, servidor: string | null): Promise<void> {
  await configuracao.gravar(banco, "suapServidor", servidor);
}

/** O que a janela do SUAP entrega: boletim e, se achou, horários de aula e calendário acadêmico. */
export interface PacoteSuap {
  boletim: string;
  horarios: string | null;
  calendario: string | null;
  /** "Detalhar" de cada disciplina, com o número do diário. */
  detalhes: { diario: string; html: string }[];
}

/**
 * Abre a janela do SUAP e espera o boletim. O núcleo Rust manda o pacote pelo
 * evento "suap:boletim" quando o script da janela consegue buscá-lo (depois
 * que o usuário entra no SUAP). Devolve uma função para desistir da espera.
 */
export async function buscarBoletimNoSuap(
  servidor: string,
  aoReceber: (pacote: PacoteSuap) => void,
): Promise<UnlistenFn> {
  const parar = await listen<PacoteSuap>("suap:boletim", (evento) => {
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
