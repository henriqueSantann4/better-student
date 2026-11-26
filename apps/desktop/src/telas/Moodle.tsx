import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { casarDisciplinaMoodle, ErroMoodle, type AtividadeMoodle } from "@better-student/shared";
import { useApp } from "../contexto";
import { useSincronizacao } from "../sincronizacao";
import { formatarDataEmail } from "../formatos";
import {
  abrirNoNavegador,
  carregarPainel,
  conectar,
  desconectar,
  estaConectado,
  lerSiteMoodle,
  moodleDisponivel,
  type PainelMoodle,
} from "../moodle/api";

/**
 * Moodle: login pelo SUAP (como no app oficial) e, por enquanto, a visão
 * das disciplinas e das próximas atividades com prazo. O próximo passo é
 * transformar essas atividades em tarefas da Agenda.
 */
export function Moodle() {
  const { t } = useTranslation();
  const { banco } = useApp();
  const { atualizarMoodle } = useSincronizacao();
  // undefined = carregando; null = o campus não tem Moodle conhecido (o aluno informa).
  const [site, setSite] = useState<string | null | undefined>(undefined);
  const [conectado, setConectado] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    void lerSiteMoodle(banco).then(setSite);
  }, [banco]);

  useEffect(() => {
    if (!site) return;
    if (!moodleDisponivel()) {
      setConectado(false);
      return;
    }
    estaConectado(site).then(setConectado).catch(() => setConectado(false));
  }, [site]);

  if (!moodleDisponivel()) {
    return (
      <section className="cartao estreito">
        <h1>{t("moodle.titulo")}</h1>
        <p className="suave">{t("moodle.soNoApp")}</p>
      </section>
    );
  }
  if (site === undefined || (site && conectado === undefined)) return <p className="suave">{t("app.carregando")}</p>;
  if (!site || !conectado) {
    return (
      <ConectarMoodle
        site={site ?? ""}
        aoMudarSite={setSite}
        aoConectar={() => {
          setConectado(true);
          // Já traz atividades, notas e a lista de arquivos (Materiais, Notas, Agenda).
          void atualizarMoodle();
        }}
      />
    );
  }
  return (
    <PainelConectado
      site={site}
      aoDesconectar={() => {
        void desconectar(site).then(() => setConectado(false));
      }}
    />
  );
}

function ConectarMoodle({
  site,
  aoMudarSite,
  aoConectar,
}: {
  site: string;
  aoMudarSite: (site: string) => void;
  aoConectar: () => void;
}) {
  const { t } = useTranslation();
  const { banco } = useApp();
  const [endereco, setEndereco] = useState(site);
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pararEspera = useRef<(() => void) | null>(null);

  useEffect(() => () => pararEspera.current?.(), []);

  async function entrar() {
    setErro(null);
    setAguardando(true);
    try {
      const limpo = endereco.trim().replace(/\/+$/, "");
      aoMudarSite(limpo);
      pararEspera.current = await conectar(banco, limpo, (falha) => {
        setAguardando(false);
        if (falha) setErro(falha);
        else aoConectar();
      });
    } catch (falha) {
      setAguardando(false);
      setErro(String(falha));
    }
  }

  return (
    <section className="cartao estreito">
      <h1>{t("moodle.titulo")}</h1>
      <p className="suave">{t("moodle.descricao")}</p>
      <ol className="passos pequeno">
        <li>{t("moodle.passo1")}</li>
        <li>{t("moodle.passo2")}</li>
        <li>{t("moodle.passo3")}</li>
      </ol>
      {!site && <p className="pequeno texto-atencao">{t("moodle.semSite")}</p>}
      {aguardando ? (
        <div className="acoes">
          <p className="pequeno">{t("moodle.aguardando")}</p>
          <button
            type="button"
            className="botao"
            onClick={() => {
              pararEspera.current?.();
              setAguardando(false);
            }}
          >
            {t("comum.cancelar")}
          </button>
        </div>
      ) : (
        <button type="button" className="botao primario" onClick={entrar} disabled={!endereco.trim()}>
          {t("moodle.entrar")}
        </button>
      )}
      {erro && <p className="aviso">{erro}</p>}
      <details className="pequeno" open={!site}>
        <summary>{t("moodle.outroSite")}</summary>
        <label className="formulario">
          {t("moodle.endereco")}
          <input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="https://moodle.exemplo.edu.br" />
        </label>
      </details>
      <p className="pequeno suave">{t("moodle.seguranca")}</p>
    </section>
  );
}

