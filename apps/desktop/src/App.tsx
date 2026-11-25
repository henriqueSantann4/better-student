import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";

const SECOES = ["agenda", "grade", "faltas", "notas", "materiais"] as const;

export function App() {
  const { t } = useTranslation();
  const [versaoNucleo, setVersaoNucleo] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<string>("versao_nucleo").then(setVersaoNucleo).catch(console.error);
  }, []);

  return (
    <div className="layout">
      <nav className="menu">
        <strong className="logo">{t("app.nome")}</strong>
        {SECOES.map((secao) => (
          <button key={secao} type="button" className="menu-item">
            {t(`menu.${secao}`)}
          </button>
        ))}
      </nav>
      <main className="conteudo">
        <h1>{t("app.boasVindas")}</h1>
        <p>{t("app.subtitulo")}</p>
        <p className="rodape">
          {versaoNucleo
            ? t("app.versaoNucleo", { versao: versaoNucleo })
            : t("app.nucleoIndisponivel")}
        </p>
      </main>
    </div>
  );
}
