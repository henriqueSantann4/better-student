import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  disciplinas as repoDisciplinas,
  horarios as repoHorarios,
  type DadosDisciplina,
  type DiaSemana,
  type Disciplina,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { formatarDataCompleta, nomeDia } from "../formatos";

/** Cores sugeridas para as disciplinas, em rodízio. */
const CORES = ["#4c6ef5", "#12b886", "#f59f00", "#e64980", "#7950f2", "#15aabf", "#fa5252", "#82c91e"];

/** Segunda a sábado; domingo só aparece se tiver aula. */
const DIAS_UTEIS: DiaSemana[] = [1, 2, 3, 4, 5, 6];
const TODOS_DIAS: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0];

export function Grade() {
  const { t } = useTranslation();
  const { semestre, disciplinas, horarios } = useSemestre();

  return (
    <>
      <header className="cabecalho">
        <h1>{t("grade.titulo")}</h1>
        <span className="suave">
          {semestre.nome} ·{" "}
          {t("semestre.periodo", {
            inicio: formatarDataCompleta(semestre.inicio),
            fim: formatarDataCompleta(semestre.fim),
          })}
        </span>
      </header>

      <Semana />
      {disciplinas.length > 0 && <FormHorario />}

      <section className="cartao">
        <h2>{t("grade.disciplinas")}</h2>
        {disciplinas.length === 0 && <p className="suave">{t("grade.semDisciplinas")}</p>}
        <ul className="lista">
          {disciplinas.map((d) => (
            <ItemDisciplina key={d.id} disciplina={d} qtdHorarios={horarios.filter((h) => h.disciplinaId === d.id).length} />
          ))}
        </ul>
        <FormDisciplina key={disciplinas.length} corPadrao={CORES[disciplinas.length % CORES.length]!} />
      </section>
    </>
  );
}

