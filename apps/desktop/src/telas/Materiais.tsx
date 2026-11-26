import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  normalizar,
  PASTA_SEM_DISCIPLINA,
  pastaDaDisciplina,
  tamanhoLegivel,
  type ArquivoMoodle,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import * as arquivos from "../materiais";
import type { PastaMaterial } from "../materiais";
import { lerSiteMoodle } from "../moodle/api";
import { lerCacheMoodle, salaDaDisciplina, type CacheMoodle } from "../moodle/cache";
import { useSincronizacao, type EstadoFonte } from "../sincronizacao";

/** Data de modificação (milissegundos) no formato curto: "18/11/2026 14:30". */
function quando(ms: number): string {
  return ms ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(ms)) : "";
}

/** Extensão em maiúsculas, para a etiqueta do tipo (PDF, PPTX...). */
function tipoDo(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 && nome.length - i <= 6 ? nome.slice(i + 1).toUpperCase() : "";
}

interface Contexto {
  raiz: string;
  /** No modo navegador, tudo é de exemplo e nada mexe em disco. */
  exemplo: boolean;
}

/**
 * Materiais: uma pasta por disciplina no disco, mais a "_Sem disciplina".
 * A lista vem do próprio disco (o banco não guarda os arquivos), então o que
 * o aluno colocar pela pasta, no Explorer, também aparece aqui.
 */
