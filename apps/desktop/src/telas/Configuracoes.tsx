import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  configuracao,
  gravarEscolhaInstituicao,
  gravarLembretesPadrao,
  lerLembretesPadrao,
  semestres,
  TIPOS_TAREFA,
  type EscolhaInstituicao,
  type LembretesPorTipo,
  type RegrasAcademicas,
  type Semestre,
} from "@better-student/shared";
import { useApp } from "../contexto";
import { conexaoDisponivel, desconectar as desconectarEmail, estaConectado as emailConectado } from "../email/conexao";
import { formatarNota } from "../formatos";
import { PERFIS } from "../instituicoes";
import { desconectar as desconectarMoodle, estaConectado as moodleConectado, moodleDisponivel } from "../moodle/api";
import { aplicarTema, temaSalvo, type Tema } from "../tema";
import { SeletorInstituicao } from "./EscolherInstituicao";

/** Pasta sugerida para os materiais (o caminho real é resolvido no Windows). */
const PASTA_PADRAO = "Documentos\\Better Student\\Materiais";

/** Lê "7,5" ou "7.5". Vazio ou inválido = `null`. */
function lerNumero(texto: string): number | null {
  const valor = Number(texto.trim().replace(",", "."));
  return texto.trim() !== "" && Number.isFinite(valor) && valor >= 0 ? valor : null;
}

function Secao({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      {dica && <p className="pequeno suave">{dica}</p>}
      {children}
    </section>
  );
}

export function Configuracoes() {
  const { t } = useTranslation();
  const { dados } = useApp();
  return (
    <>
      <header className="cabecalho">
        <h1>{t("config.titulo")}</h1>
      </header>
      <Instituicao />
      {dados && <Regras semestre={dados.semestre} />}
      <Contas />
      <Notificacoes />
      <Aparencia />
      <Materiais />
    </>
  );
}

function Instituicao() {
  const { t } = useTranslation();
  const { banco, acao, instituicao } = useApp();
  const atual: EscolhaInstituicao = {
    instituicaoId: instituicao?.perfil.id ?? "outra",
    campusId: instituicao?.campus?.id ?? null,
  };
  const [escolha, setEscolha] = useState(atual);
  const [aplicarRegras, setAplicarRegras] = useState(true);
  const [salvo, setSalvo] = useState(false);
  const mudou = escolha.instituicaoId !== atual.instituicaoId || escolha.campusId !== atual.campusId;

  async function salvar() {
    const ok = await acao(async () => {
      const { perfil } = await gravarEscolhaInstituicao(banco, PERFIS, escolha);
      const semestre = await semestres.atual(banco);
      if (semestre && aplicarRegras) await semestres.atualizarRegras(banco, semestre.id, perfil.regras);
    });
    setSalvo(ok);
  }

  return (
    <Secao titulo={t("config.instituicao.titulo")} dica={t("config.instituicao.dica")}>
      <SeletorInstituicao
        escolha={escolha}
        aoMudar={(e) => {
          setSalvo(false);
          setEscolha(e);
        }}
      />
      {mudou && (
        <label className="pequeno caixa-marcar">
          <input type="checkbox" checked={aplicarRegras} onChange={(e) => setAplicarRegras(e.target.checked)} />
          {t("config.instituicao.aplicarRegras")}
        </label>
      )}
      <div className="acoes">
        <button type="button" className="botao primario" onClick={salvar} disabled={!mudou}>
          {t("comum.salvar")}
        </button>
        {salvo && <span className="pequeno texto-ok">{t("config.salvo")}</span>}
      </div>
    </Secao>
  );
}

/**
 * Frequência mínima do semestre atual (vem da instituição; dá para ajustar).
 * É a única regra que o app usa: ele não prevê média nem recuperação.
 */
function Regras({ semestre }: { semestre: Semestre }) {
  const { t } = useTranslation();
  const { banco, acao, instituicao } = useApp();
  const paraCampo = (r: RegrasAcademicas) => formatarNota(r.frequenciaMinima * 100);
  const [campo, setCampo] = useState(() => paraCampo(semestre));
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  // Se a regra mudar por fora (ex.: trocou a instituição), acompanha.
  useEffect(() => setCampo(paraCampo(semestre)), [semestre]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const valor = lerNumero(campo);
    if (valor === null || valor > 100) {
      setAviso(t("config.regras.invalido"));
      return;
    }
    setAviso(null);
    // As outras regras ficam como estão no semestre.
    const regras: RegrasAcademicas = {
      frequenciaMinima: valor / 100,
      mediaAprovacao: semestre.mediaAprovacao,
      mediaMinimaIfa: semestre.mediaMinimaIfa,
      notaMinimaIfa: semestre.notaMinimaIfa,
      tetoAposIfa: semestre.tetoAposIfa,
    };
    setSalvo(await acao(() => semestres.atualizarRegras(banco, semestre.id, regras)));
  }

  return (
    <Secao
      titulo={t("config.regras.titulo", { semestre: semestre.nome })}
      dica={t("config.regras.dica", { instituicao: instituicao?.perfil.sigla ?? "" })}
    >
      <form className="formulario" onSubmit={enviar}>
        <label>
          {t("config.regras.frequenciaMinima")}
          <input
            className="campo-nota"
            inputMode="decimal"
            value={campo}
            onChange={(e) => {
              setSalvo(false);
              setCampo(e.target.value);
            }}
          />
        </label>
        {aviso && <p className="aviso">{aviso}</p>}
        <div className="acoes">
          <button type="submit" className="botao primario">
            {t("comum.salvar")}
          </button>
          {instituicao && (
            <button
              type="button"
              className="botao"
              onClick={() => {
                setSalvo(false);
                setCampo(paraCampo(instituicao.perfil.regras));
              }}
            >
              {t("config.regras.restaurar", { instituicao: instituicao.perfil.sigla })}
            </button>
          )}
          {salvo && <span className="pequeno texto-ok">{t("config.salvo")}</span>}
        </div>
      </form>
    </Secao>
  );
}

