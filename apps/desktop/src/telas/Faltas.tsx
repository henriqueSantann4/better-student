import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  diaSemanaDe,
  encontrosRestantes,
  faltas as repoFaltas,
  hojeIso,
  nivelFaltas,
  resumirFaltas,
  type Disciplina,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { formatarData, formatarDataHora, formatarPercentual } from "../formatos";

export function Faltas() {
  const { t } = useTranslation();
  const { disciplinas } = useSemestre();

  return (
    <>
      <header className="cabecalho">
        <h1>{t("faltas.titulo")}</h1>
      </header>
      {disciplinas.length === 0 ? (
        <p className="cartao suave">{t("faltas.semDisciplinas")}</p>
      ) : (
        <>
          <AulasDeHoje />
          <section className="cartao">
            <h2>{t("faltas.porDisciplina")}</h2>
            <div className="grade-cartoes">
              {disciplinas.map((d) => (
                <ResumoDisciplina key={d.id} disciplina={d} />
              ))}
            </div>
          </section>
          <FormFalta />
          <Historico />
        </>
      )}
    </>
  );
}

/** Atalho do dia a dia: as aulas de hoje com um botão "Faltei". */
function AulasDeHoje() {
  const { t } = useTranslation();
  const { banco, acao, disciplinas, horarios, faltas } = useSemestre();
  const hoje = hojeIso();
  const porId = new Map(disciplinas.map((d) => [d.id, d]));
  const aulas = horarios.filter((h) => h.diaSemana === diaSemanaDe(hoje));

  return (
    <section className="cartao">
      <h2>{t("faltas.hoje")}</h2>
      {aulas.length === 0 && <p className="suave">{t("faltas.semAulasHoje")}</p>}
      <ul className="lista">
        {aulas.map((h) => {
          const d = porId.get(h.disciplinaId);
          const registrada = faltas.find((f) => f.horarioAulaId === h.id && f.data === hoje);
          return (
            <li key={h.id} className="item">
              <span className="bolinha" style={{ background: d?.cor ?? undefined }} />
              <div className="item-texto">
                <strong>{d?.nome}</strong>
                <span className="pequeno suave">
                  {h.inicio}–{h.fim} · {t("grade.aulas", { count: h.quantidadeAulas })}
                </span>
              </div>
              {registrada ? (
                <>
                  <span className="etiqueta atencao">{t("faltas.registrada")}</span>
                  <button type="button" className="botao" onClick={() => acao(() => repoFaltas.excluir(banco, registrada.id))}>
                    {t("faltas.desfazer")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="botao primario"
                  onClick={() =>
                    acao(() =>
                      repoFaltas.registrar(banco, {
                        disciplinaId: h.disciplinaId,
                        data: hoje,
                        horarioAulaId: h.id,
                        quantidadeAulas: h.quantidadeAulas,
                      }),
                    )
                  }
                >
                  {t("faltas.faltei")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResumoDisciplina({ disciplina }: { disciplina: Disciplina }) {
  const { t } = useTranslation();
  const { semestre, horarios, faltas } = useSemestre();

  const resumo = resumirFaltas(
    disciplina,
    faltas.filter((f) => f.disciplinaId === disciplina.id),
    semestre,
    disciplina.suap?.faltas ?? null,
  );
  // Com encontros de tamanhos diferentes, conta pelo maior: é a estimativa mais segura.
  const aulasPorEncontro = Math.max(
    0,
    ...horarios.filter((h) => h.disciplinaId === disciplina.id).map((h) => h.quantidadeAulas),
  );
  const nivel = nivelFaltas(resumo, aulasPorEncontro);
  const proporcao = resumo.limite > 0 ? Math.min(1, resumo.faltas / resumo.limite) : resumo.faltas > 0 ? 1 : 0;

  return (
    <article className="resumo" style={{ borderTopColor: disciplina.cor ?? undefined }}>
      <div className="resumo-topo">
        <strong>{disciplina.nome}</strong>
        <span className={`etiqueta ${nivel}`}>{t(`faltas.nivel.${nivel}`)}</span>
      </div>
      <div
        className={`barra ${nivel}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={resumo.limite}
        aria-valuenow={resumo.faltas}
      >
        <div style={{ width: `${proporcao * 100}%` }} />
      </div>
      <span>{t("faltas.resumo", { faltas: resumo.faltas, limite: resumo.limite })}</span>
      {resumo.reprovadoPorFalta ? (
        <span className="pequeno">{t("faltas.reprovadoDetalhe", { limite: resumo.limite })}</span>
      ) : resumo.restantes === 0 ? (
        <strong className="pequeno texto-perigo">{t("faltas.noLimite")}</strong>
      ) : (
        <span className="pequeno">
          {t("faltas.podeFaltar", { count: resumo.restantes })}
          {aulasPorEncontro > 0 &&
            ` (${t("faltas.encontros", {
              count: encontrosRestantes(resumo.restantes, aulasPorEncontro),
              aulas: aulasPorEncontro,
            })})`}
        </span>
      )}
      <span className="pequeno suave">{t("faltas.frequencia", { valor: formatarPercentual(resumo.frequencia) })}</span>
      {resumo.oficiais !== null && (
        <span className="pequeno suave">
          {t(resumo.fonte === "suap" ? "faltas.fonteSuap" : "faltas.fonteApp", {
            registradas: resumo.registradas,
            oficiais: resumo.oficiais,
          })}
          {disciplina.suap?.atualizadoEm && ` ${t("faltas.suapEm", { data: formatarDataHora(disciplina.suap.atualizadoEm) })}`}
        </span>
      )}
    </article>
  );
}

/** Lançamento manual: falta de outro dia, falta avulsa ou falta parcial. */
function FormFalta() {
  const { t } = useTranslation();
  const { banco, acao, disciplinas, horarios } = useSemestre();
  const [disciplinaId, setDisciplinaId] = useState(disciplinas[0]?.id ?? "");
  const [data, setData] = useState(hojeIso);
  const [horarioId, setHorarioId] = useState<string | null>(null);
  const [quantidadeManual, setQuantidadeManual] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");

  const escolhida = disciplinas.some((d) => d.id === disciplinaId) ? disciplinaId : (disciplinas[0]?.id ?? "");
  // Encontros dessa disciplina no dia da semana da data escolhida.
  const encontros = data
    ? horarios.filter((h) => h.disciplinaId === escolhida && h.diaSemana === diaSemanaDe(data))
    : [];
  // Sem escolha explícita, sugere o primeiro encontro do dia (ou avulsa, se não houver).
  const encontro = horarioId === "" ? undefined : (encontros.find((h) => h.id === horarioId) ?? encontros[0]);
  const quantidade = quantidadeManual ?? encontro?.quantidadeAulas ?? 1;

  function mudou<T>(definir: (v: T) => void) {
    return (valor: T) => {
      definir(valor);
      setQuantidadeManual(null);
    };
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const ok = await acao(() =>
      repoFaltas.registrar(banco, {
        disciplinaId: escolhida,
        data,
        horarioAulaId: encontro?.id ?? null,
        quantidadeAulas: quantidade,
        observacao: observacao.trim() || null,
      }),
    );
    if (ok) {
      setObservacao("");
      setQuantidadeManual(null);
    }
  }

  return (
    <section className="cartao">
      <h2>{t("faltas.registrar")}</h2>
      <form className="formulario" onSubmit={enviar}>
        <div className="linha">
          <label className="largo">
            {t("faltas.disciplina")}
            <select
              value={escolhida}
              onChange={(e) => {
                mudou(setDisciplinaId)(e.target.value);
                setHorarioId(null);
              }}
            >
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("faltas.data")}
            <input
              type="date"
              value={data}
              onChange={(e) => {
                mudou(setData)(e.target.value);
                setHorarioId(null);
              }}
              required
            />
          </label>
        </div>
        <div className="linha">
          <label className="largo">
            {t("faltas.encontro")}
            <select value={encontro?.id ?? ""} onChange={(e) => mudou(setHorarioId)(e.target.value)}>
              {encontros.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.inicio}–{h.fim} · {t("grade.aulas", { count: h.quantidadeAulas })}
                </option>
              ))}
              <option value="">{t("faltas.avulsa")}</option>
            </select>
          </label>
          <label title={t("faltas.quantidadeDica")}>
            {t("faltas.quantidade")}
            <input
              type="number"
              min={1}
              max={12}
              value={quantidade}
              onChange={(e) => setQuantidadeManual(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <label>
          <span>{t("faltas.observacao")} <span className="suave">({t("comum.opcional")})</span></span>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </label>
        <p className="pequeno suave">{t("faltas.quantidadeDica")}</p>
        <div className="acoes">
          <button type="submit" className="botao primario">
            {t("faltas.registrar")}
          </button>
        </div>
      </form>
    </section>
  );
}

function Historico() {
  const { t } = useTranslation();
  const { banco, acao, disciplinas, faltas } = useSemestre();
  const porId = new Map(disciplinas.map((d) => [d.id, d]));

  return (
    <section className="cartao">
      <h2>{t("faltas.historico")}</h2>
      {faltas.length === 0 && <p className="suave">{t("faltas.semFaltas")}</p>}
      <ul className="lista">
        {faltas.map((f) => {
          const d = porId.get(f.disciplinaId);
          return (
            <li key={f.id} className="item">
              <span className="bolinha" style={{ background: d?.cor ?? undefined }} />
              <div className="item-texto">
                <strong>{d?.nome}</strong>
                <span className="pequeno suave">
                  {[formatarData(f.data), t("grade.aulas", { count: f.quantidadeAulas }), f.observacao]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <button type="button" className="botao" onClick={() => acao(() => repoFaltas.excluir(banco, f.id))}>
                {t("comum.remover")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
