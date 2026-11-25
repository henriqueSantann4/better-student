import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  aplicarDetalhesSuap,
  aplicarImportacao,
  calendario as repoCalendario,
  estimarDatas,
  importarHorarios,
  nomeDoPeriodo,
  periodoDaData,
  periodoDoNome,
  planejarImportacao,
  semestreDoBoletim,
  semestres,
  type BoletimSuap,
} from "@better-student/shared";
import { useApp } from "../contexto";
import { CORES } from "../cores";
import { formatarDataCompleta } from "../formatos";
import { EntradaBoletim, mesmoPeriodo, PreviaHorarios, PreviaImportacao, SEM_EXTRAS, type ExtrasSuap } from "./ImportarSuap";

/**
 * Primeiro acesso. Dois caminhos:
 *  - começar pelo boletim do SUAP: o semestre (nome) e as disciplinas vêm
 *    dele; as datas, que o boletim não traz, são estimadas;
 *  - criar o semestre à mão, já com as datas estimadas preenchidas.
 */
export function CriarSemestre() {
  const { t } = useTranslation();
  const [manual, setManual] = useState(false);

  return (
    <section className="cartao estreito">
      <h1>{t("semestre.titulo")}</h1>
      <p className="suave">{t("semestre.descricao")}</p>
      {manual ? <FormManual /> : <ComecarPeloSuap />}
      <p className="pequeno">
        <button type="button" className="link" onClick={() => setManual(!manual)}>
          {manual ? t("semestre.preferoSuap") : t("semestre.preferoManual")}
        </button>
      </p>
    </section>
  );
}

function ComecarPeloSuap() {
  const { t } = useTranslation();
  const { banco, acao, instituicao } = useApp();
  const [boletim, setBoletim] = useState<BoletimSuap | null>(null);
  const [extras, setExtras] = useState<ExtrasSuap>(SEM_EXTRAS);

  if (!boletim) {
    return (
      <>
        <h2>{t("semestre.comecarSuap")}</h2>
        <EntradaBoletim
          aoLer={(b, e) => {
            setBoletim(b);
            setExtras(e);
          }}
        />
      </>
    );
  }

  const estimado = semestreDoBoletim(boletim);
  const { calendario } = extras;
  const horarios = extras.horarios && mesmoPeriodo(extras.horarios.periodo, boletim.periodo) ? extras.horarios : null;
  // Com o calendário do SUAP do mesmo período, o semestre já nasce com as datas reais.
  const doCalendario =
    calendario && periodoDoNome(calendario.periodo) && nomeDoPeriodo(periodoDoNome(calendario.periodo)!) === estimado.nome
      ? calendario
      : null;
  const novo = doCalendario ? { ...estimado, inicio: doCalendario.inicio, fim: doCalendario.fim, datasEstimadas: false } : estimado;
  const plano = planejarImportacao(boletim, []);

  async function confirmar() {
    if (!boletim) return;
    await acao(async () => {
      // As regras (médias, recuperação, frequência) vêm da instituição escolhida.
      const semestre = await semestres.criar(banco, { ...novo, regras: instituicao?.perfil.regras });
      await aplicarImportacao(banco, semestre.id, boletim, plano, CORES);
      if (horarios) await importarHorarios(banco, semestre.id, horarios);
      if (extras.detalhes.length > 0) await aplicarDetalhesSuap(banco, semestre.id, extras.detalhes);
      if (doCalendario) await repoCalendario.aplicarPacote(banco, semestre, "suap", doCalendario);
    });
  }

  return (
    <>
      <p>
        {t("semestre.seraCriado", {
          nome: novo.nome,
          inicio: formatarDataCompleta(novo.inicio),
          fim: formatarDataCompleta(novo.fim),
        })}
      </p>
      <p className="pequeno suave">{doCalendario ? t("semestre.datasDoCalendario") : t("semestre.datasEstimadasDica")}</p>
      <PreviaImportacao boletim={boletim} plano={plano} />
      {horarios && <PreviaHorarios horarios={horarios} />}
      <div className="acoes">
        <button type="button" className="botao primario" onClick={confirmar}>
          {t("semestre.criarEImportar", { count: plano.length })}
        </button>
        <button type="button" className="botao" onClick={() => setBoletim(null)}>
          {t("comum.cancelar")}
        </button>
      </div>
    </>
  );
}

function FormManual() {
  const { t } = useTranslation();
  const { banco, acao, instituicao } = useApp();
  const [nome, setNome] = useState(() => {
    const { ano, periodo } = periodoDaData();
    return `${ano}.${periodo}`;
  });
  // Enquanto o usuário não mexer nas datas, elas acompanham o nome (estimadas).
  const [datas, setDatas] = useState<{ inicio: string; fim: string } | null>(null);
  const estimadas = estimarDatas(periodoDoNome(nome) ?? periodoDaData());
  const { inicio, fim } = datas ?? estimadas;
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    // Datas "YYYY-MM-DD" podem ser comparadas como texto: a ordem é a mesma.
    if (fim < inicio) {
      setAviso(t("semestre.fimAntesInicio"));
      return;
    }
    await acao(() =>
      semestres.criar(banco, { nome: nome.trim(), inicio, fim, datasEstimadas: datas === null, regras: instituicao?.perfil.regras }),
    );
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <label>
        {t("semestre.nome")}
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("semestre.nomeDica")} required />
      </label>
      <div className="linha">
        <label>
          {t("semestre.inicio")}
          <input type="date" value={inicio} onChange={(e) => setDatas({ inicio: e.target.value, fim })} required />
        </label>
        <label>
          {t("semestre.fim")}
          <input type="date" value={fim} onChange={(e) => setDatas({ inicio, fim: e.target.value })} required />
        </label>
      </div>
      {datas === null && <p className="pequeno suave">{t("semestre.datasEstimadasDica")}</p>}
      {aviso && <p className="aviso">{aviso}</p>}
      <button type="submit" className="botao primario">
        {t("semestre.criar")}
      </button>
    </form>
  );
}