function PainelConectado({ site, aoDesconectar }: { site: string; aoDesconectar: () => void }) {
  const { t } = useTranslation();
  const { atualizarMoodle } = useSincronizacao();
  const { dados } = useApp();
  const disciplinasApp = dados?.disciplinas ?? [];
  const [painel, setPainel] = useState<PainelMoodle | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const buscando = useRef(false);

  const atualizar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    setCarregando(true);
    setErro(null);
    try {
      setPainel(await carregarPainel(site));
      // O botão Atualizar também refaz a lista de arquivos e as notas guardadas.
      void atualizarMoodle();
    } catch (falha) {
      // Chave revogada ou expirada: o jeito é entrar de novo.
      if (falha instanceof ErroMoodle && /invalidtoken|accessexception/i.test(falha.codigo)) {
        setErro(t("moodle.chaveInvalida"));
      } else {
        setErro(String(falha));
      }
    } finally {
      buscando.current = false;
      setCarregando(false);
    }
  }, [site, t, atualizarMoodle]);

  // Ao abrir a aba, só o painel (a lista completa já veio na atualização ao abrir o app).
  useEffect(() => {
    if (buscando.current) return;
    buscando.current = true;
    setCarregando(true);
    carregarPainel(site)
      .then(setPainel)
      .catch((falha) =>
        setErro(falha instanceof ErroMoodle && /invalidtoken|accessexception/i.test(falha.codigo) ? t("moodle.chaveInvalida") : String(falha)),
      )
      .finally(() => {
        buscando.current = false;
        setCarregando(false);
      });
  }, [site, t]);

  return (
    <>
      <header className="cabecalho">
        <h1>{t("moodle.titulo")}</h1>
        {painel && (
          <span className="suave">
            {painel.info.nomeSite} · {painel.info.nomeUsuario}
          </span>
        )}
        <div className="acoes empurrar-direita">
          <button type="button" className="botao" onClick={atualizar} disabled={carregando}>
            {carregando ? t("moodle.carregando") : t("moodle.atualizar")}
          </button>
          <button
            type="button"
            className="botao perigo"
            onClick={() => {
              if (window.confirm(t("moodle.confirmarDesconectar"))) aoDesconectar();
            }}
          >
            {t("moodle.desconectar")}
          </button>
        </div>
      </header>

      {erro && <p className="aviso faixa">{erro}</p>}

      {painel && (
        <>
          <section className="cartao">
            <h2>{t("moodle.proximas")}</h2>
            {painel.atividades.length === 0 && <p className="suave">{t("moodle.semAtividades")}</p>}
            <ul className="lista">
              {painel.atividades.map((a) => (
                <ItemAtividade key={a.id} atividade={a} />
              ))}
            </ul>
          </section>
          <section className="cartao">
            <h2>{t("moodle.disciplinas", { count: painel.disciplinas.length })}</h2>
            <ul className="lista">
              {painel.disciplinas.map((d) => {
                // Mostra o nome da disciplina do app (com a cor), quando a sala casa com uma.
                const doApp = casarDisciplinaMoodle(d, disciplinasApp);
                return (
                  <li key={d.id} className={`item ${doApp ? "" : "passado"}`}>
                    <span className="bolinha" style={{ background: doApp?.cor ?? undefined }} />
                    <div className="item-texto">
                      <strong>{doApp?.nome ?? d.nome}</strong>
                      <span className="pequeno suave">
                        {[
                          doApp ? d.nome : t("moodle.semDisciplina"),
                          d.progresso !== null ? t("moodle.progresso", { valor: d.progresso }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

function ItemAtividade({ atividade }: { atividade: AtividadeMoodle }) {
  const { t } = useTranslation();
  const atrasada = atividade.prazo < new Date().toISOString();
  return (
    <li className="item">
      <span className={`etiqueta ${atrasada ? "reprovado" : "atencao"}`}>
        {t(`moodle.tipos.${atividade.tipo}`, { defaultValue: t("moodle.tipos.outro") })}
      </span>
      <div className="item-texto">
        <strong>{atividade.nome}</strong>
        <span className="pequeno suave">
          {[atividade.disciplina, formatarDataEmail(atividade.prazo, true), atividade.acao].filter(Boolean).join(" · ")}
        </span>
      </div>
      {atividade.url && (
        <button type="button" className="botao" onClick={() => abrirNoNavegador(atividade.url)}>
          {t("moodle.abrir")}
        </button>
      )}
    </li>
  );
}
