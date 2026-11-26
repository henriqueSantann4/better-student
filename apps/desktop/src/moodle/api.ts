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
  lerAtividadesMoodle,
  lerDisciplinasMoodle,
  lerInfoSite,
  lerNotasMoodle,
  parametrosMoodle,
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
    await invoke("moodle_conectar", { site });
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

/** Notas de uma sala do Moodle. `erro` quando o Moodle não deixou ler aquela sala. */
export interface NotasDaSala {
  sala: DisciplinaMoodle;
  notas: NotaMoodle[];
  erro: boolean;
}

/**
 * Notas de todas as salas em que o aluno está inscrito (uma chamada por
 * sala, em paralelo). Uma sala que falhar não derruba as outras.
 */
export async function carregarNotas(site: string): Promise<NotasDaSala[]> {
  const info = lerInfoSite(await chamar(site, "core_webservice_get_site_info"));
  const salas = lerDisciplinasMoodle(await chamar(site, "core_enrol_get_users_courses", { userid: info.idUsuario }));
  return Promise.all(
    salas.map(async (sala) => {
      try {
        const resposta = await chamar(site, "gradereport_user_get_grade_items", { courseid: sala.id, userid: info.idUsuario });
        return { sala, notas: lerNotasMoodle(resposta, site), erro: false };
      } catch {
        return { sala, notas: [], erro: true };
      }
    }),
  );
}

/** Abre uma atividade no navegador do sistema (o plugin só abre https://*.edu.br). */
export async function abrirNoNavegador(url: string): Promise<void> {
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener");
}
