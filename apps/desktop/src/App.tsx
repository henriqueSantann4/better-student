import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Banco } from "@better-student/shared";
import { abrirBanco } from "./banco";
import { ProvedorApp, useApp } from "./contexto";
import { ehDuplicado } from "./formatos";
import { Agenda } from "./telas/Agenda";
import { Configuracoes } from "./telas/Configuracoes";
import { CriarSemestre } from "./telas/CriarSemestre";
import { Email } from "./telas/Email";
import { EscolherInstituicao } from "./telas/EscolherInstituicao";
import { Faltas } from "./telas/Faltas";
import { Grade } from "./telas/Grade";
import { Inicio } from "./telas/Inicio";
import { Materiais } from "./telas/Materiais";
import { Moodle } from "./telas/Moodle";
import { Notas } from "./telas/Notas";
import { CaixaNovidades, PainelAtualizar } from "./telas/Novidades";
import { ProvedorSincronizacao } from "./sincronizacao";

const SECOES = ["inicio", "agenda", "grade", "faltas", "notas", "materiais", "moodle", "email", "configuracoes"] as const;
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
      <ProvedorSincronizacao>
        <Layout />
      </ProvedorSincronizacao>
    </ProvedorApp>
  );
}

function Layout() {
  const { t } = useTranslation();
  const { dados, instituicao } = useApp();
  const [secao, setSecao] = useState<Secao | null>(null);
  const [versaoNucleo, setVersaoNucleo] = useState<string | null>(null);
  // A caixa "Enquanto você estava fora" abre uma vez, junto com o app.
  const [caixa, setCaixa] = useState<"fechada" | "aberta" | "vista">("fechada");
  const pronto = !!dados && !!instituicao;
  useEffect(() => {
    if (pronto && caixa === "fechada") setCaixa("aberta");
  }, [pronto, caixa]);

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
      setSecao(dados && dados.disciplinas.length > 0 ? "inicio" : "grade");
    }
  }, [dados, secao]);

  const secaoAtiva: Secao = secao ?? "grade";

  return (
    <div className="layout">
      <nav className="menu">
        <strong className="logo">{t("app.nome")}</strong>
        {dados && (
          <span className="menu-semestre suave">
            {instituicao ? `${dados.semestre.nome} · ${instituicao.perfil.sigla}${instituicao.campus ? ` ${instituicao.campus.nome}` : ""}` : dados.semestre.nome}
          </span>
        )}
        {pronto && <PainelAtualizar aoTerminarComNovidades={() => setCaixa("aberta")} />}
        {/* Na pergunta inicial (faculdade), o menu fica escondido: ela vem antes de tudo. */}
        {instituicao !== null && SECOES.map((s) => (
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
        {dados === undefined || instituicao === undefined ? (
          <p className="suave">{t("app.carregando")}</p>
        ) : instituicao === null ? (
          // Primeiro acesso: a faculdade vem antes de tudo, porque preenche o resto.
          <EscolherInstituicao />
        ) : secaoAtiva === "configuracoes" ? (
          <Configuracoes />
        ) : dados === null ? (
          <CriarSemestre />
        ) : secaoAtiva === "inicio" ? (
          <Inicio aoIr={setSecao} />
        ) : secaoAtiva === "agenda" ? (
          <Agenda />
        ) : secaoAtiva === "grade" ? (
          <Grade />
        ) : secaoAtiva === "faltas" ? (
          <Faltas />
        ) : secaoAtiva === "notas" ? (
          <Notas aoIrAgenda={() => setSecao("agenda")} />
        ) : secaoAtiva === "materiais" ? (
          <Materiais />
        ) : secaoAtiva === "email" ? (
          <Email />
        ) : (
          <Moodle />
        )}
      </main>
      {pronto && caixa === "aberta" && <CaixaNovidades aoFechar={() => setCaixa("vista")} aoIr={setSecao} />}
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