/** Endereços dos sistemas e as contas conectadas (senhas e chaves ficam no cofre do Windows). */
function Contas() {
  const { t } = useTranslation();
  const { banco, acao } = useApp();
  const [suap, setSuap] = useState("");
  const [moodle, setMoodle] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [moodleOk, setMoodleOk] = useState<boolean | null>(null);
  const [emailOk, setEmailOk] = useState<boolean | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    void (async () => {
      const [s, m, e] = await Promise.all([
        configuracao.ler<string>(banco, "suapServidor"),
        configuracao.ler<string>(banco, "moodleSite"),
        configuracao.ler<string>(banco, "emailInstitucional"),
      ]);
      setSuap(s ?? "");
      setMoodle(m ?? "");
      setEmail(e);
      if (m && moodleDisponivel()) setMoodleOk(await moodleConectado(m).catch(() => false));
      if (e && conexaoDisponivel()) setEmailOk(await emailConectado(e).catch(() => false));
    })();
  }, [banco]);

  async function salvarEnderecos(e: FormEvent) {
    e.preventDefault();
    const limpo = (texto: string) => texto.trim().replace(/\/+$/, "") || null;
    setSalvo(
      await acao(async () => {
        await configuracao.gravar(banco, "suapServidor", limpo(suap) && `${limpo(suap)}/`);
        await configuracao.gravar(banco, "moodleSite", limpo(moodle));
      }),
    );
  }

  return (
    <Secao titulo={t("config.contas.titulo")} dica={t("config.contas.dica")}>
      <form className="formulario" onSubmit={salvarEnderecos}>
        <label>
          {t("config.contas.suap")}
          <input value={suap} onChange={(e) => (setSalvo(false), setSuap(e.target.value))} placeholder={t("config.contas.naoUsa")} />
        </label>
        <label>
          {t("config.contas.moodle")}
          <input value={moodle} onChange={(e) => (setSalvo(false), setMoodle(e.target.value))} placeholder={t("config.contas.naoUsa")} />
        </label>
        <div className="acoes">
          <button type="submit" className="botao">
            {t("config.contas.salvarEnderecos")}
          </button>
          {salvo && <span className="pequeno texto-ok">{t("config.salvo")}</span>}
        </div>
      </form>

      <ul className="lista config-contas">
        <li className="item">
          <div className="item-texto">
            <strong>{t("config.contas.moodle")}</strong>
            <span className="pequeno suave">
              {moodleOk === null ? t("config.contas.soNoApp") : moodleOk ? t("config.contas.conectado") : t("config.contas.desconectado")}
            </span>
          </div>
          {moodleOk && (
            <button
              type="button"
              className="botao perigo"
              onClick={() => void desconectarMoodle(moodle.replace(/\/+$/, "")).then(() => setMoodleOk(false))}
            >
              {t("config.contas.desconectar")}
            </button>
          )}
        </li>
        <li className="item">
          <div className="item-texto">
            <strong>{t("config.contas.email")}</strong>
            <span className="pequeno suave">
              {email ?? t("config.contas.semEmail")}
              {email && emailOk !== null && ` · ${emailOk ? t("config.contas.conectado") : t("config.contas.desconectado")}`}
            </span>
          </div>
          {emailOk && email && (
            <button type="button" className="botao perigo" onClick={() => void desconectarEmail(banco, email).then(() => setEmailOk(false))}>
              {t("config.contas.desconectar")}
            </button>
          )}
        </li>
      </ul>
      <p className="pequeno suave">{t("config.contas.seguranca")}</p>
    </Secao>
  );
}

const MINUTOS_DIA = 24 * 60;

