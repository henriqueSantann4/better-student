import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  diaSemanaDe,
  estadoDaAula,
  proximoDiaDeAulas,
  proximosPrazos,
  configuracao,
  emails as repoEmails,
  novidades as repoNovidades,
  tarefas as repoTarefas,
  type Disciplina,
  type Email,
  type Novidade,
  type FilaPrazo,
  type Tarefa,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { destinoDaNovidade, destinoDoAviso, nomeDaDisciplina, textoDaNovidade, textoDoAviso, type Destino } from "../avisos";
import { useSincronizacao } from "../sincronizacao";
import { useAvisos } from "./Novidades";
import { estaConectado as emailConectado, conexaoDisponivel } from "../email/conexao";
import { formatarDataEmail, formatarDiaMes, formatarPrazo, nomeDia } from "../formatos";

/** O relógio da tela, atualizado a cada minuto (só enquanto ela está aberta). */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

/**
 * Tela Início: num relance, a próxima leva de aulas, os prazos mais próximos,
 * as notificações (avisos e novidades) e os e-mails mais recentes. Clicar
 * num item leva à tela dele; o check só marca como lido (fica em cinza).
 */
export function Inicio({ aoIr }: { aoIr: (destino: Destino, alvo?: string) => void }) {
  const { t } = useTranslation();
  const { banco, disciplinas } = useSemestre();
  const agora = useAgora();
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);

  // Tarefas mudam na Agenda; aqui basta ler ao abrir a tela.
  const { versao } = useSincronizacao();
  useEffect(() => {
    repoTarefas.listar(banco).then(setTarefas).catch(() => setTarefas([]));
  }, [banco, versao]);

  const hora = agora.getHours();
  const saudacao = hora < 5 ? "boaNoite" : hora < 12 ? "bomDia" : hora < 18 ? "boaTarde" : "boaNoite";
  const porId = new Map(disciplinas.map((d) => [d.id, d]));

  return (
    <>
      <header className="cabecalho inicio-cabecalho">
        <h1>{t(`inicio.${saudacao}`)}</h1>
        <span className="suave">
          {new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(agora)}
        </span>
      </header>
      {/* Duas colunas independentes: um quadro que cresce (as aulas) não abre
          buraco no outro lado. Notificações em cima, porque têm tamanho fixo. */}
      <div className="inicio-grade">
        <div className="inicio-coluna">
          <Notificacoes aoIr={aoIr} />
          <ProximasAulas agora={agora} porId={porId} aoIr={aoIr} />
        </div>
        <div className="inicio-coluna">
          <Prazos agora={agora} tarefas={tarefas} porId={porId} aoIr={aoIr} />
          <EmailsRecentes aoIr={aoIr} />
        </div>
      </div>
    </>
  );
}

