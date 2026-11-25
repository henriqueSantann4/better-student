import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { semestres } from "@better-student/shared";
import { useApp } from "../contexto";

/** Sugere "2026.1" no primeiro semestre do ano e "2026.2" a partir de julho. */
function nomeSugerido(hoje = new Date()): string {
  return `${hoje.getFullYear()}.${hoje.getMonth() >= 6 ? 2 : 1}`;
}

export function CriarSemestre() {
  const { t } = useTranslation();
  const { banco, acao } = useApp();
  const [nome, setNome] = useState(nomeSugerido);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    // Datas "YYYY-MM-DD" podem ser comparadas como texto: a ordem é a mesma.
    if (fim < inicio) {
      setAviso(t("semestre.fimAntesInicio"));
      return;
    }
    await acao(() => semestres.criar(banco, { nome: nome.trim(), inicio, fim }));
  }

  return (
    <section className="cartao estreito">
      <h1>{t("semestre.titulo")}</h1>
      <p className="suave">{t("semestre.descricao")}</p>
      <form className="formulario" onSubmit={enviar}>
        <label>
          {t("semestre.nome")}
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("semestre.nomeDica")} required />
        </label>
        <div className="linha">
          <label>
            {t("semestre.inicio")}
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </label>
          <label>
            {t("semestre.fim")}
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} required />
          </label>
        </div>
        {aviso && <p className="aviso">{aviso}</p>}
        <button type="submit" className="botao primario">
          {t("semestre.criar")}
        </button>
      </form>
    </section>
  );
}
