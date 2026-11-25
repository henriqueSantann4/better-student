import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  diaSemanaDe,
  estadoDaAula,
  hojeIso,
  nivelFaltas,
  notaDaDisciplina,
  proximoDiaDeAulas,
  proximosEventos,
  proximosPrazos,
  resumirFaltas,
  tarefas as repoTarefas,
  textosRecuperacao,
  type Disciplina,
  type FilaPrazo,
  type Tarefa,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { formatarData, formatarDiaMes, formatarPrazo, nomeDia } from "../formatos";

/** Seções para onde a tela Início leva (os atalhos dos avisos e das listas). */
export type DestinoInicio = "agenda" | "grade" | "faltas" | "notas" | "calendario";

/** Eventos do calendário que valem um aviso na semana. */
const EVENTOS_AVISO = new Set(["feriado", "recesso", "sabado_letivo", "prazo", "prova_final", "semana_provas"]);

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
export function Inicio({ aoIr }: { aoIr: (destino: DestinoInicio) => void }) {
  const { t } = useTranslation();
  const { banco, disciplinas, avaliacoes } = useSemestre();
  const agora = useAgora();
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);

  // Tarefas mudam na Agenda; aqui basta ler ao abrir (e quando as avaliações mudam).
  useEffect(() => {
    repoTarefas.listar(banco).then(setTarefas).catch(() => setTarefas([]));
  }, [banco, avaliacoes]);

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
      <Avisos agora={agora} tarefas={tarefas ?? []} aoIr={aoIr} />
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
  aoIr: (destino: DestinoInicio) => void;
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
  aoIr: (destino: DestinoInicio) => void;
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

interface Aviso {
  id: string;
  texto: string;
  tipo: "perigo" | "atencao" | "info";
  destino: DestinoInicio;
}

/** Só o que pede atenção: no máximo quatro linhas, as mais graves primeiro. */
function Avisos({ agora, tarefas, aoIr }: { agora: Date; tarefas: Tarefa[]; aoIr: (destino: DestinoInicio) => void }) {
  const { t } = useTranslation();
  const { semestre, disciplinas, horarios, faltas, eventos, avaliacoes, instituicao } = useSemestre();
  const avisos: Aviso[] = [];

  // Faltas: reprovado ou perto do limite.
  for (const d of disciplinas) {
    const resumo = resumirFaltas(d, faltas.filter((f) => f.disciplinaId === d.id), semestre, d.suap?.faltas ?? null);
    const porEncontro = Math.max(0, ...horarios.filter((h) => h.disciplinaId === d.id).map((h) => h.quantidadeAulas));
    const nivel = nivelFaltas(resumo, porEncontro);
    if (nivel === "reprovado") {
      avisos.push({ id: `f-${d.id}`, tipo: "perigo", destino: "faltas", texto: t("inicio.aviso.reprovadoFalta", { nome: d.nome }) });
    } else if (nivel === "atencao") {
      const texto = resumo.restantes === 0 ? t("inicio.aviso.noLimite", { nome: d.nome }) : t("inicio.aviso.pertoLimite", { nome: d.nome });
      avisos.push({ id: `f-${d.id}`, tipo: "atencao", destino: "faltas", texto });
    }
    // Nota: indo para a recuperação.
    const nota = notaDaDisciplina(d, avaliacoes.filter((a) => a.disciplinaId === d.id), semestre, resumo.reprovadoPorFalta);
    if (nota.situacao === "ifa") {
      avisos.push({
        id: `n-${d.id}`,
        tipo: "atencao",
        destino: "notas",
        texto: t("inicio.aviso.recuperacao", { nome: d.nome, ...textosRecuperacao(instituicao.perfil) }),
      });
    }
  }

  const { atrasadas } = proximosPrazos(tarefas, agora);
  if (atrasadas.length > 0) {
    avisos.push({ id: "atrasadas", tipo: "perigo", destino: "agenda", texto: t("inicio.aviso.atrasadas", { count: atrasadas.length }) });
  }

  // Calendário: o próximo evento importante dos próximos 7 dias.
  const hoje = hojeIso(agora);
  const daquiUmaSemana = hojeIso(new Date(agora.getTime() + 7 * 86_400_000));
  const evento = proximosEventos(eventos, hoje, 20).find((e) => EVENTOS_AVISO.has(e.tipo) && e.dataInicio <= daquiUmaSemana);
  if (evento) {
    avisos.push({
      id: `e-${evento.id}`,
      tipo: "info",
      destino: "calendario",
      texto: t("inicio.aviso.evento", {
        quando: evento.dataInicio <= hoje ? t("comum.hoje") : formatarData(evento.dataInicio),
        titulo: evento.titulo,
      }),
    });
  }

  if (avisos.length === 0) return null;
  const ordem = { perigo: 0, atencao: 1, info: 2 };
  const mostrados = avisos.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]).slice(0, 4);
  const resto = avisos.length - mostrados.length;

  return (
    <ul className="inicio-avisos">
      {mostrados.map((a) => (
        <li key={a.id}>
          <button type="button" className={`inicio-aviso ${a.tipo}`} onClick={() => aoIr(a.destino)}>
            {a.texto}
          </button>
        </li>
      ))}
      {resto > 0 && <li className="pequeno suave">{t("inicio.aviso.mais", { count: resto })}</li>}
    </ul>
  );
}
