import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  diaSemanaDe,
  estadoDaAula,
  proximoDiaDeAulas,
  proximosPrazos,
  tarefas as repoTarefas,
  type Disciplina,
  type FilaPrazo,
  type Tarefa,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { destinoDoAviso, textoDoAviso, type Destino } from "../avisos";
import { useSincronizacao } from "../sincronizacao";
import { useAvisos } from "./Novidades";
import { formatarDiaMes, formatarPrazo, nomeDia } from "../formatos";

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
 * Tela Início: num relance, a próxima leva de aulas, os prazos mais próximos
 * e só os avisos que pedem atenção. O resto fica nas outras telas.
 */
export function Inicio({ aoIr }: { aoIr: (destino: Destino) => void }) {
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
      <Avisos aoIr={aoIr} />
      <div className="inicio-grade">
        <ProximasAulas agora={agora} porId={porId} aoIr={aoIr} />
        <Prazos agora={agora} tarefas={tarefas} porId={porId} aoIr={aoIr} />
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

/**
 * Só o que pede atenção: no máximo quatro, os mais graves primeiro. Cada um
 * tem um check: visto, ele some (e só volta se a situação piorar).
 */
function Avisos({ aoIr }: { aoIr: (destino: Destino) => void }) {
  const { t } = useTranslation();
  const { avisos, dispensar } = useAvisos();
  if (avisos.length === 0) return null;
  const mostrados = avisos.slice(0, 4);
  const resto = avisos.length - mostrados.length;

  return (
    <ul className="inicio-avisos">
      {mostrados.map((a) => (
        <li key={a.chave} className={`inicio-aviso ${a.gravidade}`}>
          <button type="button" className="inicio-aviso-texto" onClick={() => aoIr(destinoDoAviso(a))}>
            {textoDoAviso(t, a)}
          </button>
          <button
            type="button"
            className="inicio-aviso-visto"
            onClick={() => void dispensar([a])}
            aria-label={t("novidades.marcarVisto", { aviso: textoDoAviso(t, a) })}
            title={t("novidades.visto")}
          >
            ✓
          </button>
        </li>
      ))}
      {resto > 0 && <li className="pequeno suave">{t("inicio.aviso.mais", { count: resto })}</li>}
    </ul>
  );
}
