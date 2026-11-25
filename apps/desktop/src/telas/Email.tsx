import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
import {
  buscarEmails,
  configuracao,
  emailValido,
  iniciais,
  type CategoriaEmail,
  type Email as EmailT,
} from "@better-student/shared";
import { useApp } from "../contexto";
import { formatarDataEmail } from "../formatos";

const CATEGORIAS: CategoriaEmail[] = ["principal", "atualizacoes", "divulgacao"];
type Pasta = "entrada" | "estrela" | "naoLidos";

/**
 * E-mail institucional. Por enquanto, a conexão com o Google (OAuth + Gmail
 * API) ainda não existe: no app, a caixa aparece vazia com esse aviso; no
 * modo navegador de desenvolvimento, aparecem e-mails de exemplo fictícios
 * para dar para ver e ajustar a tela.
 */
export function Email() {
  const { t } = useTranslation();
  const { banco } = useApp();
  const [endereco, setEndereco] = useState<string | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    configuracao.ler<string>(banco, "emailInstitucional").then(setEndereco).catch(() => setEndereco(null));
  }, [banco]);

  if (endereco === undefined) return <p className="suave">{t("app.carregando")}</p>;
  if (endereco === null || editando) {
    return (
      <ConfigurarEmail
        atual={endereco}
        aoSalvar={(novo) => {
          setEndereco(novo);
          setEditando(false);
        }}
        aoCancelar={endereco ? () => setEditando(false) : undefined}
      />
    );
  }
  return <CaixaEntrada endereco={endereco} aoTrocar={() => setEditando(true)} />;
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
  const { banco, acao } = useApp();
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
            placeholder={t("email.enderecoDica")}
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

function CaixaEntrada({ endereco, aoTrocar }: { endereco: string; aoTrocar: () => void }) {
  const { t } = useTranslation();
  const [emails, setEmails] = useState<EmailT[]>([]);
  const [exemplo, setExemplo] = useState(false);
  const [pasta, setPasta] = useState<Pasta>("entrada");
  const [categoria, setCategoria] = useState<CategoriaEmail>("principal");
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);

  useEffect(() => {
    // Exemplos só no modo navegador de desenvolvimento (não vão para o instalador).
    if (!isTauri() && import.meta.env.DEV) {
      void import("../email/exemplos").then(({ emailsDeExemplo }) => {
        setEmails(emailsDeExemplo());
        setExemplo(true);
      });
    }
  }, []);

  function alterar(id: string, mudanca: Partial<EmailT>) {
    setEmails((lista) => lista.map((e) => (e.id === id ? { ...e, ...mudanca } : e)));
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
        </div>

        {exemplo && <p className="email-aviso pequeno">{t("email.avisoExemplo")}</p>}

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
                <h2>{t("email.naoConectadoTitulo")}</h2>
                <p className="suave">{t("email.naoConectado")}</p>
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
                      {e.estrela ? "★" : "☆"}
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
          {email.estrela ? "★" : "☆"}
        </button>
      </div>
      {/* Texto puro: o React escapa tudo, então nada do e-mail é interpretado como HTML. */}
      <div className="email-corpo">{email.corpo}</div>
    </article>
  );
}
