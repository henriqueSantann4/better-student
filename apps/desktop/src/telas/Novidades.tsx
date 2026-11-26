import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  avisosDoMomento,
  configuracao,
  dispensarAvisos,
  lerAvisosDispensados,
  novidades as repoNovidades,
  semDispensados,
  tarefas as repoTarefas,
  type Aviso,
  type AvisosDispensados,
  type Novidade,
  type Tarefa,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { destinoDaNovidade, destinoDoAviso, nomeDaDisciplina, textoDaNovidade, textoDoAviso, type Destino } from "../avisos";
import { formatarDataEmail } from "../formatos";
import { useSincronizacao, type Fonte } from "../sincronizacao";

/**
 * Avisos de agora (faltas, atrasadas, evento na semana), sem os que o aluno
 * já marcou como vistos. `dispensar` grava o check.
 */
export function useAvisos(): { avisos: Aviso[]; vistos: Aviso[]; dispensar: (vistos: Aviso[]) => Promise<void> } {
  const { banco, semestre, disciplinas, horarios, faltas, eventos } = useSemestre();
  const { versao } = useSincronizacao();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [dispensados, setDispensados] = useState<AvisosDispensados | null>(null);

  useEffect(() => {
    repoTarefas.listar(banco).then(setTarefas).catch(() => setTarefas([]));
    lerAvisosDispensados(banco).then(setDispensados).catch(() => setDispensados({}));
  }, [banco, versao]);

  const todos = avisosDoMomento({ semestre, disciplinas, horarios, faltas, eventos, tarefas }, new Date());
  const avisos = dispensados ? semDispensados(todos, dispensados) : [];
  // Os já vistos continuam na lista do Início, em cinza, para reler.
  const vistos = dispensados ? todos.filter((a) => !avisos.includes(a)) : [];
  const dispensar = async (marcados: Aviso[]) => setDispensados(await dispensarAvisos(banco, marcados, todos));
  return { avisos, vistos, dispensar };
}

const FONTES: Fonte[] = ["suap", "moodle", "email"];

/**
 * "Enquanto você estava fora": abre junto com o app e mostra o que chegou
 * (provas marcadas, notas, arquivos, e-mails) e os avisos de agora, cada um
 * com um check para sumir. Mesmo sem nada novo ela aparece, para o aluno
 * saber que não perdeu nada.
 */