function Notificacoes() {
  const { t } = useTranslation();
  const { banco, acao } = useApp();
  const [lembretes, setLembretes] = useState<LembretesPorTipo | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    void lerLembretesPadrao(banco).then(setLembretes);
  }, [banco]);

  if (!lembretes) return null;

  function mudar(tipo: keyof LembretesPorTipo, campo: "ativo" | "quantidade" | "dias" | "intervalo", valor: string | boolean) {
    setSalvo(false);
    const atual = lembretes![tipo] ?? { quantidade: 1, inicioAntesMinutos: MINUTOS_DIA, intervaloMinutos: MINUTOS_DIA };
    if (campo === "ativo") {
      setLembretes({ ...lembretes!, [tipo]: valor ? atual : null });
      return;
    }
    const n = Math.max(campo === "quantidade" ? 1 : 0, Math.round(lerNumero(String(valor)) ?? 0));
    const novo =
      campo === "quantidade"
        ? { ...atual, quantidade: Math.min(10, n) }
        : campo === "dias"
          ? { ...atual, inicioAntesMinutos: Math.max(1, n) * MINUTOS_DIA }
          : { ...atual, intervaloMinutos: Math.max(1, n) * 60 };
    setLembretes({ ...lembretes!, [tipo]: novo });
  }

  return (
    <Secao titulo={t("config.notificacoes.titulo")} dica={t("config.notificacoes.dica")}>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>{t("config.notificacoes.tipo")}</th>
              <th>{t("config.notificacoes.avisar")}</th>
              <th className="numero">{t("config.notificacoes.quantidade")}</th>
              <th className="numero">{t("config.notificacoes.dias")}</th>
              <th className="numero">{t("config.notificacoes.intervalo")}</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS_TAREFA.map((tipo) => {
              const r = lembretes[tipo];
              return (
                <tr key={tipo}>
                  <td>{t(`agenda.tipos.${tipo}`)}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t("config.notificacoes.avisarDe", { tipo: t(`agenda.tipos.${tipo}`) })}
                      checked={r !== null}
                      onChange={(e) => mudar(tipo, "ativo", e.target.checked)}
                    />
                  </td>
                  <td className="numero">
                    <input className="campo-nota" inputMode="numeric" disabled={!r} value={r?.quantidade ?? ""} onChange={(e) => mudar(tipo, "quantidade", e.target.value)} />
                  </td>
                  <td className="numero">
                    <input className="campo-nota" inputMode="numeric" disabled={!r} value={r ? Math.round(r.inicioAntesMinutos / MINUTOS_DIA) : ""} onChange={(e) => mudar(tipo, "dias", e.target.value)} />
                  </td>
                  <td className="numero">
                    <input className="campo-nota" inputMode="numeric" disabled={!r} value={r ? Math.round(r.intervaloMinutos / 60) : ""} onChange={(e) => mudar(tipo, "intervalo", e.target.value)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="pequeno suave">{t("config.notificacoes.aviso")}</p>
      <div className="acoes">
        <button type="button" className="botao primario" onClick={async () => setSalvo(await acao(() => gravarLembretesPadrao(banco, lembretes)))}>
          {t("comum.salvar")}
        </button>
        {salvo && <span className="pequeno texto-ok">{t("config.salvo")}</span>}
      </div>
    </Secao>
  );
}

function Aparencia() {
  const { t } = useTranslation();
  const [tema, setTema] = useState<Tema>(temaSalvo);
  return (
    <Secao titulo={t("config.aparencia.titulo")}>
      <div className="opcoes-tema" role="radiogroup" aria-label={t("config.aparencia.tema")}>
        {(["sistema", "claro", "escuro"] as const).map((opcao) => (
          <label key={opcao} className={`opcao-tema ${tema === opcao ? "ativa" : ""}`}>
            <input
              type="radio"
              name="tema"
              checked={tema === opcao}
              onChange={() => {
                setTema(opcao);
                aplicarTema(opcao);
              }}
            />
            {t(`config.aparencia.${opcao}`)}
          </label>
        ))}
      </div>
    </Secao>
  );
}

function Materiais() {
  const { t } = useTranslation();
  const { banco, acao } = useApp();
  const [pasta, setPasta] = useState("");
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    void configuracao.ler<string>(banco, "pastaMateriais").then((p) => setPasta(p ?? PASTA_PADRAO));
  }, [banco]);

  return (
    <Secao titulo={t("config.materiais.titulo")} dica={t("config.materiais.dica")}>
      <form
        className="formulario"
        onSubmit={async (e) => {
          e.preventDefault();
          setSalvo(await acao(() => configuracao.gravar(banco, "pastaMateriais", pasta.trim() || PASTA_PADRAO)));
        }}
      >
        <label>
          {t("config.materiais.pasta")}
          <input value={pasta} onChange={(e) => (setSalvo(false), setPasta(e.target.value))} />
        </label>
        <div className="acoes">
          <button type="submit" className="botao">
            {t("comum.salvar")}
          </button>
          {salvo && <span className="pequeno texto-ok">{t("config.salvo")}</span>}
        </div>
      </form>
    </Secao>
  );
}
