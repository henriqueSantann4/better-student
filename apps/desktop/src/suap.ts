import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  configuracao,
  lerBoletimSuap,
  lerCalendarioSuap,
  lerDetalheNotasSuap,
  lerHorariosSuap,
  type Banco,
  type BoletimSuap,
  type ExtrasSuap,
} from "@better-student/shared";

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

/** Executa um leitor; se ele falhar, devolve `null`. */
function tentar<T>(ler: () => T): T | null {
  try {
    return ler();
  } catch {
    return null;
  }
}

/**
 * Lê as páginas que a janela do SUAP entregou. O boletim é obrigatório (lança
 * `ErroBoletim` se não der para ler); horários, calendário e detalhamento são
 * bônus: o que não der para ler fica de fora.
 */
export function lerPacoteSuap(pacote: PacoteSuap): { boletim: BoletimSuap; extras: ExtrasSuap } {
  const boletim = lerBoletimSuap(pacote.boletim);
  return {
    boletim,
    extras: {
      horarios: pacote.horarios ? tentar(() => lerHorariosSuap(pacote.horarios!)) : null,
      calendario: pacote.calendario ? tentar(() => lerCalendarioSuap(pacote.calendario!)) : null,
      detalhes: (pacote.detalhes ?? []).flatMap(({ diario, html }) => {
        const detalhe = tentar(() => lerDetalheNotasSuap(html));
        return detalhe && detalhe.etapas.length > 0 ? [{ diario, detalhe }] : [];
      }),
    },
  };
}

/** Resultado da busca escondida: o pacote, ou o motivo de não ter dado. */
export type RespostaSuapEscondido = { pacote: PacoteSuap } | { semSessao: string };

/** Tempo máximo esperando a janela escondida (o SUAP às vezes é lento). */
const ESPERA_ESCONDIDO_MS = 120_000;

/**
 * Atualiza sem aparecer: abre a janela do SUAP escondida, que aproveita a
 * sessão ainda aberta do site. Se o SUAP pedir login (sessão expirou),
 * devolve `{ semSessao: "login" }` e o app mostra o botão para entrar.
 */
export function buscarSuapEscondido(servidor: string): Promise<RespostaSuapEscondido> {
  return new Promise((resolver, rejeitar) => {
    const paradas: UnlistenFn[] = [];
    let terminou = false;
    const terminar = (fazer: () => void) => {
      if (terminou) return;
      terminou = true;
      window.clearTimeout(relogio);
      paradas.forEach((parar) => parar());
      fazer();
    };
    const relogio = window.setTimeout(() => {
      void invoke("fechar_suap_escondido").catch(() => undefined);
      terminar(() => rejeitar(new Error("o SUAP demorou demais para responder")));
    }, ESPERA_ESCONDIDO_MS);

    void (async () => {
      try {
        paradas.push(await listen<PacoteSuap>("suap:boletim", (e) => terminar(() => resolver({ pacote: e.payload }))));
        paradas.push(await listen<string>("suap:sem_sessao", (e) => terminar(() => resolver({ semSessao: e.payload }))));
        await invoke("abrir_suap", { servidor, silencioso: true });
      } catch (erro) {
        terminar(() => rejeitar(erro));
      }
    })();
  });
}