function Semana() {
  const { t } = useTranslation();
  const { banco, acao, disciplinas, horarios } = useSemestre();
  const porId = new Map(disciplinas.map((d) => [d.id, d]));
  const dias = horarios.some((h) => h.diaSemana === 0) ? TODOS_DIAS : DIAS_UTEIS;

  if (disciplinas.length === 0) {
    return <p className="cartao suave">{t("grade.cadastreDisciplinaAntes")}</p>;
  }

  return (
    <section className="cartao">
      <h2>{t("grade.semana")}</h2>
      <div className="semana">
        {dias.map((dia) => {
          const doDia = horarios.filter((h) => h.diaSemana === dia);
          return (
            <div key={dia} className="dia">
              <strong className="dia-nome">{nomeDia(dia)}</strong>
              {doDia.length === 0 && <span className="suave pequeno">{t("grade.semAulas")}</span>}
              {doDia.map((h) => {
                const d = porId.get(h.disciplinaId);
                return (
                  <div key={h.id} className="aula" style={{ borderLeftColor: d?.cor ?? undefined }}>
                    <span className="pequeno suave">
                      {h.inicio}–{h.fim}
                    </span>
                    <strong>{d?.sigla || d?.nome}</strong>
                    <span className="pequeno suave">
                      {[h.sala, t("grade.aulas", { count: h.quantidadeAulas })].filter(Boolean).join(" · ")}
                    </span>
                    <button
                      type="button"
                      className="botao-icone"
                      title={t("grade.removerHorario")}
                      aria-label={t("grade.removerHorario")}
                      onClick={() => acao(() => repoHorarios.excluir(banco, h.id))}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FormHorario() {
  const { t } = useTranslation();
  const { banco, acao, disciplinas } = useSemestre();
  const [disciplinaId, setDisciplinaId] = useState(disciplinas[0]?.id ?? "");
  const [dia, setDia] = useState<DiaSemana>(1);
  const [inicio, setInicio] = useState("19:00");
  const [fim, setFim] = useState("22:30");
  const [quantidade, setQuantidade] = useState(4);
  const [sala, setSala] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  // Se a disciplina escolhida foi excluída, volta para a primeira.
  const escolhida = disciplinas.some((d) => d.id === disciplinaId) ? disciplinaId : (disciplinas[0]?.id ?? "");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (fim <= inicio) {
      setAviso(t("grade.fimAntesInicio"));
      return;
    }
    setAviso(null);
    await acao(() =>
      repoHorarios.criar(banco, {
        disciplinaId: escolhida,
        diaSemana: dia,
        inicio,
        fim,
        quantidadeAulas: quantidade,
        sala: sala.trim() || null,
      }),
    );
  }

  return (
    <section className="cartao">
      <h2>{t("grade.novoHorario")}</h2>
      <form className="formulario" onSubmit={enviar}>
        <div className="linha">
          <label className="largo">
            {t("grade.disciplina")}
            <select value={escolhida} onChange={(e) => setDisciplinaId(e.target.value)}>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("grade.dia")}
            <select value={dia} onChange={(e) => setDia(Number(e.target.value) as DiaSemana)}>
              {TODOS_DIAS.map((d) => (
                <option key={d} value={d}>
                  {nomeDia(d)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("grade.inicio")}
            <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </label>
          <label>
            {t("grade.fim")}
            <input type="time" value={fim} onChange={(e) => setFim(e.target.value)} required />
          </label>
        </div>
        <div className="linha">
          <label title={t("grade.quantidadeAulasDica")}>
            {t("grade.quantidadeAulas")}
            <input
              type="number"
              min={1}
              max={12}
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
              required
            />
          </label>
          <label>
            <span>{t("grade.sala")} <span className="suave">({t("comum.opcional")})</span></span>
            <input value={sala} onChange={(e) => setSala(e.target.value)} />
          </label>
          <button type="submit" className="botao primario alinhar-base">
            {t("comum.adicionar")}
          </button>
        </div>
        {aviso && <p className="aviso">{aviso}</p>}
      </form>
    </section>
  );
}

function ItemDisciplina({ disciplina, qtdHorarios }: { disciplina: Disciplina; qtdHorarios: number }) {
  const { t } = useTranslation();
  const { banco, acao } = useSemestre();
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <li>
        <FormDisciplina disciplina={disciplina} aoTerminar={() => setEditando(false)} corPadrao={disciplina.cor ?? CORES[0]!} />
      </li>
    );
  }

  function excluir() {
    if (!window.confirm(t("grade.confirmarExcluirDisciplina", { nome: disciplina.nome }))) return;
    void acao(() => repoDisciplinas.excluir(banco, disciplina.id));
  }

  return (
    <li className="item">
      <span className="bolinha" style={{ background: disciplina.cor ?? undefined }} />
      <div className="item-texto">
        <strong>
          {disciplina.nome} {disciplina.sigla && <span className="suave">({disciplina.sigla})</span>}
        </strong>
        <span className="pequeno suave">
          {[disciplina.professor, t("grade.aulasNoSemestre", { count: disciplina.totalAulas }), qtdHorarios > 0 ? null : t("grade.semAulas")]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <button type="button" className="botao" onClick={() => setEditando(true)}>
        {t("comum.editar")}
      </button>
      <button type="button" className="botao perigo" onClick={excluir}>
        {t("comum.excluir")}
      </button>
    </li>
  );
}

function FormDisciplina({
  disciplina,
  corPadrao,
  aoTerminar,
}: {
  disciplina?: Disciplina;
  corPadrao: string;
  aoTerminar?: () => void;
}) {
  const { t } = useTranslation();
  const { banco, acao, semestre } = useSemestre();
  const [nome, setNome] = useState(disciplina?.nome ?? "");
  const [sigla, setSigla] = useState(disciplina?.sigla ?? "");
  const [professor, setProfessor] = useState(disciplina?.professor ?? "");
  const [totalAulas, setTotalAulas] = useState(disciplina?.totalAulas ?? 80);
  const [cor, setCor] = useState(disciplina?.cor ?? corPadrao);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const dados: DadosDisciplina = {
      nome: nome.trim(),
      sigla: sigla.trim() || null,
      professor: professor.trim() || null,
      totalAulas,
      cor,
      frequenciaMinima: disciplina?.frequenciaMinima ?? null,
    };
    const ok = await acao(() =>
      disciplina ? repoDisciplinas.atualizar(banco, disciplina.id, dados) : repoDisciplinas.criar(banco, semestre.id, dados),
    );
    if (ok) aoTerminar?.();
  }

  return (
    <form className="formulario subformulario" onSubmit={enviar}>
      <h3>{disciplina ? t("grade.editarDisciplina") : t("grade.novaDisciplina")}</h3>
      <div className="linha">
        <label className="largo">
          {t("grade.nome")}
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label>
          <span>{t("grade.sigla")} <span className="suave">({t("comum.opcional")})</span></span>
          <input value={sigla} onChange={(e) => setSigla(e.target.value)} />
        </label>
      </div>
      <div className="linha">
        <label className="largo">
          <span>{t("grade.professor")} <span className="suave">({t("comum.opcional")})</span></span>
          <input value={professor} onChange={(e) => setProfessor(e.target.value)} />
        </label>
        <label title={t("grade.totalAulasDica")}>
          {t("grade.totalAulas")}
          <input type="number" min={1} value={totalAulas} onChange={(e) => setTotalAulas(Number(e.target.value))} required />
        </label>
        <label>
          {t("grade.cor")}
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
        </label>
      </div>
      <p className="pequeno suave">{t("grade.totalAulasDica")}</p>
      <div className="acoes">
        <button type="submit" className="botao primario">
          {disciplina ? t("comum.salvar") : t("comum.adicionar")}
        </button>
        {aoTerminar && (
          <button type="button" className="botao" onClick={aoTerminar}>
            {t("comum.cancelar")}
          </button>
        )}
      </div>
    </form>
  );
}
