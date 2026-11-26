import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  casarDisciplinaMoodle,
  explicarEtapa,
  tarefas as repoTarefas,
  textosRecuperacao,
  type DetalheNotasSuap,
  type Disciplina,
  type EtapaDetalhe,
  type NotaMoodle,
  type Tarefa,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { formatarData, formatarDataHora, formatarNota, formatarPrazo } from "../formatos";
import { ImportarSuap } from "./ImportarSuap";
import { abrirNoNavegador } from "../moodle/api";
import { lerCacheMoodle, type CacheMoodle } from "../moodle/cache";
import { useSincronizacao } from "../sincronizacao";

type EstadoMoodle = "sem_conexao" | "carregando" | "ok" | "erro";

/**
 * Notas do Moodle de cada disciplina do app (casadas pela sala), da última
 * atualização (ao abrir o app ou no botão Atualizar). No modo navegador,
 * usa notas de exemplo.
 */
function useNotasMoodle(): { estado: EstadoMoodle; porDisciplina: Map<string, NotaMoodle[]> } {
  const { banco, disciplinas } = useSemestre();
  const { fontes, versao } = useSincronizacao();
  const [cache, setCache] = useState<CacheMoodle | null | undefined>(undefined);

  useEffect(() => {
    lerCacheMoodle(banco).then(setCache).catch(() => setCache(null));
  }, [banco, versao]);

  const porDisciplina = new Map<string, NotaMoodle[]>();
  for (const sala of cache?.salas ?? []) {
    const d = casarDisciplinaMoodle(sala, disciplinas);
    const notas = cache?.notas[sala.id] ?? [];
    if (d && notas.length > 0) porDisciplina.set(d.id, [...(porDisciplina.get(d.id) ?? []), ...notas]);
  }
  const fonte = fontes.moodle.estado;
  const estado: EstadoMoodle =
    cache === undefined ? "carregando"
    : cache ? "ok"
    : fonte === "buscando" ? "carregando"
    : fonte === "erro" ? "erro"
    : "sem_conexao";
  return { estado, porDisciplina };
}

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
  const moodle = useNotasMoodle();
  const { versao } = useSincronizacao();

  // Provas e trabalhos (inclusive os que vêm do SUAP) mudam a cada atualização.
  useEffect(() => {
    repoTarefas.listar(banco).then(setTarefas).catch(() => setTarefas([]));
  }, [banco, versao]);

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
          <p className="suave pequeno">
            {atualizado && t("notas.atualizado", { data: formatarDataHora(atualizado) })}{" "}
            {moodle.estado === "carregando" && t("notas.moodle.carregando")}
            {moodle.estado === "erro" && t("notas.moodle.erro")}
          </p>
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
                notasMoodle={moodle.porDisciplina.get(d.id) ?? []}
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
  notasMoodle,
}: {
  disciplina: Disciplina;
  pendentes: Tarefa[];
  agora: Date;
  aoIrAgenda: () => void;
  notasMoodle: NotaMoodle[];
}) {
  const { t } = useTranslation();
  const { instituicao } = useSemestre();
  const recuperacao = textosRecuperacao(instituicao.perfil);
  const suap = disciplina.suap;
  const detalhe = suap?.detalhe ?? null;
  // A nota da etapa ainda não saiu, mas o professor já lançou alguma avaliação.
  const avaliacoesComNota = (detalhe?.etapas ?? []).flatMap((e) => e.avaliacoes).filter((a) => a.nota !== null).length;
  // Nesse caso o detalhamento já começa aberto: é ali que estão as notas.
  const [aberto, setAberto] = useState(() => avaliacoesComNota > 0 && !(suap?.etapas ?? []).some((e) => e.nota !== null));

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

      {notas.length === 0 && avaliacoesComNota > 0 ? (
        <p className="pequeno suave">{t("notas.etapaAberta", { count: avaliacoesComNota })}</p>
      ) : notas.length > 0 ? (
        // Com o detalhamento, clicar nas notas mostra de onde elas vieram.
        detalhe ? (
          <button type="button" className="notas-suap-botao" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
            <ListaNotas notas={notas} />
          </button>
        ) : (
          <ListaNotas notas={notas} />
        )
      ) : (
        <p className="pequeno suave">{suap ? t("notas.semNotaSuap") : t("notas.semSuap")}</p>
      )}
      {detalhe && (
        <button type="button" className="link pequeno notas-ver" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
          {aberto ? t("notas.esconderDetalhe") : t("notas.verDetalhe")}
        </button>
      )}
      {detalhe && aberto && <DetalheDaNota detalhe={detalhe} />}

      {notasMoodle.length > 0 && <NotasDoMoodle notas={notasMoodle} />}

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

function ListaNotas({ notas }: { notas: { rotulo: string; valor: number; destaque?: boolean }[] }) {
  return (
    <dl className="notas-suap">
      {notas.map((n) => (
        <div key={n.rotulo} className={n.destaque ? "destaque" : undefined}>
          <dt className="pequeno suave">{n.rotulo}</dt>
          <dd>{formatarNota(n.valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * O "Detalhar" do SUAP: as avaliações de cada etapa e a conta que o SUAP faz.
 * A etapa final (a prova de recuperação) só aparece se já tiver nota.
 */
function DetalheDaNota({ detalhe }: { detalhe: DetalheNotasSuap }) {
  const etapas = detalhe.etapas.filter((e) => e.numero !== null || e.avaliacoes.some((a) => a.nota !== null));
  return (
    <div className="notas-detalhe">
      {etapas.map((etapa, i) => (
        <EtapaDaNota key={i} etapa={etapa} />
      ))}
    </div>
  );
}

function EtapaDaNota({ etapa }: { etapa: EtapaDetalhe }) {
  const { t } = useTranslation();
  const { instituicao } = useSemestre();
  const explicacao = explicarEtapa(etapa);
  const titulo =
    etapa.numero === null
      ? t("notas.etapaFinal", textosRecuperacao(instituicao.perfil))
      : t("notas.etapa", { numero: etapa.numero });
  // Na conta, só as notas que somam algo (zeros de ponto extra não ajudam a ler).
  const parcelas = explicacao.parcelas.filter((n) => n !== 0);

  return (
    <section>
      <h4 className="notas-etapa">
        {titulo} <span className="suave">· {etapa.forma}</span>
      </h4>
      {etapa.legenda.length > 0 && (
        <ul className="pequeno suave notas-legenda">
          {etapa.legenda.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <table className="tabela notas-tabela">
        <tbody>
          {etapa.avaliacoes.map((a, i) => (
            <tr key={`${a.sigla}-${i}`}>
              <td className="sem-quebra">
                <strong>{a.sigla}</strong>
              </td>
              <td>
                {a.descricao ?? a.tipo}
                {a.tipo && a.descricao && a.tipo !== a.descricao && <span className="pequeno suave"> · {a.tipo}</span>}
              </td>
              <td className="pequeno suave sem-quebra">{a.data ? formatarData(a.data) : ""}</td>
              <td className="numero">{a.nota === null ? <span className="suave pequeno">{t("notas.semNota")}</span> : formatarNota(a.nota)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pequeno notas-conta">
        {explicacao.resultado !== null && explicacao.conta === "soma" &&
          t("notas.conta.soma", {
            parcelas: parcelas.length > 0 ? parcelas.map((n) => formatarNota(n)).join(" + ") : "0",
            resultado: formatarNota(explicacao.resultado),
          })}
        {explicacao.resultado !== null && explicacao.conta === "media" &&
          t("notas.conta.media", {
            parcelas: explicacao.parcelas.map((n) => formatarNota(n)).join(" + "),
            quantidade: explicacao.parcelas.length,
            resultado: formatarNota(explicacao.resultado),
          })}
        {explicacao.resultado !== null && explicacao.conta === "media_ponderada" &&
          t("notas.conta.ponderada", { resultado: formatarNota(explicacao.resultado) })}
        {explicacao.conta === "desconhecida" && t("notas.conta.formula")}
        {explicacao.pendentes.length > 0 &&
          ` ${t("notas.conta.pendentes", { siglas: explicacao.pendentes.map((a) => a.sigla).join(", ") })}`}
      </p>
    </section>
  );
}

/**
 * As atividades do Moodle que já têm nota (como o professor lançou) e quantas
 * ainda não têm. Clicar no nome abre a atividade no Moodle.
 */
function NotasDoMoodle({ notas }: { notas: NotaMoodle[] }) {
  const { t } = useTranslation();
  const comNota = notas.filter((n) => n.nota !== null);
  const semNota = notas.length - comNota.length;
  return (
    <>
      <h3 className="pequeno suave notas-subtitulo">{t("notas.moodle.titulo")}</h3>
      {comNota.length > 0 ? (
        <ul className="lista">
          {comNota.map((n) => (
            <li key={n.id} className="item">
              <div className="item-texto">
                {n.url ? (
                  <button type="button" className="link" onClick={() => void abrirNoNavegador(n.url!)}>
                    {n.nome}
                  </button>
                ) : (
                  <span>{n.nome}</span>
                )}
              </div>
              <span className="sem-quebra">
                <strong>{formatarNota(n.nota)}</strong>
                {n.maxima !== null && <span className="pequeno suave"> {t("notas.moodle.de", { maxima: formatarNota(n.maxima) })}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pequeno suave">{t("notas.moodle.nenhumaComNota")}</p>
      )}
      {semNota > 0 && comNota.length > 0 && <p className="pequeno suave">{t("notas.moodle.semNota", { count: semNota })}</p>}
    </>
  );
}

