import { useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  calendario as repoCalendario,
  ErroCalendarioSuap,
  ErroPacote,
  hojeIso,
  lerCalendarioSuap,
  lerPacoteCalendario,
  marcarDia,
  paraDataIso,
  periodoDoNome,
  semestreDoPacote,
  type EventoCalendario,
  type Tarefa,
  type PacoteCalendario,
  type SemestrePacote,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import i18n from "../i18n";
import { formatarData, formatarDataCompleta, nomeDia } from "../formatos";

/**
 * Pacotes de calendário que já vêm com o app: os arquivos JSON da pasta
 * packages/shared/calendarios/. O Vite junta todos no build. Para incluir
 * outro campus, basta adicionar um arquivo lá.
 */
const EMBUTIDOS: PacoteCalendario[] = Object.values(
  import.meta.glob<unknown>("../../../../packages/shared/calendarios/*.json", { eager: true, import: "default" }),
).map((dados) => lerPacoteCalendario(dados));

/** "2026-08" → "Agosto de 2026" (só a primeira letra maiúscula). */
export function nomeMes(mes: string): string {
  const nome = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(new Date(`${mes}-15T12:00`));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** "2026-08" → o mês seguinte (ou anterior, com `passo` -1). */
function somarMes(mes: string, passo: number): string {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + passo, 1);
  return paraDataIso(d).slice(0, 7);
}

const DIAS_CABECALHO = [0, 1, 2, 3, 4, 5, 6] as const;
const LEGENDA = ["letivo", "sem_aula", "sabado_letivo", "prova_final", "fechamento"] as const;

/** Data local (YYYY-MM-DD) do prazo de uma tarefa. */
export const diaDoPrazo = (t: Tarefa) => paraDataIso(new Date(t.prazo!));

/**
 * Um mês por vez, pequeno, com setas (como o calendário do Windows): os dias
 * pintados pelo calendário acadêmico, um ponto nos dias com evento e uma
 * marca nos dias com prova ou entrega. Clicar num dia filtra a lista ao lado.
 */
export function MiniCalendario({
  mes,
  aoMudarMes,
  tarefas,
  diaEscolhido,
  aoEscolherDia,
}: {
  /** "2026-11" */
  mes: string;
  aoMudarMes: (mes: string) => void;
  tarefas: Tarefa[];
  diaEscolhido: string | null;
  aoEscolherDia: (dia: string | null) => void;
}) {
  const { t } = useTranslation();
  const { semestre, eventos } = useSemestre();
  const hoje = hojeIso();

  const primeiro = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1);
  const diasNoMes = new Date(primeiro.getFullYear(), primeiro.getMonth() + 1, 0).getDate();
  const celulas: (string | null)[] = [
    ...Array.from({ length: primeiro.getDay() }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`),
  ];
  const semanas = Array.from({ length: Math.ceil(celulas.length / 7) }, (_, s) => celulas.slice(s * 7, s * 7 + 7));

  return (
    <section className="cartao mini-calendario">
      <div className="mini-topo">
        <button type="button" className="botao-icone" onClick={() => aoMudarMes(somarMes(mes, -1))} aria-label={t("calendario.mesAnterior")}>
          ‹
        </button>
        <h2>{nomeMes(mes)}</h2>
        <button type="button" className="botao-icone" onClick={() => aoMudarMes(somarMes(mes, 1))} aria-label={t("calendario.mesSeguinte")}>
          ›
        </button>
      </div>
      <table className="grade-mes">
        <thead>
          <tr>
            {DIAS_CABECALHO.map((d) => (
              <th key={d} scope="col">
                {nomeDia(d, "short").replace(".", "").slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana, s) => (
            <tr key={s}>
              {semana.map((data, i) => {
                if (!data) return <td key={`vazio-${i}`} />;
                const marcacao = marcarDia(data, eventos, semestre);
                const doDia = tarefas.filter((x) => x.prazo && diaDoPrazo(x) === data);
                const pendentes = doDia.filter((x) => !x.concluidaEm);
                const temProva = pendentes.some((x) => x.tipo === "prova");
                const titulos = [...marcacao.eventos.map((e) => e.titulo), ...doDia.map((x) => x.titulo)];
                const escolhido = data === diaEscolhido;
                return (
                  <td
                    key={data}
                    className={`dia-${marcacao.tipo}${data === hoje ? " dia-hoje" : ""}${escolhido ? " dia-escolhido" : ""}`}
                    title={titulos.join(" · ") || undefined}
                  >
                    <button type="button" onClick={() => aoEscolherDia(escolhido ? null : data)} aria-pressed={escolhido}>
                      {Number(data.slice(8))}
                    </button>
                    {marcacao.eventos.length > 0 && <i className="ponto" />}
                    {doDia.length > 0 && <i className={`marca-tarefa ${temProva ? "prova" : ""} ${pendentes.length === 0 ? "feita" : ""}`} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mini-acoes">
        {mes !== hoje.slice(0, 7) && (
          <button type="button" className="botao pequeno primeira-maiuscula" onClick={() => (aoMudarMes(hoje.slice(0, 7)), aoEscolherDia(null))}>
            {t("comum.hoje")}
          </button>
        )}
      </div>
      <div className="legenda-calendario pequeno" aria-hidden="true">
        {LEGENDA.map((tipo) => (
          <span key={tipo}>
            <i className={`amostra dia-${tipo}`} />
            {t(`calendario.legenda.${tipo}`)}
          </span>
        ))}
        <span>
          <i className="amostra amostra-tarefa" />
          {t("calendario.legenda.tarefa")}
        </span>
      </div>
    </section>
  );
}

/** Eventos do calendário acadêmico que tocam um mês (ou um dia). */
export function eventosDoPeriodo(eventos: readonly EventoCalendario[], de: string, ate: string): EventoCalendario[] {
  return eventos.filter((e) => e.excluidoEm === null && e.dataInicio <= ate && e.dataFim >= de);
}

export function ItemEvento({ evento, passado = false }: { evento: EventoCalendario; passado?: boolean }) {
  const { t } = useTranslation();
  const datas =
    evento.dataInicio === evento.dataFim
      ? formatarData(evento.dataInicio)
      : `${formatarData(evento.dataInicio)} – ${formatarData(evento.dataFim)}`;
  return (
    <li className={`item ${passado ? "passado" : ""}`}>
      <span className={`etiqueta tipo-${evento.tipo}`}>{t(`calendario.tipo.${evento.tipo}`)}</span>
      <div className="item-texto">
        <strong>{evento.titulo}</strong>
        <span className="pequeno suave">
          {datas}
          {evento.segueDiaSemana !== null && ` · ${t("calendario.segue", { dia: nomeDia(evento.segueDiaSemana).toLocaleLowerCase(i18n.language) })}`}
        </span>
      </div>
    </li>
  );
}

/** Escolhe um pacote (embutido ou de um arquivo) e aplica o semestre certo dele. */
export function EscolherCalendario({ aoTerminar }: { aoTerminar: () => void }) {
  const { t } = useTranslation();
  const { banco, acao, semestre, eventos } = useSemestre();
  const [aviso, setAviso] = useState<string | null>(null);
  const periodo = periodoDoNome(semestre.nome);

  async function aplicarSemestre(origem: string, dados: SemestrePacote) {
    const doPacote = periodoDoNome(dados.periodo);
    if (!periodo || !doPacote || doPacote.ano !== periodo.ano || doPacote.periodo !== periodo.periodo) {
      setAviso(t("calendario.outroPeriodo", { periodo: dados.periodo, semestre: semestre.nome }));
      return;
    }
    const ok = await acao(() => repoCalendario.aplicarPacote(banco, semestre, origem, dados));
    if (ok) aoTerminar();
  }

  async function aplicar(pacote: PacoteCalendario) {
    const dados = periodo ? semestreDoPacote(pacote, periodo) : null;
    if (!dados) {
      setAviso(t("calendario.semPeriodo", { semestre: semestre.nome }));
      return;
    }
    await aplicarSemestre(pacote.id, dados);
  }

  /** Página do calendário do SUAP, salva (Ctrl+S) ou colada (Ctrl+V). */
  async function lerDoSuap(html: string) {
    try {
      await aplicarSemestre("suap", lerCalendarioSuap(html));
    } catch (erro) {
      setAviso(erro instanceof ErroCalendarioSuap ? t("calendario.suapInvalido") : String(erro));
    }
  }

  async function abrirPaginaSuap(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (arquivo) await lerDoSuap(await arquivo.text());
  }

  function colarPaginaSuap(e: ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    if (html) void lerDoSuap(html);
    else setAviso(t("importar.erro.semHtml"));
  }

  async function abrirArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      await aplicar(lerPacoteCalendario(JSON.parse(await arquivo.text())));
    } catch (erro) {
      setAviso(erro instanceof ErroPacote || erro instanceof SyntaxError ? t("calendario.arquivoInvalido") : String(erro));
    }
  }

  return (
    <section className="cartao">
      <div className="resumo-topo">
        <h2>{t("calendario.escolher")}</h2>
        {eventos.length > 0 && (
          <button type="button" className="botao-icone" onClick={aoTerminar} aria-label={t("comum.fechar")}>
            ×
          </button>
        )}
      </div>
      <p className="pequeno suave">{t("calendario.explicacao")}</p>
      <h3>{t("calendario.doSuap")}</h3>
      <p className="pequeno suave">{t("calendario.doSuapDica")}</p>
      <div className="linha importar-entradas">
        <label className="botao primario">
          {t("importar.abrirArquivo")}
          <input type="file" accept=".html,.htm,text/html" onChange={abrirPaginaSuap} hidden />
        </label>
        <textarea
          className="area-colar"
          placeholder={t("importar.colarAqui")}
          onPaste={colarPaginaSuap}
          value=""
          onChange={() => undefined}
          rows={2}
        />
      </div>
      <h3 className="separador">{t("calendario.embutidos")}</h3>
      <ul className="lista">
        {EMBUTIDOS.map((p) => {
          const temPeriodo = periodo !== null && semestreDoPacote(p, periodo) !== null;
          const dados = periodo ? semestreDoPacote(p, periodo) : null;
          return (
            <li key={p.id} className="item">
              <div className="item-texto">
                <strong>{p.instituicao}</strong>
                <span className="pequeno suave">
                  {p.cursos}
                  {dados &&
                    ` · ${t("calendario.aulasDe", {
                      inicio: formatarDataCompleta(dados.inicio),
                      fim: formatarDataCompleta(dados.fim),
                    })}`}
                </span>
              </div>
              <button type="button" className="botao primario" disabled={!temPeriodo} onClick={() => aplicar(p)}>
                {temPeriodo ? t("calendario.usar") : t("calendario.semEstePeriodo")}
              </button>
            </li>
          );
        })}
      </ul>
      <label className="botao">
        {t("calendario.abrirArquivo")}
        <input type="file" accept=".json,application/json" onChange={abrirArquivo} hidden />
      </label>
      {aviso && <p className="aviso">{aviso}</p>}
    </section>
  );
}
