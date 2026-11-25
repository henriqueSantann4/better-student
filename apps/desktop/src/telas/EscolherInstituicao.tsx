import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  campusPeloMoodle,
  configuracao,
  gravarEscolhaInstituicao,
  resolverEscolha,
  semestres,
  textosRecuperacao,
  type EscolhaInstituicao,
} from "@better-student/shared";
import { useApp } from "../contexto";
import { INSTITUICAO_PADRAO, PERFIS } from "../instituicoes";

/**
 * Primeiro acesso: a única pergunta é a faculdade e o campus. Dali o app
 * preenche regras, SUAP, Moodle e calendário (ver princípio 7 no CLAUDE.md).
 * Quem já usava o app antes desta tela também passa por ela uma vez; o
 * campus é sugerido pelo Moodle que estava salvo.
 */
export function EscolherInstituicao() {
  const { t } = useTranslation();
  const { banco, acao } = useApp();
  const [escolha, setEscolha] = useState<EscolhaInstituicao | null>(null);

  useEffect(() => {
    const ifsp = PERFIS.find((p) => p.id === INSTITUICAO_PADRAO) ?? PERFIS[0]!;
    configuracao
      .ler<string>(banco, "moodleSite")
      .then((site) => setEscolha({ instituicaoId: ifsp.id, campusId: campusPeloMoodle(ifsp, site)?.id ?? null }))
      .catch(() => setEscolha({ instituicaoId: ifsp.id, campusId: null }));
  }, [banco]);

  if (!escolha) return null;

  return (
    <section className="cartao estreito">
      <h1>{t("instituicao.boasVindas")}</h1>
      <p className="suave">{t("instituicao.descricao")}</p>
      <SeletorInstituicao escolha={escolha} aoMudar={setEscolha} />
      <div className="acoes">
        <button
          type="button"
          className="botao primario"
          onClick={() =>
            acao(async () => {
              const { perfil } = await gravarEscolhaInstituicao(banco, PERFIS, escolha);
              // Quem já tinha semestre fica com as regras da instituição escolhida.
              const atual = await semestres.atual(banco);
              if (atual) await semestres.atualizarRegras(banco, atual.id, perfil.regras);
            })
          }
        >
          {t("instituicao.continuar")}
        </button>
      </div>
      <p className="pequeno suave">{t("instituicao.depois")}</p>
    </section>
  );
}

/** Os dois campos (faculdade e campus) e o resumo do que vem com eles. */
export function SeletorInstituicao({
  escolha,
  aoMudar,
}: {
  escolha: EscolhaInstituicao;
  aoMudar: (escolha: EscolhaInstituicao) => void;
}) {
  const { t } = useTranslation();
  const { perfil, sistemas } = resolverEscolha(PERFIS, escolha);

  return (
    <div className="formulario">
      <label>
        {t("instituicao.faculdade")}
        <select value={perfil.id} onChange={(e) => aoMudar({ instituicaoId: e.target.value, campusId: null })}>
          {PERFIS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === "outra" ? t("instituicao.outra") : `${p.sigla} – ${p.nome}`}
            </option>
          ))}
        </select>
      </label>
      {perfil.campi.length > 0 && (
        <label>
          {t("instituicao.campus")}
          <select value={escolha.campusId ?? ""} onChange={(e) => aoMudar({ ...escolha, campusId: e.target.value || null })}>
            <option value="">{t("instituicao.escolhaCampus")}</option>
            {perfil.campi.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="instituicao-resumo pequeno">
        <li>
          {t("instituicao.regras", {
            aprovacao: perfil.regras.mediaAprovacao,
            frequencia: Math.round(perfil.regras.frequenciaMinima * 100),
            ...textosRecuperacao(perfil),
          })}
        </li>
        <li>{sistemas.suap ? t("instituicao.comSuap") : t("instituicao.semSuap")}</li>
        <li>
          {sistemas.moodle
            ? t("instituicao.comMoodle", { endereco: sistemas.moodle.replace(/^https?:\/\//, "") })
            : t("instituicao.semMoodle")}
        </li>
      </ul>
      {perfil.id === "outra" && <p className="pequeno suave">{t("instituicao.outraDica")}</p>}
    </div>
  );
}
