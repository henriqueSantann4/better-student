import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  tarefas as repoTarefas,
  textosRecuperacao,
  type Disciplina,
  type Tarefa,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { formatarDataHora, formatarNota, formatarPrazo } from "../formatos";
import { ImportarSuap } from "./ImportarSuap";

/** Tipos de tarefa da Agenda que costumam valer nota. */
const TIPOS_AVALIADOS = new Set(["prova", "trabalho", "apresentacao"]);

/**
 * Notas: o que já saiu no SUAP e o que ainda vem pela frente.
 *
 * De propósito, o app NÃO tenta prever a média nem se o aluno vai para a
 * recuperação: para isso ele teria de saber quanto vale cada prova, e pedir
 * isso ao aluno é trabalho demais. Saber que ainda tem uma prova e um
 * trabalho pendentes já é o que importa no dia a dia.
 */
export function Notas({ aoIrAgenda }: { aoIrAgenda: () => void }) {
  const { t } = useTranslation();
  const { banco, disciplinas } = useSemestre();
  const [importando, setImportando] = useState(false);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);

  useEffect(() => {
    repoTarefas.listar(banco).then(setTarefas).catch(() => setTarefas([]));
  }, [banco]);

  // Data da última importação do SUAP (a mesma para todas as disciplinas).
  const atualizado = disciplinas
    .map((d) => d.suap?.importadoEm)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  const agora = new Date();

  return (
    <>
      <header className="cabecalho">
        <h1>{t("notas.titulo")}</h1>
        {disciplinas.length > 0 && !importando && (
          <button type="button" className="botao empurrar-direita" onClick={() => setImportando(true)}>
            {t("faltas.atualizarSuap")}
          </button>
        )}
      </header>
      {importando && <ImportarSuap aoFechar={() => setImportando(false)} />}
      {disciplinas.length === 0 ? (
        <p className="cartao suave">{t("faltas.semDisciplinas")}</p>
      ) : (
        <>
          {atualizado && <p className="suave pequeno">{t("notas.atualizado", { data: formatarDataHora(atualizado) })}</p>}
          <div className="grade-cartoes notas-grade">
            {disciplinas.map((d) => (
              <CartaoNotas
                key={d.id}
                disciplina={d}
                agora={agora}
                pendentes={tarefas
                  .filter(
                    (x) =>
                      x.disciplinaId === d.id &&
                      TIPOS_AVALIADOS.has(x.tipo) &&
                      x.concluidaEm === null &&
                      x.excluidoEm === null &&
                      (x.prazo === null || new Date(x.prazo).getTime() >= agora.getTime()),
                  )
                  // Com data primeiro, na ordem; sem data no fim.
                  .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"))}
                aoIrAgenda={aoIrAgenda}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function CartaoNotas({
  disciplina,
  pendentes,
  agora,
  aoIrAgenda,
}: {
  disciplina: Disciplina;
  pendentes: Tarefa[];
  agora: Date;
  aoIrAgenda: () => void;
}) {
  const { t } = useTranslation();
  const { instituicao } = useSemestre();
  const recuperacao = textosRecuperacao(instituicao.perfil);
  const suap = disciplina.suap;

  // Só o que o SUAP já tem; nada calculado pelo app.
  const notas: { rotulo: string; valor: number; destaque?: boolean }[] = [];
  for (const e of suap?.etapas ?? []) {
    if (e.nota !== null) notas.push({ rotulo: t("notas.etapa", { numero: e.numero }), valor: e.nota });
  }
  if (suap?.media != null && (suap.etapas.length !== 1 || suap.etapas[0]?.nota !== suap.media)) {
    notas.push({ rotulo: t("notas.media"), valor: suap.media });
  }
  if (suap?.naf != null) notas.push({ rotulo: t("notas.naf", recuperacao), valor: suap.naf });
  if (suap?.mfd != null) notas.push({ rotulo: t("notas.mfd"), valor: suap.mfd, destaque: true });

  return (
    <article className="resumo" style={{ borderTopColor: disciplina.cor ?? undefined }}>
      <div>
        <strong>{disciplina.nome}</strong>
        {suap?.situacao && <div className="pequeno suave">{suap.situacao}</div>}
      </div>

      {notas.length > 0 ? (
        <dl className="notas-suap">
          {notas.map((n) => (
            <div key={n.rotulo} className={n.destaque ? "destaque" : undefined}>
              <dt className="pequeno suave">{n.rotulo}</dt>
              <dd>{formatarNota(n.valor)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="pequeno suave">{suap ? t("notas.semNotaSuap") : t("notas.semSuap")}</p>
      )}

      <h3 className="pequeno suave notas-subtitulo">{t("notas.proximas")}</h3>
      {pendentes.length > 0 ? (
        <ul className="lista">
          {pendentes.map((x) => (
            <li key={x.id} className="item">
              <div className="item-texto">
                <span>{x.titulo}</span>
                <span className={`pequeno ${x.tipo === "prova" ? "texto-perigo" : "suave"}`}>{t(`agenda.tipos.${x.tipo}`)}</span>
              </div>
              <span className="pequeno suave inicio-quando">{x.prazo ? formatarPrazo(x.prazo, agora) : t("notas.semData")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pequeno suave">
          {t("notas.nadaMarcado")}{" "}
          <button type="button" className="link" onClick={aoIrAgenda}>
            {t("notas.marcar")}
          </button>
        </p>
      )}
    </article>
  );
}
