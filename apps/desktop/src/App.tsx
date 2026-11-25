import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Banco } from "@better-student/shared";
import { abrirBanco } from "./banco";
import { ProvedorApp, useApp } from "./contexto";
import { ehDuplicado } from "./formatos";
import { Agenda } from "./telas/Agenda";
import { Calendario } from "./telas/Calendario";
import { CriarSemestre } from "./telas/CriarSemestre";
import { Email } from "./telas/Email";
import { Faltas } from "./telas/Faltas";
import { Grade } from "./telas/Grade";
import { Moodle } from "./telas/Moodle";
import { Notas } from "./telas/Notas";

const SECOES = ["agenda", "grade", "calendario", "faltas", "notas", "materiais", "moodle", "email"] as const;
type Secao = (typeof SECOES)[number];

export function App() {
  const { t } = useTranslation();
  const [banco, setBanco] = useState<Banco | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    abrirBanco().then(setBanco).catch(setErro);
  }, []);

  if (erro) {
    return (
      <main className="conteudo">
        <p className="aviso">
          {t("app.erroBanco")} {String(erro)}
        </p>
      </main>
    );
  }
  if (!banco) return <main className="conteudo suave">{t("app.carregando")}</main>;

  return (
    <ProvedorApp banco={banco}>
      <Layout />
    </ProvedorApp>
  );
}

function Layout() {
  const { t } = useTranslation();
  const { dados } = useApp();
  const [secao, setSecao] = useState<Secao | null>(null);
  const [versaoNucleo, setVersaoNucleo] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<string>("versao_nucleo").then(setVersaoNucleo).catch(console.error);
  }, []);

  // A tela inicial é escolhida uma vez só, quando os dados chegam: Faltas no
  // dia a dia, ou Grade se ainda não há disciplinas (é por onde se começa).
  // Escolher só uma vez evita que a tela "pule" quando a primeira disciplina
  // é cadastrada.
  useEffect(() => {
    if (secao === null && dados !== undefined) {
      setSecao(dados && dados.disciplinas.length > 0 ? "faltas" : "grade");
    }
  }, [dados, secao]);

  const secaoAtiva: Secao = secao ?? "grade";

  return (
    <div className="layout">
      <nav className="menu">
        <strong className="logo">{t("app.nome")}</strong>
        {dados && <span className="menu-semestre suave">{dados.semestre.nome}</span>}
        {SECOES.map((s) => (
          <button
            key={s}
            type="button"
            className={`menu-item ${s === secaoAtiva ? "ativo" : ""}`}
            aria-current={s === secaoAtiva ? "page" : undefined}
            onClick={() => setSecao(s)}
          >
            {t(`menu.${s}`)}
          </button>
        ))}
        <span className="menu-rodape suave">
          {versaoNucleo ? t("app.versaoNucleo", { versao: versaoNucleo }) : t("app.modoNavegador")}
        </span>
      </nav>
      <main className="conteudo">
        <AvisoErro />
        {dados === undefined ? (
          <p className="suave">{t("app.carregando")}</p>
        ) : dados === null ? (
          <CriarSemestre />
        ) : secaoAtiva === "agenda" ? (
          <Agenda />
        ) : secaoAtiva === "grade" ? (
          <Grade />
        ) : secaoAtiva === "faltas" ? (
          <Faltas />
        ) : secaoAtiva === "notas" ? (
          <Notas />
        ) : secaoAtiva === "calendario" ? (
          <Calendario />
        ) : secaoAtiva === "email" ? (
          <Email />
        ) : secaoAtiva === "moodle" ? (
          <Moodle />
        ) : (
          <>
            <h1>{t(`menu.${secaoAtiva}`)}</h1>
            <p className="suave">{t("emBreve")}</p>
          </>
        )}
      </main>
    </div>
  );
}

function AvisoErro() {
  const { t } = useTranslation();
  const { erro, limparErro } = useApp();
  if (!erro) return null;
  const mensagem = ehDuplicado(erro) ? t("faltas.duplicada") : t("comum.erro", { mensagem: String(erro) });
  return (
    <div className="aviso faixa" role="alert">
      <span>{mensagem}</span>
      <button type="button" className="botao-icone" onClick={limparErro} aria-label={t("comum.fechar")}>
        ×
      </button>
    </div>
  );
}
