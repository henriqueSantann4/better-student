import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  buscarEmails,
  configuracao,
  emailValido,
  emails as repoEmails,
  iniciais,
  type CategoriaEmail,
  type Email as EmailT,
} from "@better-student/shared";
import { useApp } from "../contexto";
import { abrirContaGoogle, conectar, conexaoDisponivel, desconectar, estaConectado, sincronizar } from "../email/conexao";
import { formatarDataEmail } from "../formatos";

const CATEGORIAS: CategoriaEmail[] = ["principal", "atualizacoes", "divulgacao"];
type Pasta = "entrada" | "estrela" | "naoLidos";

/**
 * E-mail institucional, lido por IMAP com senha de app (o IFSP bloqueia apps
 * externos no Google, mas permite IMAP). Fluxo:
 *   1. o usuário informa o endereço;
 *   2. o assistente leva às páginas da conta Google e recebe a senha de app;
 *   3. a caixa de entrada busca os e-mails novos sempre que é aberta.
 * No modo navegador de desenvolvimento não há IMAP: aparecem exemplos.
 */
export function Email() {
  const { t } = useTranslation();
  const { banco } = useApp();
  const [endereco, setEndereco] = useState<string | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  // `undefined` = ainda conferindo o cofre.
  const [conectado, setConectado] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    configuracao.ler<string>(banco, "emailInstitucional").then(setEndereco).catch(() => setEndereco(null));
  }, [banco]);

  useEffect(() => {
    if (!endereco) return;
    if (!conexaoDisponivel()) {
      setConectado(false);
      return;
    }
    estaConectado(endereco).then(setConectado).catch(() => setConectado(false));
  }, [endereco]);

  if (endereco === undefined || (endereco && conectado === undefined)) {
    return <p className="suave">{t("app.carregando")}</p>;
  }
  if (endereco === null || editando) {
    return (
      <ConfigurarEmail
        atual={endereco}
        aoSalvar={(novo) => {
          setEndereco(novo);
          setConectado(undefined);
          setEditando(false);
        }}
        aoCancelar={endereco ? () => setEditando(false) : undefined}
      />
    );
  }
  if (conexaoDisponivel() && !conectado) {
    return <AssistenteConexao endereco={endereco} aoConectar={() => setConectado(true)} aoTrocar={() => setEditando(true)} />;
  }
  return (
    <CaixaEntrada
      endereco={endereco}
      aoTrocar={() => setEditando(true)}
      aoDesconectar={
        conexaoDisponivel()
          ? () => {
              void desconectar(banco, endereco).then(() => setConectado(false));
            }
          : undefined
      }
    />
  );
}

/**
 * Assistente da senha de app. O Google não deixa gerar a senha sozinho (de
 * propósito), então o app faz o resto: abre as páginas certas, já na conta
 * institucional, e testa a senha colada antes de guardar.
 */
function AssistenteConexao({
  endereco,
  aoConectar,
  aoTrocar,
}: {
  endereco: string;
  aoConectar: () => void;
  aoTrocar: () => void;
}) {
  const { t } = useTranslation();
  const [senha, setSenha] = useState("");
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const letras = senha.replace(/\s+/g, "");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setTestando(true);
    setErro(null);
    try {
      await conectar(endereco, letras);
      setSenha("");
      aoConectar();
    } catch (falha) {
      setErro(String(falha));
    } finally {
      setTestando(false);
    }
  }

  return (
    <section className="cartao estreito assistente">
      <h1>{t("email.assistente.titulo")}</h1>
      <p className="suave">{t("email.assistente.descricao", { endereco })}</p>

      <ol className="passos-assistente">
        <li>
          <strong>{t("email.assistente.passo1")}</strong>
          <span className="pequeno suave">{t("email.assistente.passo1Dica")}</span>
          <button type="button" className="botao" onClick={() => abrirContaGoogle("verificacao", endereco)}>
            {t("email.assistente.abrirVerificacao")}
          </button>
        </li>
        <li>
          <strong>{t("email.assistente.passo2")}</strong>
          <span className="pequeno suave">{t("email.assistente.passo2Dica")}</span>
          <button type="button" className="botao" onClick={() => abrirContaGoogle("senhasDeApp", endereco)}>
            {t("email.assistente.abrirSenhas")}
          </button>
        </li>
        <li>
          <strong>{t("email.assistente.passo3")}</strong>
          <form className="formulario" onSubmit={enviar}>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="abcd efgh ijkl mnop"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("email.assistente.senha")}
            />
            <span className="pequeno suave">
              {letras.length === 16 ? t("email.assistente.ok16") : t("email.assistente.contagem", { count: letras.length })}
            </span>
            {erro && <p className="aviso">{erro}</p>}
            <div className="acoes">
              <button type="submit" className="botao primario" disabled={letras.length !== 16 || testando}>
                {testando ? t("email.assistente.testando") : t("email.assistente.conectar")}
              </button>
              <button type="button" className="link pequeno" onClick={aoTrocar}>
                {t("email.trocar")}
              </button>
            </div>
          </form>
        </li>
      </ol>
      <p className="pequeno suave">{t("email.assistente.seguranca")}</p>
    </section>
  );
}