function ProximasAulas({
  agora,
  porId,
  aoIr,
}: {
  agora: Date;
  porId: Map<string, Disciplina>;
  aoIr: (destino: Destino) => void;
}) {
  const { t } = useTranslation();
  const { semestre, horarios, eventos } = useSemestre();
  const dia = proximoDiaDeAulas(agora, horarios, eventos, semestre.fim);

  let titulo: string;
  if (!dia) titulo = t("inicio.aulas");
  else if (dia.distancia === 0) titulo = t("inicio.hoje", { dia: nomeDia(diaSemanaDe(dia.data)) });
  else if (dia.distancia === 1) titulo = t("inicio.amanha", { dia: nomeDia(diaSemanaDe(dia.data)) });
  else titulo = t("inicio.proximaAula", { dia: nomeDia(diaSemanaDe(dia.data)), data: formatarDiaMes(dia.data) });

  return (
    <section className="cartao inicio-cartao">
      <h2>{titulo}</h2>
      {!dia ? (
        horarios.length === 0 ? (
          <p className="suave">
            {t("inicio.semGrade")}{" "}
            <button type="button" className="link" onClick={() => aoIr("grade")}>
              {t("inicio.irGrade")}
            </button>
          </p>
        ) : (
          <p className="suave">{t("inicio.semAulas")}</p>
        )
      ) : (
        <>
          {dia.dia.motivo && dia.dia.letivo && (
            <p className="pequeno texto-atencao">{t("inicio.sabadoLetivo", { evento: dia.dia.motivo.titulo })}</p>
          )}
          <ul className="lista inicio-aulas">
            {dia.aulas.map((a) => {
              const d = porId.get(a.disciplinaId);
              const estado = dia.distancia === 0 ? estadoDaAula(a, agora) : "depois";
              return (
                <li key={a.id} className={`item ${estado === "encerrada" ? "passado" : ""}`}>
                  <span className="inicio-hora">{a.inicio}</span>
                  <span className="bolinha" style={{ background: d?.cor ?? undefined }} />
                  <div className="item-texto">
                    <strong>{d?.nome}</strong>
                    <span className="pequeno suave">
                      {a.inicio}–{a.fim}
                      {a.sala && ` · ${a.sala}`}
                    </span>
                  </div>
                  {estado === "agora" && <span className="etiqueta">{t("inicio.agora")}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

const FILAS: FilaPrazo[] = ["provas", "trabalhos", "tarefas"];

function Prazos({
  agora,
  tarefas,
  porId,
  aoIr,
}: {
  agora: Date;
  tarefas: Tarefa[] | null;
  porId: Map<string, Disciplina>;
  aoIr: (destino: Destino) => void;
}) {
  const { t } = useTranslation();
  if (tarefas === null) return <section className="cartao inicio-cartao" />;
  const prazos = proximosPrazos(tarefas, agora);
  const vazio = FILAS.every((f) => prazos[f].length === 0);

  return (
    <section className="cartao inicio-cartao">
      <div className="resumo-topo">
        <h2>{t("inicio.proximos")}</h2>
        <button type="button" className="link pequeno" onClick={() => aoIr("agenda")}>
          {t("inicio.verAgenda")}
        </button>
      </div>
      {vazio && <p className="suave">{t("inicio.semPrazos")}</p>}
      {FILAS.filter((f) => prazos[f].length > 0).map((fila) => (
        <div key={fila} className="inicio-fila">
          <h3 className="pequeno suave">{t(`inicio.fila.${fila}`)}</h3>
          <ul className="lista">
            {prazos[fila].map((tarefa) => {
              const d = tarefa.disciplinaId ? porId.get(tarefa.disciplinaId) : undefined;
              const quando = formatarPrazo(tarefa.prazo!, agora);
              const proximo = new Date(tarefa.prazo!).getTime() - agora.getTime() < 2 * 86_400_000;
              return (
                <li key={tarefa.id} className="item">
                  <span className="bolinha" style={{ background: d?.cor ?? undefined }} />
                  <div className="item-texto">
                    <strong>{tarefa.titulo}</strong>
                    {d && <span className="pequeno suave">{d.nome}</span>}
                  </div>
                  <span className={`pequeno inicio-quando ${proximo ? "texto-atencao" : "suave"}`}>{quando}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Uma linha de notificação: clicar no texto leva à tela; o check só marca como lida. */
interface Linha {
  id: string;
  titulo: string;
  detalhe: string | null;
  quando: string | null;
  gravidade: "perigo" | "atencao" | "info";
  lida: boolean;
  abrir: () => void;
  marcar: () => void;
}

function ListaNotificacoes({ linhas, rotuloCheck }: { linhas: Linha[]; rotuloCheck: string }) {
  const { t } = useTranslation();
  return (
    <ul className="notificacoes inicio-quadro-lista">
      {linhas.map((l) => (
        <li key={l.id} className={`notificacao ${l.gravidade} ${l.lida ? "lida" : ""}`}>
          <i className="notificacao-marca" aria-hidden="true" />
          <button type="button" className="notificacao-abrir" onClick={l.abrir}>
            <span className="notificacao-titulo">{l.titulo}</span>
            {(l.detalhe || l.quando) && (
              <span className="pequeno suave">{[l.detalhe, l.quando].filter(Boolean).join(" · ")}</span>
            )}
          </button>
          {!l.lida ? (
            <button type="button" className="notificacao-check" onClick={l.marcar} title={rotuloCheck} aria-label={`${rotuloCheck}: ${l.titulo}`}>
              ✓
            </button>
          ) : (
            <span className="pequeno suave">{t("inicio.notificacoes.lida")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Notificações: os avisos de agora (faltas, atrasadas, evento na semana) e as
 * novidades das últimas atualizações (provas marcadas, notas, arquivos).
 * Lidas ficam em cinza, embaixo, para reler se passaram despercebidas.
 */
function Notificacoes({ aoIr }: { aoIr: (destino: Destino, alvo?: string) => void }) {
  const { t } = useTranslation();
  const { banco, disciplinas } = useSemestre();
  const { versao } = useSincronizacao();
  const { avisos, vistos, dispensar } = useAvisos();
  const [lista, setLista] = useState<Novidade[]>([]);

  const ler = useCallback(() => {
    repoNovidades.recentes(banco).then(setLista).catch(() => setLista([]));
  }, [banco]);
  useEffect(ler, [ler, versao]);

  const quando = (iso: string) => formatarPrazo(iso);
  const linhas: Linha[] = [
    ...avisos.map((a) => ({ aviso: a, lida: false })),
    ...lista.filter((n) => !n.vistaEm).map((n) => ({ novidade: n, lida: false })),
    ...vistos.map((a) => ({ aviso: a, lida: true })),
    ...lista.filter((n) => n.vistaEm).map((n) => ({ novidade: n, lida: true })),
  ].map((x): Linha =>
    "aviso" in x
      ? {
          id: x.aviso.chave,
          titulo: textoDoAviso(t, x.aviso),
          detalhe: null,
          quando: null,
          gravidade: x.aviso.gravidade,
          lida: x.lida,
          abrir: () => aoIr(destinoDoAviso(x.aviso)),
          marcar: () => void dispensar([x.aviso]),
        }
      : {
          id: x.novidade.id,
          titulo: textoDaNovidade(t, x.novidade),
          detalhe: nomeDaDisciplina(disciplinas, x.novidade.disciplinaId),
          quando: quando(x.novidade.criadoEm),
          gravidade: "info",
          lida: x.lida,
          abrir: () => aoIr(destinoDaNovidade(x.novidade)),
          marcar: () => void repoNovidades.marcarVistas(banco, [x.novidade.id]).then(ler),
        },
  );
  const naoLidas = linhas.filter((l) => !l.lida);

  return (
    <section className="cartao">
      <div className="resumo-topo">
        <h2>
          {t("inicio.notificacoes.titulo")}{" "}
          {naoLidas.length > 0 && <span className="contagem">{naoLidas.length}</span>}
        </h2>
        {naoLidas.length > 1 && (
          <button type="button" className="link pequeno" onClick={() => naoLidas.forEach((l) => l.marcar())}>
            {t("inicio.notificacoes.todasLidas")}
          </button>
        )}
      </div>
      {linhas.length === 0 ? (
        <p className="pequeno suave">{t("inicio.notificacoes.vazio")}</p>
      ) : (
        <ListaNotificacoes linhas={linhas} rotuloCheck={t("inicio.notificacoes.marcarLida")} />
      )}
    </section>
  );
}

/** Quantos e-mails mostrar no Início (os mais recentes da aba Principal). */
const EMAILS_NO_INICIO = 8;

/**
 * Os e-mails mais recentes da aba Principal, no mesmo jeito das
 * notificações: não lidos em destaque, lidos em cinza. Clicar abre o e-mail
 * na tela de E-mail; o check só marca como lido.
 */
function EmailsRecentes({ aoIr }: { aoIr: (destino: Destino, alvo?: string) => void }) {
  const { t } = useTranslation();
  const { banco } = useSemestre();
  const { versao } = useSincronizacao();
  const [conta, setConta] = useState<string | null | undefined>(undefined);
  const [lista, setLista] = useState<Email[]>([]);
  const [exemplo, setExemplo] = useState(false);

  const ler = useCallback(async () => {
    const endereco = await configuracao.ler<string>(banco, "emailInstitucional");
    const conectado = !!endereco && conexaoDisponivel() && (await emailConectado(endereco).catch(() => false));
    if (conectado) {
      setConta(endereco);
      setLista(await repoEmails.listar(banco, endereco!));
    } else if (import.meta.env.DEV) {
      // Modo navegador: os mesmos exemplos da tela de E-mail.
      const { emailsDeExemplo } = await import("../email/exemplos");
      setConta("exemplo");
      setExemplo(true);
      setLista(emailsDeExemplo());
    } else {
      setConta(null);
    }
  }, [banco]);
  useEffect(() => {
    void ler();
  }, [ler, versao]);

  const principais = lista.filter((e) => e.categoria === "principal").slice(0, EMAILS_NO_INICIO);
  const naoLidos = principais.filter((e) => !e.lido).length;
  const linhas: Linha[] = principais.map((e) => ({
    id: e.id,
    titulo: e.assunto || "(sem assunto)",
    detalhe: e.de.nome,
    quando: formatarDataEmail(e.data),
    gravidade: "info",
    lida: e.lido,
    abrir: () => aoIr("email", e.id),
    marcar: () => {
      setLista((atual) => atual.map((x) => (x.id === e.id ? { ...x, lido: true } : x)));
      if (!exemplo) void repoEmails.marcar(banco, e.id, "lido", true);
    },
  }));

  return (
    <section className="cartao">
      <div className="resumo-topo">
        <h2>
          {t("inicio.emails.titulo")} {naoLidos > 0 && <span className="contagem">{naoLidos}</span>}
        </h2>
        {conta && (
          <button type="button" className="link pequeno" onClick={() => aoIr("email")}>
            {t("inicio.emails.verTodos")}
          </button>
        )}
      </div>
      {exemplo && <p className="pequeno texto-atencao">{t("inicio.emails.exemplo")}</p>}
      {conta === null ? (
        <p className="pequeno suave">
          <button type="button" className="link" onClick={() => aoIr("email")}>
            {t("inicio.emails.semConta")}
          </button>
        </p>
      ) : linhas.length === 0 ? (
        <p className="pequeno suave">{t("inicio.emails.vazio")}</p>
      ) : (
        <ListaNotificacoes linhas={linhas} rotuloCheck={t("inicio.emails.marcarLido")} />
      )}
    </section>
  );
}
