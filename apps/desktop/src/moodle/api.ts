/**
 * Ponte com o Moodle.
 *
 * - O LOGIN é do núcleo Rust (src-tauri/src/moodle.rs): ele abre a janela do
 *   Moodle, captura a chave no fim do login pelo SUAP e a guarda no cofre do
 *   Windows. O resultado chega aqui pelos eventos `moodle:conectado`/`moodle:erro`.
 * - As CHAMADAS à API saem daqui (o Moodle aceita chamadas do app, via CORS).
 *   A chave é pedida ao cofre a cada chamada e não fica guardada na tela.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  configuracao,
  conferirResposta,
  lerArquivosMoodle,
  lerAtividadesMoodle,
  lerDisciplinasMoodle,
  lerInfoSite,
  lerNotasMoodle,
  parametrosMoodle,
  type ArquivoMoodle,
  type AtividadeMoodle,
  type Banco,
  type DisciplinaMoodle,
  type InfoSite,
  type NotaMoodle,
} from "@better-student/shared";

export const moodleDisponivel = isTauri;

/**
 * Endereço do Moodle, que vem do perfil do campus (e pode ser trocado em
 * Configurações). `null` = ainda não sabemos o Moodle do campus.
 */
export async function lerSiteMoodle(banco: Banco): Promise<string | null> {
  return configuracao.ler<string>(banco, "moodleSite");
}

export function estaConectado(site: string): Promise<boolean> {
  return invoke<boolean>("moodle_conectado", { site });
}

export async function desconectar(site: string): Promise<void> {
  await invoke("moodle_desconectar", { site });
}

/**
 * Abre a janela de login e espera o resultado. Devolve uma função para
 * desistir da espera (se o usuário fechar a janela, nada chega).
 */
export async function conectar(
  banco: Banco,
  site: string,
  aoTerminar: (erro: string | null) => void,
  silencioso = false,
): Promise<() => void> {
  await configuracao.gravar(banco, "moodleSite", site);
  const pararOk = await listen("moodle:conectado", () => {
    parar();
    aoTerminar(null);
  });
  const pararErro = await listen<string>("moodle:erro", (evento) => {
    parar();
    aoTerminar(evento.payload);
  });
  const parar = () => {
    pararOk();
    pararErro();
  };
  try {
    await invoke("moodle_conectar", { site, silencioso });
  } catch (erro) {
    parar();
    throw erro;
  }
  return parar;
}

async function chamar(site: string, funcao: string, parametros: Record<string, unknown> = {}): Promise<unknown> {
  const chave = await invoke<string>("moodle_chave", { site });
  const corpo = new URLSearchParams([
    ["wstoken", chave],
    ["wsfunction", funcao],
    ["moodlewsrestformat", "json"],
    ...parametrosMoodle(parametros),
  ]);
  const resposta = await fetch(`${site.replace(/\/+$/, "")}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo,
  });
  if (!resposta.ok) throw new Error(`o Moodle respondeu HTTP ${resposta.status}`);
  return conferirResposta(await resposta.json());
}

export interface PainelMoodle {
  info: InfoSite;
  disciplinas: DisciplinaMoodle[];
  atividades: AtividadeMoodle[];
}

/** Tudo o que a tela mostra, numa ida só ao Moodle. */
export async function carregarPainel(site: string): Promise<PainelMoodle> {
  const info = lerInfoSite(await chamar(site, "core_webservice_get_site_info"));
  const [cursos, eventos] = await Promise.all([
    chamar(site, "core_enrol_get_users_courses", { userid: info.idUsuario }),
    // Da "Linha do tempo": atividades com prazo a partir de agora.
    chamar(site, "core_calendar_get_action_events_by_timesort", {
      timesortfrom: Math.floor(Date.now() / 1000) - 24 * 3600,
      limitnum: 50,
    }),
  ]);
  return { info, disciplinas: lerDisciplinasMoodle(cursos), atividades: lerAtividadesMoodle(eventos) };
}

/** Notas de uma sala do Moodle (itens do livro de notas, sem os totais). */
export async function carregarNotasDaSala(site: string, salaId: number, idUsuario: number): Promise<NotaMoodle[]> {
  const resposta = await chamar(site, "gradereport_user_get_grade_items", { courseid: salaId, userid: idUsuario });
  return lerNotasMoodle(resposta, site);
}

/** Arquivos que os professores postaram numa sala (slides, PDFs, listas). */
export async function carregarArquivosDaSala(site: string, salaId: number): Promise<ArquivoMoodle[]> {
  return lerArquivosMoodle(await chamar(site, "core_course_get_contents", { courseid: salaId }));
}

/** Abre uma atividade no navegador do sistema (o plugin só abre https://*.edu.br). */
export async function abrirNoNavegador(url: string): Promise<void> {
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener");
}

/** Motivo de falha quando a tentativa escondida esbarra no login do SUAP. */
export const PRECISA_ENTRAR_SUAP = "precisa_entrar_suap";

/** Tempo máximo esperando o login escondido do Moodle. */
const ESPERA_ESCONDIDO_MS = 45_000;

/**
 * Tenta entrar no Moodle sem aparecer, aproveitando a sessão do SUAP (o
 * Moodle do IFSP entra pelo SUAP). `null` = conectou; senão, o motivo
 * (`PRECISA_ENTRAR_SUAP` quando o SUAP pediu login).
 */
export function conectarEscondido(banco: Banco, site: string): Promise<string | null> {
  return new Promise((resolver) => {
    let parar: (() => void) | null = null;
    const relogio = window.setTimeout(() => {
      parar?.();
      void invoke("moodle_fechar_escondido").catch(() => undefined);
      resolver("demorou");
    }, ESPERA_ESCONDIDO_MS);
    conectar(banco, site, (erro) => {
      window.clearTimeout(relogio);
      resolver(erro);
    }, true)
      .then((desligar) => (parar = desligar))
      .catch((erro) => {
        window.clearTimeout(relogio);
        resolver(String(erro));
      });
  });
}