export function Materiais() {
  const { t } = useTranslation();
  const { banco, disciplinas } = useSemestre();
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [pastas, setPastas] = useState<PastaMaterial[] | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const { fontes, versao } = useSincronizacao();
  const [cache, setCache] = useState<CacheMoodle | null>(null);
  const [site, setSite] = useState<string | null>(null);

  // A lista do Moodle vem da última atualização (ao abrir o app ou no botão
  // Atualizar): a tela abre na hora, já sabendo quantos arquivos cada sala tem.
  useEffect(() => {
    lerCacheMoodle(banco).then(setCache).catch(() => setCache(null));
    lerSiteMoodle(banco).then(setSite).catch(() => setSite(null));
  }, [banco, versao]);

  /** Arquivos da sala do Moodle de uma pasta; `null` = sem sala (ou sem Moodle). */
  const doMoodle = (pasta: string): ArquivoMoodle[] | null => {
    const d = disciplinas.find((x) => pastaDaDisciplina(x.nome) === pasta);
    const sala = d ? salaDaDisciplina(cache, d, disciplinas) : null;
    return sala ? (cache?.arquivos[sala.id] ?? []) : null;
  };
  const paraBaixar = (p: PastaMaterial) => {
    const tem = new Set(p.arquivos.map((a) => a.nome.toLowerCase()));
    return (doMoodle(p.pasta) ?? []).filter((a) => !tem.has(a.nome.toLowerCase())).length;
  };

  const nomesPastas = useMemo(
    () => [...disciplinas.map((d) => pastaDaDisciplina(d.nome)), PASTA_SEM_DISCIPLINA],
    [disciplinas],
  );

  useEffect(() => {
    if (arquivos.materiaisDisponivel()) {
      arquivos.lerPastaMateriais(banco).then((raiz) => setCtx({ raiz, exemplo: false })).catch((e) => setErro(String(e)));
    } else if (import.meta.env.DEV) {
      setCtx({ raiz: "Documentos\\Better Student\\Materiais", exemplo: true });
    }
  }, [banco]);

  const recarregar = useCallback(async () => {
    if (!ctx) return;
    try {
      const lidas = ctx.exemplo
        ? (await import("../exemplosMateriais")).pastasDeExemplo(nomesPastas)
        : await arquivos.listar(ctx.raiz, nomesPastas);
      setPastas(lidas);
      setErro(null);
    } catch (e) {
      setErro(String(e));
    }
  }, [ctx, nomesPastas]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Lê de novo quando a janela volta ao foco: o aluno pode ter mexido na pasta pelo Explorer.
  useEffect(() => {
    const aoFocar = () => void recarregar();
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [recarregar]);

  if (!arquivos.materiaisDisponivel() && !import.meta.env.DEV) {
    return <p className="cartao suave">{t("materiais.soNoApp")}</p>;
  }

  // Sem escolha ainda, abre a primeira disciplina (a tela nunca fica vazia).
  const pastaAtual = pastas?.find((p) => p.pasta === selecionada) ?? pastas?.[0] ?? null;
  const nomeDe = (pasta: string) =>
    pasta === PASTA_SEM_DISCIPLINA ? t("materiais.semDisciplina") : (disciplinas.find((d) => pastaDaDisciplina(d.nome) === pasta)?.nome ?? pasta);

  return (
    <>
      <header className="cabecalho">
        <h1>{t("materiais.titulo")}</h1>
        {ctx && (
          <button
            type="button"
            className="botao empurrar-direita"
            disabled={ctx.exemplo}
            onClick={() => void arquivos.abrir(ctx.raiz, null).catch((e) => setErro(String(e)))}
          >
            {t("materiais.abrirPastaGeral")}
          </button>
        )}
      </header>
      {ctx && <p className="pequeno suave">{t("materiais.local", { pasta: ctx.raiz })}</p>}
      {ctx?.exemplo && <p className="pequeno texto-atencao">{t("materiais.exemplo")}</p>}
      {erro && <p className="aviso">{erro}</p>}

      <input
        className="materiais-busca"
        type="search"
        placeholder={t("materiais.buscar")}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {busca.trim() ? (
        <ResultadosBusca busca={busca} pastas={pastas ?? []} nomeDe={nomeDe} ctx={ctx} aoErro={setErro} />
      ) : (
        <div className="materiais-layout">
          <ul className="materiais-pastas">
            {(pastas ?? []).map((p) => (
              <li key={p.pasta}>
                <button
                  type="button"
                  className={`materiais-pasta ${p.pasta === pastaAtual?.pasta ? "ativa" : ""}`}
                  onClick={() => setSelecionada(p.pasta)}
                >
                  <span>{nomeDe(p.pasta)}</span>
                  <span className="pequeno suave">
                    {t("materiais.arquivos", { count: p.arquivos.length })}
                    {paraBaixar(p) > 0 && ` · ${t("materiais.paraBaixar", { count: paraBaixar(p) })}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pastaAtual && ctx ? (
            <PainelPasta
              key={pastaAtual.pasta}
              pasta={pastaAtual}
              titulo={nomeDe(pastaAtual.pasta)}
              ctx={ctx}
              moodle={doMoodle(pastaAtual.pasta)}
              site={site}
              fonte={cache ? null : fontes.moodle}
              aoMudar={recarregar}
              aoErro={setErro}
            />
          ) : (
            <p className="cartao suave">{t("materiais.escolha")}</p>
          )}
        </div>
      )}
    </>
  );
}

function ResultadosBusca({
  busca,
  pastas,
  nomeDe,
  ctx,
  aoErro,
}: {
  busca: string;
  pastas: PastaMaterial[];
  nomeDe: (pasta: string) => string;
  ctx: Contexto | null;
  aoErro: (erro: string) => void;
}) {
  const { t } = useTranslation();
  const termo = normalizar(busca.trim());
  const achados = pastas.flatMap((p) =>
    p.arquivos.filter((a) => normalizar(a.nome).includes(termo)).map((a) => ({ pasta: p.pasta, arquivo: a })),
  );
  if (achados.length === 0) return <p className="cartao suave">{t("materiais.nadaEncontrado")}</p>;
  return (
    <section className="cartao">
      <ul className="lista">
        {achados.map(({ pasta, arquivo }) => (
          <li key={`${pasta}/${arquivo.nome}`} className="item">
            <span className="etiqueta neutra-tipo">{tipoDo(arquivo.nome)}</span>
            <div className="item-texto">
              <button
                type="button"
                className="link"
                disabled={!ctx || ctx.exemplo}
                onClick={() => ctx && void arquivos.abrir(ctx.raiz, pasta, arquivo.nome).catch((e) => aoErro(String(e)))}
              >
                {arquivo.nome}
              </button>
              <span className="pequeno suave">{nomeDe(pasta)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PainelPasta({
  pasta,
  titulo,
  ctx,
  moodle,
  site,
  fonte,
  aoMudar,
  aoErro,
}: {
  pasta: PastaMaterial;
  titulo: string;
  ctx: Contexto;
  moodle: ArquivoMoodle[] | null;
  site: string | null;
  /** Estado da busca do Moodle, quando ainda não há lista guardada. */
  fonte: EstadoFonte | null;
  aoMudar: () => Promise<void>;
  aoErro: (erro: string) => void;
}) {
  const { t } = useTranslation();
  const [passando, setPassando] = useState(false);
  const [copiados, setCopiados] = useState<number | null>(null);

  // Arquivos arrastados para a janela vão para a pasta aberta.
  useEffect(() => {
    if (ctx.exemplo) return;
    let parar: (() => void) | null = null;
    let ativo = true;
    void arquivos
      .ouvirArrastar(
        async (caminhos) => {
          try {
            const nomes = await arquivos.copiar(ctx.raiz, pasta.pasta, caminhos);
            setCopiados(nomes.length);
            await aoMudar();
          } catch (e) {
            aoErro(String(e));
          }
        },
        setPassando,
      )
      .then((desligar) => {
        if (ativo) parar = desligar;
        else desligar();
      });
    return () => {
      ativo = false;
      parar?.();
    };
  }, [ctx, pasta.pasta, aoMudar, aoErro]);

  const abrir = (arquivo: string | null) =>
    !ctx.exemplo && void arquivos.abrir(ctx.raiz, pasta.pasta, arquivo).catch((e) => aoErro(String(e)));

  return (
    <section className={`cartao materiais-painel ${passando ? "soltando" : ""}`}>
      <div className="resumo-topo">
        <h2>{titulo}</h2>
        <button type="button" className="botao" disabled={ctx.exemplo} onClick={() => abrir(null)}>
          {t("materiais.abrirPasta")}
        </button>
      </div>
      {passando ? (
        <p className="materiais-soltar">{t("materiais.solte", { pasta: titulo })}</p>
      ) : (
        <p className="pequeno suave">
          {copiados !== null ? t("materiais.copiados", { count: copiados }) : t("materiais.arraste")}
        </p>
      )}

      {pasta.arquivos.length === 0 ? (
        <p className="suave">{moodle && moodle.length > 0 ? t("materiais.nadaBaixado") : t("materiais.vazia")}</p>
      ) : (
        <ul className="lista">
          {pasta.arquivos.map((a) => (
            <li key={a.nome} className="item">
              <span className="etiqueta neutra-tipo">{tipoDo(a.nome)}</span>
              <div className="item-texto">
                <button type="button" className="link materiais-nome" disabled={ctx.exemplo} onClick={() => abrir(a.nome)}>
                  {a.nome}
                </button>
                <span className="pequeno suave">
                  {tamanhoLegivel(a.tamanho)} · {quando(a.modificado)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pasta.pasta !== PASTA_SEM_DISCIPLINA && (
        <DoMoodle pasta={pasta} ctx={ctx} arquivosMoodle={moodle} site={site} fonte={fonte} aoMudar={aoMudar} aoErro={aoErro} />
      )}
    </section>
  );
}

/**
 * Arquivos que os professores postaram na sala do Moodle e que ainda não
 * estão na pasta. A lista já veio na atualização; o download só acontece
 * quando o aluno pede.
 */
function DoMoodle({
  pasta,
  ctx,
  arquivosMoodle,
  site,
  fonte,
  aoMudar,
  aoErro,
}: {
  pasta: PastaMaterial;
  ctx: Contexto;
  arquivosMoodle: ArquivoMoodle[] | null;
  site: string | null;
  fonte: EstadoFonte | null;
  aoMudar: () => Promise<void>;
  aoErro: (erro: string) => void;
}) {
  const { t } = useTranslation();
  const [baixando, setBaixando] = useState<{ feitos: number; total: number } | null>(null);

  if (!arquivosMoodle) {
    // Sem lista guardada: diz por quê (buscando, sem conexão); sem sala, não mostra nada.
    const motivo = fonte?.estado === "buscando" ? "carregando" : fonte?.estado === "inativo" && !ctx.exemplo ? "sem_conexao" : null;
    return motivo ? <p className="pequeno suave materiais-moodle">{t(`materiais.moodle.${motivo}`)}</p> : null;
  }

  const jaTem = new Set(pasta.arquivos.map((a) => a.nome.toLowerCase()));
  const faltam = arquivosMoodle.filter((a) => !jaTem.has(a.nome.toLowerCase()));

  async function baixar(lista: ArquivoMoodle[]) {
    if (lista.length === 0 || (!site && !ctx.exemplo)) return;
    setBaixando({ feitos: 0, total: lista.length });
    for (const [i, a] of lista.entries()) {
      try {
        if (!ctx.exemplo) await arquivos.baixarDoMoodle(ctx.raiz, pasta.pasta, a.nome, a.url, site!);
      } catch (e) {
        aoErro(t("materiais.moodle.falhou", { nome: a.nome, erro: String(e) }));
      }
      setBaixando({ feitos: i + 1, total: lista.length });
    }
    setBaixando(null);
    await aoMudar();
  }

  if (faltam.length === 0) {
    return arquivosMoodle.length > 0 ? <p className="pequeno texto-ok materiais-moodle">{t("materiais.moodle.tudoBaixado")}</p> : null;
  }
  return (
    <div className="materiais-moodle">
      <div className="resumo-topo">
        <h3 className="pequeno suave notas-subtitulo">{t("materiais.moodle.titulo", { count: faltam.length })}</h3>
        {!baixando && (
          <button type="button" className="botao primario" onClick={() => void baixar(faltam)}>
            {t("materiais.moodle.baixarTodos", { count: faltam.length })}
          </button>
        )}
      </div>
      {baixando && <p className="pequeno">{t("materiais.moodle.baixando", baixando)}</p>}
      <ul className="lista">
        {faltam.map((a) => (
          <li key={a.url + a.nome} className="item">
            <span className="etiqueta neutra-tipo">{tipoDo(a.nome)}</span>
            <div className="item-texto">
              <span>{a.nome}</span>
              <span className="pequeno suave">
                {[a.secao, a.recurso].filter(Boolean).join(" · ")} · {tamanhoLegivel(a.tamanho)}
              </span>
            </div>
            <button type="button" className="botao" disabled={!!baixando} onClick={() => void baixar([a])}>
              {t("materiais.moodle.baixar")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