function ConfigurarEmail({
  atual,
  aoSalvar,
  aoCancelar,
}: {
  atual: string | null;
  aoSalvar: (endereco: string) => void;
  aoCancelar?: () => void;
}) {
  const { t } = useTranslation();
  const { banco, acao, instituicao } = useApp();
  // O exemplo de endereço usa o domínio dos alunos da faculdade escolhida.
  const dominio = instituicao?.sistemas.email?.dominio ?? "faculdade.edu.br";
  const [valor, setValor] = useState(atual ?? "");
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const endereco = valor.trim().toLowerCase();
    if (!emailValido(endereco)) {
      setAviso(t("email.invalido"));
      return;
    }
    const ok = await acao(() => configuracao.gravar(banco, "emailInstitucional", endereco));
    if (ok) aoSalvar(endereco);
  }

  return (
    <section className="cartao estreito">
      <h1>{t("email.titulo")}</h1>
      <p className="suave">{t("email.configurarDescricao")}</p>
      <form className="formulario" onSubmit={enviar}>
        <label>
          {t("email.endereco")}
          <input
            type="email"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={t("email.enderecoDica", { dominio })}
            autoComplete="email"
            required
          />
        </label>
        {aviso && <p className="aviso">{aviso}</p>}
        <p className="pequeno suave">{t("email.privacidade")}</p>
        <div className="acoes">
          <button type="submit" className="botao primario">
            {t("comum.salvar")}
          </button>
          {aoCancelar && (
            <button type="button" className="botao" onClick={aoCancelar}>
              {t("comum.cancelar")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

type Sincronia = { estado: "parado" } | { estado: "buscando" } | { estado: "ok"; novos: number } | { estado: "erro"; mensagem: string };

function CaixaEntrada({
  endereco,
  aoTrocar,
  aoDesconectar,
}: {
  endereco: string;
  aoTrocar: () => void;
  aoDesconectar?: () => void;
}) {
  const { t } = useTranslation();
  const { banco } = useApp();
  const [emails, setEmails] = useState<EmailT[]>([]);
  const [exemplo, setExemplo] = useState(false);
  const [pasta, setPasta] = useState<Pasta>("entrada");
  const [categoria, setCategoria] = useState<CategoriaEmail>("principal");
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [sincronia, setSincronia] = useState<Sincronia>({ estado: "parado" });
  const conectado = conexaoDisponivel();

  const recarregar = useCallback(async () => {
    setEmails(await repoEmails.listar(banco, endereco));
  }, [banco, endereco]);

  // Uma busca de cada vez: evita abrir duas conexões IMAP ao mesmo tempo
  // (o React, em desenvolvimento, roda os efeitos duas vezes de propósito).
  const buscando = useRef(false);

  /** Busca o que é novo no Gmail e mostra a cópia local atualizada. */
  const atualizar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    setSincronia({ estado: "buscando" });
    try {
      const novos = await sincronizar(banco, endereco);
      await recarregar();
      setSincronia({ estado: "ok", novos });
    } catch (erro) {
      setSincronia({ estado: "erro", mensagem: String(erro) });
    } finally {
      buscando.current = false;
    }
  }, [banco, endereco, recarregar]);

  useEffect(() => {
    if (conectado) {
      // Mostra na hora o que já está guardado e, em paralelo, busca os novos
      // (só enquanto o app está aberto: princípio de não rodar em segundo plano).
      void recarregar().then(atualizar);
    } else if (import.meta.env.DEV) {
      // Exemplos só no modo navegador de desenvolvimento (não vão para o instalador).
      void import("../email/exemplos").then(({ emailsDeExemplo }) => {
        setEmails(emailsDeExemplo());
        setExemplo(true);
      });
    }
  }, [conectado, recarregar, atualizar]);

  function alterar(id: string, mudanca: Partial<EmailT>) {
    setEmails((lista) => lista.map((e) => (e.id === id ? { ...e, ...mudanca } : e)));
    // No app, a marca fica guardada na cópia local (o Gmail é só leitura).
    if (conectado) {
      if (mudanca.lido !== undefined) void repoEmails.marcar(banco, id, "lido", mudanca.lido);
      if (mudanca.estrela !== undefined) void repoEmails.marcar(banco, id, "estrela", mudanca.estrela);
    }
  }

  function abrir(email: EmailT) {
    setAbertoId(email.id);
    if (!email.lido) alterar(email.id, { lido: true });
  }

  const naoLidos = (lista: EmailT[]) => lista.filter((e) => !e.lido).length;
  const daPasta = emails.filter((e) => (pasta === "estrela" ? e.estrela : pasta === "naoLidos" ? !e.lido : true));
  // As abas de categoria só fazem sentido na caixa de entrada; a busca procura em tudo.
  const filtrados = buscarEmails(
    pasta === "entrada" && !busca ? daPasta.filter((e) => e.categoria === categoria) : daPasta,
    busca,
  ).sort((a, b) => b.data.localeCompare(a.data));
  const aberto = emails.find((e) => e.id === abertoId) ?? null;

  return (
    <div className="email">
      <aside className="email-lateral">
        <div className="email-conta">
          <span className="avatar">{iniciais(endereco.split("@")[0]!.replace(/[._]/g, " "))}</span>
          <div className="item-texto">
            <span className="pequeno quebra">{endereco}</span>
            <button type="button" className="link pequeno" onClick={aoTrocar}>
              {t("email.trocar")}
            </button>
            {aoDesconectar && (
              <button
                type="button"
                className="link pequeno"
                onClick={() => {
                  if (window.confirm(t("email.confirmarDesconectar"))) aoDesconectar();
                }}
              >
                {t("email.desconectar")}
              </button>
            )}
          </div>
        </div>
        <nav className="email-pastas">
          {(["entrada", "estrela", "naoLidos"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`email-pasta ${pasta === p ? "ativo" : ""}`}
              onClick={() => {
                setPasta(p);
                setAbertoId(null);
              }}
            >
              <span>{t(`email.pastas.${p}`)}</span>
              {p === "entrada" && naoLidos(emails) > 0 && <strong>{naoLidos(emails)}</strong>}
            </button>
          ))}
        </nav>
      </aside>

      <section className="email-principal">
        <div className="email-topo">
          <input
            type="search"
            className="email-busca"
            placeholder={t("email.buscar")}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setAbertoId(null);
            }}
          />
          {conectado && (
            <div className="email-sincronia">
              <span className="pequeno suave" role="status">
                {sincronia.estado === "buscando"
                  ? t("email.buscando")
                  : sincronia.estado === "ok"
                    ? t("email.novos", { count: sincronia.novos })
                    : ""}
              </span>
              <button type="button" className="botao" onClick={atualizar} disabled={sincronia.estado === "buscando"}>
                {t("email.atualizar")}
              </button>
            </div>
          )}
        </div>

        {exemplo && <p className="email-aviso pequeno">{t("email.avisoExemplo")}</p>}
        {sincronia.estado === "erro" && (
          <p className="email-aviso erro pequeno">{t("email.erroBusca", { mensagem: sincronia.mensagem })}</p>
        )}

        {aberto ? (
          <LeituraEmail email={aberto} aoVoltar={() => setAbertoId(null)} aoEstrela={() => alterar(aberto.id, { estrela: !aberto.estrela })} />
        ) : (
          <>
            {pasta === "entrada" && !busca && (
              <div className="email-abas" role="tablist">
                {CATEGORIAS.map((c) => {
                  const qtd = naoLidos(emails.filter((e) => e.categoria === c));
                  return (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      aria-selected={categoria === c}
                      className={`email-aba aba-${c} ${categoria === c ? "ativo" : ""}`}
                      onClick={() => setCategoria(c)}
                    >
                      {t(`email.categorias.${c}`)}
                      {qtd > 0 && <span className="contador">{qtd}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {emails.length === 0 ? (
              <div className="email-vazio">
                {conectado ? (
                  <p className="suave">{sincronia.estado === "buscando" ? t("email.primeiraBusca") : t("email.pastaVazia")}</p>
                ) : (
                  <>
                    <h2>{t("email.naoConectadoTitulo")}</h2>
                    <p className="suave">{t("email.naoConectado")}</p>
                  </>
                )}
              </div>
            ) : filtrados.length === 0 ? (
              <p className="email-vazio suave">{busca ? t("email.nadaEncontrado") : t("email.pastaVazia")}</p>
            ) : (
              <ul className="email-lista">
                {filtrados.map((e) => (
                  <li key={e.id} className={`email-linha ${e.lido ? "lido" : "nao-lido"}`}>
                    <button
                      type="button"
                      className={`estrela ${e.estrela ? "marcada" : ""}`}
                      aria-label={e.estrela ? t("email.tirarEstrela") : t("email.marcarEstrela")}
                      aria-pressed={e.estrela}
                      onClick={() => alterar(e.id, { estrela: !e.estrela })}
                    >
                      <IconeEstrela cheia={e.estrela} />
                    </button>
                    <button type="button" className="email-linha-conteudo" onClick={() => abrir(e)}>
                      <span className="email-remetente">{e.de.nome}</span>
                      <span className="email-resumo">
                        <span className="email-assunto">{e.assunto}</span>
                        <span className="email-trecho"> — {e.trecho}</span>
                      </span>
                      <span className="email-data">{formatarDataEmail(e.data)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function LeituraEmail({ email, aoVoltar, aoEstrela }: { email: EmailT; aoVoltar: () => void; aoEstrela: () => void }) {
  const { t } = useTranslation();
  return (
    <article className="email-leitura">
      <div className="email-leitura-barra">
        <button type="button" className="botao" onClick={aoVoltar}>
          ← {t("email.voltar")}
        </button>
      </div>
      <div className="email-leitura-titulo">
        <h2>{email.assunto}</h2>
        <span className={`etiqueta aba-${email.categoria}`}>{t(`email.categorias.${email.categoria}`)}</span>
      </div>
      <div className="email-cabecalho">
        <span className="avatar">{iniciais(email.de.nome)}</span>
        <div className="item-texto">
          <span>
            <strong>{email.de.nome}</strong> <span className="pequeno suave">&lt;{email.de.email}&gt;</span>
          </span>
          <span className="pequeno suave">{t("email.paraVoce")}</span>
        </div>
        <span className="pequeno suave">{formatarDataEmail(email.data, true)}</span>
        <button
          type="button"
          className={`estrela ${email.estrela ? "marcada" : ""}`}
          aria-label={email.estrela ? t("email.tirarEstrela") : t("email.marcarEstrela")}
          aria-pressed={email.estrela}
          onClick={aoEstrela}
        >
          <IconeEstrela cheia={email.estrela} />
        </button>
      </div>
      {/* Texto puro: o React escapa tudo, então nada do e-mail é interpretado como HTML. */}
      <div className="email-corpo">{email.corpo}</div>
    </article>
  );
}

/** Estrela desenhada (cheia ou só o contorno), na cor do texto do botão. */
function IconeEstrela({ cheia }: { cheia: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path
        d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"
        fill={cheia ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