export function CaixaNovidades({ aoFechar, aoIr }: { aoFechar: () => void; aoIr: (destino: Destino) => void }) {
  const { t } = useTranslation();
  const { banco, disciplinas } = useSemestre();
  const { fontes, versao, entrarNoSuap } = useSincronizacao();
  const { avisos, dispensar } = useAvisos();
  const [lista, setLista] = useState<Novidade[]>([]);
  const [ultimaVisita, setUltimaVisita] = useState<string | null>(null);

  useEffect(() => {
    configuracao.ler<string>(banco, "ultimaVisita").then(setUltimaVisita).catch(() => undefined);
  }, [banco]);

  // Novidades chegam enquanto a caixa está aberta (cada fonte termina numa hora).
  useEffect(() => {
    repoNovidades.naoVistas(banco).then(setLista).catch(() => setLista([]));
  }, [banco, versao]);

  const fechar = useCallback(async () => {
    await repoNovidades.marcarVistas(banco, lista.map((n) => n.id)).catch(() => undefined);
    await configuracao.gravar(banco, "ultimaVisita", new Date().toISOString()).catch(() => undefined);
    aoFechar();
  }, [banco, lista, aoFechar]);

  const ir = (destino: Destino) => {
    void fechar();
    aoIr(destino);
  };

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && void fechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fechar]);

  const buscando = FONTES.filter((f) => fontes[f].estado === "buscando");
  const nada = lista.length === 0 && avisos.length === 0;

  return (
    <div className="sobreposto" role="presentation" onClick={(e) => e.target === e.currentTarget && void fechar()}>
      <section className="caixa-novidades cartao" role="dialog" aria-modal="true" aria-labelledby="titulo-novidades">
        <div className="resumo-topo">
          <h2 id="titulo-novidades">{t("novidades.titulo")}</h2>
          <button type="button" className="botao-icone" onClick={() => void fechar()} aria-label={t("comum.fechar")}>
            ×
          </button>
        </div>
        {ultimaVisita && <p className="pequeno suave">{t("novidades.desde", { quando: formatarDataEmail(ultimaVisita, true) })}</p>}

        {buscando.length > 0 && (
          <p className="pequeno suave">{t("novidades.buscando", { fontes: buscando.map((f) => t(`atualizar.fontes.${f}`)).join(", ") })}</p>
        )}
        {fontes.suap.estado === "entrar" && (
          <p className="pequeno texto-atencao">
            {t("atualizar.suapEntrar")}{" "}
            <button type="button" className="link" onClick={() => void entrarNoSuap()}>
              {t("atualizar.entrarSuap")}
            </button>
          </p>
        )}

        {lista.length > 0 && (
          <>
            <h3 className="notas-subtitulo pequeno suave">{t("novidades.chegou", { count: lista.length })}</h3>
            <ul className="lista novidades-lista">
              {lista.map((n) => {
                const disciplina = nomeDaDisciplina(disciplinas, n.disciplinaId);
                return (
                  <li key={n.id}>
                    <button type="button" className="novidade" onClick={() => ir(destinoDaNovidade(n))}>
                      <span className={`etiqueta novidade-${n.tipo}`}>{t(`novidades.rotulos.${n.tipo}`)}</span>
                      <span className="item-texto">
                        <span>{textoDaNovidade(t, n)}</span>
                        {disciplina && <span className="pequeno suave">{disciplina}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {avisos.length > 0 && (
          <>
            <div className="resumo-topo">
              <h3 className="notas-subtitulo pequeno suave">{t("novidades.avisos")}</h3>
              {avisos.length > 1 && (
                <button type="button" className="link pequeno" onClick={() => void dispensar(avisos)}>
                  {t("novidades.todosVistos")}
                </button>
              )}
            </div>
            <ul className="lista">
              {avisos.map((a) => (
                <li key={a.chave} className={`aviso-linha ${a.gravidade}`}>
                  <button type="button" className="link aviso-texto" onClick={() => ir(destinoDoAviso(a))}>
                    {textoDoAviso(t, a)}
                  </button>
                  <button type="button" className="botao pequeno" onClick={() => void dispensar([a])}>
                    {t("novidades.visto")}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {nada && buscando.length === 0 && <p className="novidades-nada">{t("novidades.nada")}</p>}
        {nada && buscando.length > 0 && <p className="suave">{t("novidades.nadaAinda")}</p>}

        <div className="acoes">
          <button type="button" className="botao primario" onClick={() => void fechar()}>
            {t("novidades.ok")}
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * Bloco do menu: o botão Atualizar (sempre à mão, para quando a sessão do
 * SUAP cair ou o aluno quiser conferir algo) e o estado de cada fonte.
 */
export function PainelAtualizar({ aoTerminarComNovidades }: { aoTerminarComNovidades: () => void }) {
  const { t } = useTranslation();
  const { banco } = useSemestre();
  const { fontes, buscando, atualizar, entrarNoSuap } = useSincronizacao();
  const [resultado, setResultado] = useState<"nada" | null>(null);

  async function clicar() {
    setResultado(null);
    await atualizar();
    const naoVistas = await repoNovidades.naoVistas(banco).catch(() => []);
    if (naoVistas.length > 0) aoTerminarComNovidades();
    else setResultado("nada");
  }

  const ativas = FONTES.filter((f) => fontes[f].estado !== "inativo");
  const ultima = ativas
    .map((f) => fontes[f])
    .flatMap((f) => (f.estado === "ok" ? [f.em] : []))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="painel-atualizar">
      <button type="button" className="botao primario botao-atualizar" onClick={() => void clicar()} disabled={buscando}>
        {buscando ? t("atualizar.buscando") : t("atualizar.botao")}
      </button>
      <ul className="pequeno suave estado-fontes">
        {ativas.map((f) => {
          const e = fontes[f];
          return (
            <li key={f} className={e.estado === "erro" || e.estado === "entrar" ? "texto-atencao" : undefined}>
              {e.estado === "entrar" ? (
                <button type="button" className="link" onClick={() => void entrarNoSuap()}>
                  {t("atualizar.entrarSuap")}
                </button>
              ) : (
                <span title={e.estado === "erro" ? e.mensagem : undefined}>
                  {t(`atualizar.fontes.${f}`)}:{" "}
                  {e.estado === "erro" && e.mensagem === "periodoDiferente" ? t("atualizar.periodoDiferente") : t(`atualizar.estados.${e.estado}`)}
                </span>
              )}
            </li>
          );
        })}
        {ultima && !buscando && (
          <li>
            {t("atualizar.ultima", { hora: new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(ultima) })}
            {resultado === "nada" && ` · ${t("atualizar.nadaNovo")}`}
          </li>
        )}
      </ul>
    </div>
  );
}
