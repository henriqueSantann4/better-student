import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  agruparTarefas,
  hojeIso,
  lerFrase,
  ORDEM_GRUPOS,
  paraDataIso,
  prazoDaFrase,
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
import { abrirNoNavegador } from "../moodle/api";
import { useSincronizacao } from "../sincronizacao";
import { diaDoPrazo, EscolherCalendario, eventosDoPeriodo, ItemEvento, MiniCalendario, nomeMes } from "./Calendario";

const TIPOS: TipoTarefa[] = ["prova", "trabalho", "lista", "apresentacao", "atividade_moodle", "outro"];
const PRIORIDADES: Prioridade[] = ["baixa", "media", "alta"];

/** "2026-12-03" → "quinta-feira, 3 de dezembro". */
function nomeDoDia(dia: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${dia}T12:00`));
}

/**
 * Agenda: provas, trabalhos, listas, atividades do Moodle e o calendário
 * acadêmico num lugar só. À esquerda, um mês por vez (com setas); à direita,
 * as tarefas agrupadas pelo prazo e os eventos do mês. Clicar num dia mostra
 * só aquele dia.
 */
export function Agenda() {
  const { t } = useTranslation();
  const { banco, acao, disciplinas, eventos } = useSemestre();
  const { versao } = useSincronizacao();
  const [lista, setLista] = useState<Tarefa[]>([]);
  const [subs, setSubs] = useState<Subtarefa[]>([]);
  // Rascunho aberto no formulário completo ("Mais opções"); null = fechado.
  const [rascunho, setRascunho] = useState<Partial<Tarefa> | null>(null);
  const hoje = hojeIso();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [dia, setDia] = useState<string | null>(null);
  const [escolhendoCalendario, setEscolhendoCalendario] = useState(false);

  const recarregar = useCallback(async () => {
    const [t, s] = await Promise.all([repoTarefas.listar(banco), repoSubtarefas.listar(banco)]);
    setLista(t);
    setSubs(s);
  }, [banco]);

  // Lê de novo quando a atualização (SUAP, Moodle) grava tarefas novas.
  useEffect(() => {
    void recarregar();
  }, [recarregar, versao]);

  /** Roda uma alteração (com o aviso de erro do app) e recarrega a lista. */
  const alterar = useCallback(
    async (mudanca: () => Promise<unknown>) => {
      const ok = await acao(mudanca);
      await recarregar();
      return ok;
    },
    [acao, recarregar],
  );

  const grupos = agruparTarefas(lista);
  const porDisciplina = new Map(disciplinas.map((d) => [d.id, d]));
  const pendentes = lista.length - grupos.concluidas.length;
  const item = (tarefa: Tarefa) => (
    <ItemTarefa
      key={tarefa.id}
      tarefa={tarefa}
      disciplina={tarefa.disciplinaId ? (porDisciplina.get(tarefa.disciplinaId) ?? null) : null}
      subtarefas={subs.filter((s) => s.tarefaId === tarefa.id)}
      disciplinas={disciplinas}
      alterar={alterar}
    />
  );

  const fimDoMes = `${mes}-31`;
  const eventosDoMes = eventosDoPeriodo(eventos, `${mes}-01`, fimDoMes).filter((e) => e.tipo !== "outro");

  return (
    <>
      <header className="cabecalho">
        <h1>{t("agenda.titulo")}</h1>
        <span className="suave">{t("agenda.pendentes", { count: pendentes })}</span>
        {eventos.length > 0 && !escolhendoCalendario && (
          <button type="button" className="botao empurrar-direita" onClick={() => setEscolhendoCalendario(true)}>
            {t("calendario.trocar")}
          </button>
        )}
      </header>

      {escolhendoCalendario && <EscolherCalendario aoTerminar={() => setEscolhendoCalendario(false)} />}

      {!rascunho && (
        <EntradaRapida
          aoCriar={(dados) => alterar(() => repoTarefas.criar(banco, dados))}
          aoMaisOpcoes={(dados) => setRascunho(dados)}
        />
      )}

      {rascunho && (
        <FormTarefa
          tarefa={rascunho}
          disciplinas={disciplinas}
          aoSalvar={async (dados) => {
            const ok = await alterar(() => repoTarefas.criar(banco, dados));
            if (ok) setRascunho(null);
          }}
          aoCancelar={() => setRascunho(null)}
        />
      )}

      <div className="agenda-layout">
        <div className="agenda-lado">
          <MiniCalendario mes={mes} aoMudarMes={setMes} tarefas={lista} diaEscolhido={dia} aoEscolherDia={setDia} />
          {eventos.length === 0 && !escolhendoCalendario && (
            <section className="cartao">
              <p className="pequeno suave">{t("calendario.semCalendario")}</p>
              <button type="button" className="botao" onClick={() => setEscolhendoCalendario(true)}>
                {t("calendario.escolher")}
              </button>
            </section>
          )}
        </div>

        <div className="agenda-lista">
          {dia ? (
            <DoDia dia={dia} tarefas={lista} item={item} aoFechar={() => setDia(null)} />
          ) : (
            <>
              {lista.length === 0 && !rascunho && <p className="cartao suave">{t("agenda.vazia")}</p>}

              {ORDEM_GRUPOS.filter((g) => g !== "concluidas" && grupos[g].length > 0).map((g) => (
                <section key={g} className={`cartao grupo-agenda grupo-${g}`}>
                  <h2>
                    {t(`agenda.grupos.${g}`)} <span className="contagem">{grupos[g].length}</span>
                  </h2>
                  <ul className="lista">{grupos[g].map(item)}</ul>
                </section>
              ))}

              {eventosDoMes.length > 0 && (
                <section className="cartao">
                  <h2>{t("agenda.calendarioDoMes", { mes: nomeMes(mes) })}</h2>
                  <ul className="lista">
                    {eventosDoMes.map((e) => (
                      <ItemEvento key={e.id} evento={e} passado={e.dataFim < hoje} />
                    ))}
                  </ul>
                </section>
              )}

              {grupos.concluidas.length > 0 && (
                <details className="cartao">
                  <summary>
                    <strong>{t("agenda.grupos.concluidas")}</strong> <span className="contagem">{grupos.concluidas.length}</span>
                  </summary>
                  <ul className="lista">{grupos.concluidas.map(item)}</ul>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Só um dia: as tarefas com prazo nele (as feitas, apagadas) e os eventos do calendário. */
function DoDia({
  dia,
  tarefas,
  item,
  aoFechar,
}: {
  dia: string;
  tarefas: Tarefa[];
  item: (tarefa: Tarefa) => ReactNode;
  aoFechar: () => void;
}) {
  const { t } = useTranslation();
  const { eventos } = useSemestre();
  const doDia = tarefas.filter((x) => x.prazo && diaDoPrazo(x) === dia);
  const eventosDoDia = eventosDoPeriodo(eventos, dia, dia);
  return (
    <section className="cartao">
      <div className="resumo-topo">
        <h2 className="primeira-maiuscula">{nomeDoDia(dia)}</h2>
        <button type="button" className="botao-icone" onClick={aoFechar} aria-label={t("comum.fechar")}>
          ×
        </button>
      </div>
      {doDia.length === 0 && eventosDoDia.length === 0 && <p className="suave">{t("agenda.diaVazio")}</p>}
      {doDia.length > 0 && <ul className="lista">{doDia.map(item)}</ul>}
      {eventosDoDia.length > 0 && (
        <ul className="lista">
          {eventosDoDia.map((e) => (
            <ItemEvento key={e.id} evento={e} passado={e.dataFim < hojeIso()} />
          ))}
        </ul>
      )}
    </section>
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
              tarefa.suapChave ? t("agenda.doSuap") : null,
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
          {tarefa.suapChave && (
            <p className="pequeno suave">
              {tarefa.origem === "suap" ? t("agenda.veioDoSuap") : t("agenda.ligadaAoSuap")}
            </p>
          )}
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
  /** Tarefa existente (editar) ou rascunho vindo da frase (criar). */
  tarefa?: Partial<Tarefa>;
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
      <h2>{tarefa?.id ? t("agenda.editar") : t("agenda.nova")}</h2>
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

/**
 * Campo único: o usuário escreve "prova de POO quinta 19h" e o leitor de
 * frases (shared/regras/frase.ts, sem IA) preenche o resto. A prévia mostra
 * o que foi entendido e marca o que veio da grade.
 */
function EntradaRapida({
  aoCriar,
  aoMaisOpcoes,
}: {
  aoCriar: (dados: DadosTarefa) => Promise<boolean>;
  aoMaisOpcoes: (rascunho: Partial<Tarefa>) => void;
}) {
  const { t } = useTranslation();
  const { disciplinas, horarios, eventos } = useSemestre();
  const [frase, setFrase] = useState("");
  // Escolha do usuário quando a frase deixa dúvida (vence a dedução).
  const [escolhida, setEscolhida] = useState<string | null>(null);

  const lida = frase.trim() ? lerFrase(frase, { agora: new Date(), disciplinas, horarios, eventos }) : null;
  const disciplinaId = escolhida ?? lida?.disciplinaId ?? null;
  const nomeDe = (id: string) => disciplinas.find((d) => d.id === id)?.nome ?? "";

  function dados(): DadosTarefa | null {
    if (!lida) return null;
    return {
      titulo: lida.titulo,
      tipo: lida.tipo,
      disciplinaId,
      prazo: prazoDaFrase(lida),
      // Prova já nasce com prioridade alta.
      prioridade: lida.tipo === "prova" ? "alta" : "media",
    };
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    const d = dados();
    if (!d) return;
    if (await aoCriar(d)) {
      setFrase("");
      setEscolhida(null);
    }
  }

  const daGrade = <span className="da-grade">{t("agenda.frase.daGrade")}</span>;

  return (
    <form className="cartao entrada-rapida" onSubmit={criar}>
      <div className="linha">
        <input
          className="campo-frase"
          value={frase}
          onChange={(e) => {
            setFrase(e.target.value);
            setEscolhida(null);
          }}
          placeholder={t("agenda.frase.dica")}
          aria-label={t("agenda.nova")}
        />
        <button type="submit" className="botao primario" disabled={!lida}>
          {t("comum.adicionar")}
        </button>
        <button
          type="button"
          className="botao"
          onClick={() => {
            const d = dados();
            aoMaisOpcoes(d ? { ...d, prazo: d.prazo ?? null } : {});
          }}
        >
          {t("agenda.frase.maisOpcoes")}
        </button>
      </div>

      {lida && (
        <div className="previa-frase pequeno">
          <span className="chip">
            {t(`agenda.tipos.${lida.tipo}`)}
          </span>
          {disciplinaId ? (
            <span className="chip">
              {nomeDe(disciplinaId)} {lida.disciplinaOrigem === "grade" && !escolhida && daGrade}
            </span>
          ) : lida.opcoesDisciplina.length > 0 ? (
            <span className="opcoes-disciplina">
              {t("agenda.frase.qualDisciplina")}
              {lida.opcoesDisciplina.map((id) => (
                <button key={id} type="button" className="botao pequeno" onClick={() => setEscolhida(id)}>
                  {nomeDe(id)}
                </button>
              ))}
            </span>
          ) : (
            <span className="chip vazio">{t("agenda.semDisciplina")}</span>
          )}
          {lida.data ? (
            <span className="chip">
              {formatarDataEmail(prazoDaFrase(lida)!, true)} {(lida.dataOrigem === "grade" || lida.horaOrigem === "grade") && daGrade}
            </span>
          ) : (
            <span className="chip vazio">{t("agenda.frase.semData")}</span>
          )}
          {lida.avisos
            .filter((a) => a !== "variasAulasNoDia" && a !== "variasDisciplinas")
            .map((a) => (
              <span key={a} className="aviso-frase">
                {t(`agenda.frase.avisos.${a}`)}
              </span>
            ))}
        </div>
      )}
    </form>
  );
}
