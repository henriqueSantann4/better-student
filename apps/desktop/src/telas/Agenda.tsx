import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  agruparTarefas,
  casarDisciplinaMoodle,
  ORDEM_GRUPOS,
  paraDataIso,
  subtarefas as repoSubtarefas,
  tarefas as repoTarefas,
  type DadosTarefa,
  type Disciplina,
  type Prioridade,
  type Subtarefa,
  type Tarefa,
  type TipoTarefa,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { formatarDataEmail } from "../formatos";
import { abrirNoNavegador, carregarPainel, estaConectado, lerSiteMoodle, moodleDisponivel } from "../moodle/api";

const TIPOS: TipoTarefa[] = ["prova", "trabalho", "lista", "apresentacao", "atividade_moodle", "outro"];
const PRIORIDADES: Prioridade[] = ["baixa", "media", "alta"];

type Sincronia = { estado: "parado" } | { estado: "buscando" } | { estado: "ok"; novas: number } | { estado: "erro"; mensagem: string };

/**
 * Agenda: provas, trabalhos, listas e as atividades do Moodle, num lugar só,
 * agrupadas pelo prazo (atrasadas, hoje, amanhã, esta semana...).
 */
export function Agenda() {
  const { t } = useTranslation();
  const { banco, acao, disciplinas } = useSemestre();
  const [lista, setLista] = useState<Tarefa[]>([]);
  const [subs, setSubs] = useState<Subtarefa[]>([]);
  const [criando, setCriando] = useState(false);
  const [moodle, setMoodle] = useState<Sincronia>({ estado: "parado" });
  const [moodleConectado, setMoodleConectado] = useState(false);
  const sincronizando = useRef(false);

  const recarregar = useCallback(async () => {
    const [t, s] = await Promise.all([repoTarefas.listar(banco), repoSubtarefas.listar(banco)]);
    setLista(t);
    setSubs(s);
  }, [banco]);

  /** Roda uma alteração (com o aviso de erro do app) e recarrega a lista. */
  const alterar = useCallback(
    async (mudanca: () => Promise<unknown>) => {
      const ok = await acao(mudanca);
      await recarregar();
      return ok;
    },
    [acao, recarregar],
  );

  /** Traz as atividades do Moodle como tarefas (só com o app aberto). */
  const sincronizarMoodle = useCallback(async () => {
    if (sincronizando.current || !moodleDisponivel()) return;
    const site = await lerSiteMoodle(banco);
    if (!(await estaConectado(site))) return;
    setMoodleConectado(true);
    sincronizando.current = true;
    setMoodle({ estado: "buscando" });
    try {
      const painel = await carregarPainel(site);
      // Sala do Moodle → disciplina do app (pelo código do SUAP ou pelo nome).
      const porSala = new Map(painel.disciplinas.map((sala) => [sala.id, casarDisciplinaMoodle(sala, disciplinas)?.id ?? null]));
      const r = await repoTarefas.importarMoodle(banco, painel.atividades, (a) =>
        a.disciplinaId !== null ? (porSala.get(a.disciplinaId) ?? null) : null,
      );
      await recarregar();
      setMoodle({ estado: "ok", novas: r.novas });
    } catch (erro) {
      setMoodle({ estado: "erro", mensagem: String(erro) });
    } finally {
      sincronizando.current = false;
    }
  }, [banco, disciplinas, recarregar]);

  useEffect(() => {
    void recarregar().then(sincronizarMoodle);
  }, [recarregar, sincronizarMoodle]);

  const grupos = agruparTarefas(lista);
  const porDisciplina = new Map(disciplinas.map((d) => [d.id, d]));
  const pendentes = lista.length - grupos.concluidas.length;

  return (
    <>
      <header className="cabecalho">
        <h1>{t("agenda.titulo")}</h1>
        <span className="suave">{t("agenda.pendentes", { count: pendentes })}</span>
        <div className="acoes empurrar-direita">
          {moodleConectado && (
            <button type="button" className="botao" onClick={sincronizarMoodle} disabled={moodle.estado === "buscando"}>
              {moodle.estado === "buscando" ? t("agenda.buscandoMoodle") : t("agenda.atualizarMoodle")}
            </button>
          )}
          {!criando && (
            <button type="button" className="botao primario" onClick={() => setCriando(true)}>
              {t("agenda.nova")}
            </button>
          )}
        </div>
      </header>

      {moodle.estado === "ok" && moodle.novas > 0 && <p className="sucesso">{t("agenda.novasMoodle", { count: moodle.novas })}</p>}
      {moodle.estado === "erro" && <p className="aviso faixa">{t("agenda.erroMoodle", { mensagem: moodle.mensagem })}</p>}

      {criando && (
        <FormTarefa
          disciplinas={disciplinas}
          aoSalvar={async (dados) => {
            const ok = await alterar(() => repoTarefas.criar(banco, dados));
            if (ok) setCriando(false);
          }}
          aoCancelar={() => setCriando(false)}
        />
      )}

      {lista.length === 0 && !criando && <p className="cartao suave">{t("agenda.vazia")}</p>}

      {ORDEM_GRUPOS.filter((g) => g !== "concluidas" && grupos[g].length > 0).map((g) => (
        <section key={g} className={`cartao grupo-agenda grupo-${g}`}>
          <h2>
            {t(`agenda.grupos.${g}`)} <span className="contagem">{grupos[g].length}</span>
          </h2>
          <ul className="lista">
            {grupos[g].map((tarefa) => (
              <ItemTarefa
                key={tarefa.id}
                tarefa={tarefa}
                disciplina={tarefa.disciplinaId ? (porDisciplina.get(tarefa.disciplinaId) ?? null) : null}
                subtarefas={subs.filter((s) => s.tarefaId === tarefa.id)}
                disciplinas={disciplinas}
                alterar={alterar}
              />
            ))}
          </ul>
        </section>
      ))}

      {grupos.concluidas.length > 0 && (
        <details className="cartao">
          <summary>
            <strong>{t("agenda.grupos.concluidas")}</strong> <span className="contagem">{grupos.concluidas.length}</span>
          </summary>
          <ul className="lista">
            {grupos.concluidas.map((tarefa) => (
              <ItemTarefa
                key={tarefa.id}
                tarefa={tarefa}
                disciplina={tarefa.disciplinaId ? (porDisciplina.get(tarefa.disciplinaId) ?? null) : null}
                subtarefas={subs.filter((s) => s.tarefaId === tarefa.id)}
                disciplinas={disciplinas}
                alterar={alterar}
              />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function ItemTarefa({
  tarefa,
  disciplina,
  subtarefas,
  disciplinas,
  alterar,
}: {
  tarefa: Tarefa;
  disciplina: Disciplina | null;
  subtarefas: Subtarefa[];
  disciplinas: Disciplina[];
  alterar: (mudanca: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { banco } = useSemestre();
  const [aberta, setAberta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novaSub, setNovaSub] = useState("");
  const feitas = subtarefas.filter((s) => s.concluida).length;
  const concluida = tarefa.concluidaEm !== null;

  if (editando) {
    return (
      <li>
        <FormTarefa
          tarefa={tarefa}
          disciplinas={disciplinas}
          aoSalvar={async (dados) => {
            const ok = await alterar(() => repoTarefas.atualizar(banco, tarefa.id, dados));
            if (ok) setEditando(false);
          }}
          aoCancelar={() => setEditando(false)}
        />
      </li>
    );
  }

  async function adicionarSub(e: FormEvent) {
    e.preventDefault();
    const titulo = novaSub.trim();
    if (!titulo) return;
    await alterar(() => repoSubtarefas.criar(banco, tarefa.id, titulo));
    setNovaSub("");
  }

  return (
    <li className={`tarefa ${concluida ? "concluida" : ""}`} style={{ borderLeftColor: disciplina?.cor ?? undefined }}>
      <div className="tarefa-linha">
        <input
          type="checkbox"
          className="marcar"
          checked={concluida}
          aria-label={concluida ? t("agenda.reabrir") : t("agenda.concluir")}
          onChange={() => alterar(() => repoTarefas.concluir(banco, tarefa.id, !concluida))}
        />
        <button type="button" className="tarefa-resumo" onClick={() => setAberta(!aberta)} aria-expanded={aberta}>
          <span className="tarefa-titulo">
            {tarefa.prioridade === "alta" && !concluida && <span className="prioridade-alta" title={t("agenda.prioridades.alta")}>!</span>}
            {tarefa.titulo}
          </span>
          <span className="pequeno suave">
            {[
              t(`agenda.tipos.${tarefa.tipo}`),
              disciplina?.nome,
              tarefa.prazo ? formatarDataEmail(tarefa.prazo, true) : null,
              subtarefas.length > 0 ? t("agenda.subtarefasFeitas", { feitas, total: subtarefas.length }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
      </div>

      {aberta && (
        <div className="tarefa-detalhes">
          {tarefa.descricao && <p className="pequeno tarefa-descricao">{tarefa.descricao}</p>}
          <ul className="subtarefas">
            {subtarefas.map((s) => (
              <li key={s.id}>
                <label>
                  <input type="checkbox" checked={s.concluida} onChange={() => alterar(() => repoSubtarefas.marcar(banco, s.id, !s.concluida))} />
                  <span className={s.concluida ? "riscado" : ""}>{s.titulo}</span>
                </label>
                <button
                  type="button"
                  className="botao-icone"
                  aria-label={t("comum.remover")}
                  onClick={() => alterar(() => repoSubtarefas.excluir(banco, s.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form className="nova-subtarefa" onSubmit={adicionarSub}>
            <input value={novaSub} onChange={(e) => setNovaSub(e.target.value)} placeholder={t("agenda.novaSubtarefa")} />
            <button type="submit" className="botao" disabled={!novaSub.trim()}>
              {t("comum.adicionar")}
            </button>
          </form>
          <div className="acoes">
            {tarefa.url && (
              <button type="button" className="botao" onClick={() => abrirNoNavegador(tarefa.url!)}>
                {t("agenda.abrirMoodle")}
              </button>
            )}
            <button type="button" className="botao" onClick={() => setEditando(true)}>
              {t("comum.editar")}
            </button>
            <button
              type="button"
              className="botao perigo"
              onClick={() => {
                if (window.confirm(t("agenda.confirmarExcluir", { titulo: tarefa.titulo }))) {
                  void alterar(() => repoTarefas.excluir(banco, tarefa.id));
                }
              }}
            >
              {t("comum.excluir")}
            </button>
          </div>
          {tarefa.origem === "moodle" && <p className="pequeno suave">{t("agenda.veioDoMoodle")}</p>}
        </div>
      )}
    </li>
  );
}

/** Data e hora locais de um prazo ISO, para os campos do formulário. */
function separarPrazo(prazo: string | null): { data: string; hora: string } {
  if (!prazo) return { data: "", hora: "23:59" };
  const d = new Date(prazo);
  return { data: paraDataIso(d), hora: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
}

function FormTarefa({
  tarefa,
  disciplinas,
  aoSalvar,
  aoCancelar,
}: {
  tarefa?: Tarefa;
  disciplinas: Disciplina[];
  aoSalvar: (dados: DadosTarefa) => Promise<void>;
  aoCancelar: () => void;
}) {
  const { t } = useTranslation();
  const inicial = separarPrazo(tarefa?.prazo ?? null);
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [tipo, setTipo] = useState<TipoTarefa>(tarefa?.tipo ?? "trabalho");
  const [disciplinaId, setDisciplinaId] = useState(tarefa?.disciplinaId ?? "");
  const [data, setData] = useState(inicial.data);
  const [hora, setHora] = useState(inicial.hora);
  const [prioridade, setPrioridade] = useState<Prioridade>(tarefa?.prioridade ?? "media");
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? "");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await aoSalvar({
      titulo: titulo.trim(),
      tipo,
      disciplinaId: disciplinaId || null,
      // Data e hora no fuso local, guardadas em ISO (UTC).
      prazo: data ? new Date(`${data}T${hora || "23:59"}`).toISOString() : null,
      prioridade,
      descricao: descricao.trim() || null,
    });
  }

  return (
    <section className="cartao">
      <h2>{tarefa ? t("agenda.editar") : t("agenda.nova")}</h2>
      <form className="formulario" onSubmit={enviar}>
        <label>
          {t("agenda.campos.titulo")}
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={t("agenda.campos.tituloDica")} required autoFocus />
        </label>
        <div className="linha">
          <label>
            {t("agenda.campos.tipo")}
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoTarefa)}>
              {TIPOS.map((x) => (
                <option key={x} value={x}>
                  {t(`agenda.tipos.${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="largo">
            {t("agenda.campos.disciplina")}
            <select value={disciplinaId} onChange={(e) => setDisciplinaId(e.target.value)}>
              <option value="">{t("agenda.semDisciplina")}</option>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="linha">
          <label>
            {t("agenda.campos.data")}
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label>
            {t("agenda.campos.hora")}
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} disabled={!data} />
          </label>
          <label>
            {t("agenda.campos.prioridade")}
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {t(`agenda.prioridades.${p}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span>
            {t("agenda.campos.descricao")} <span className="suave">({t("comum.opcional")})</span>
          </span>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
        </label>
        <div className="acoes">
          <button type="submit" className="botao primario">
            {t("comum.salvar")}
          </button>
          <button type="button" className="botao" onClick={aoCancelar}>
            {t("comum.cancelar")}
          </button>
        </div>
      </form>
    </section>
  );
}
