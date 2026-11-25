import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
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
  proximosEventos,
  semestreDoPacote,
  type EventoCalendario,
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
function nomeMes(mes: string): string {
  const nome = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(new Date(`${mes}-15T12:00`));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

type Visao = "mes" | "lista";
const CHAVE_VISAO = "better-student:visao-calendario";

/** A visão escolhida fica salva neste computador (é só uma preferência de tela). */
function visaoSalva(): Visao {
  try {
    return localStorage.getItem(CHAVE_VISAO) === "lista" ? "lista" : "mes";
  } catch {
    return "mes";
  }
}

export function Calendario() {
  const { t } = useTranslation();
  const { semestre, eventos } = useSemestre();
  const [escolhendo, setEscolhendo] = useState(false);
  const [visao, setVisao] = useState<Visao>(visaoSalva);
  const hoje = hojeIso();
  const mostrarEscolha = escolhendo || eventos.length === 0;

  function trocarVisao(nova: Visao) {
    setVisao(nova);
    try {
      localStorage.setItem(CHAVE_VISAO, nova);
    } catch {
      // Sem armazenamento: a escolha vale só até fechar o app.
    }
  }

  // Agrupa por mês, na ordem.
  const porMes = new Map<string, EventoCalendario[]>();
  for (const e of eventos) {
    const mes = e.dataInicio.slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), e]);
  }

  return (
    <>
      <header className="cabecalho">
        <h1>{t("calendario.titulo")}</h1>
        <span className="suave">{semestre.nome}</span>
        {eventos.length > 0 && (
          <div className="alternador empurrar-direita" role="group" aria-label={t("calendario.visao")}>
            {(["mes", "lista"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={visao === v ? "ativo" : ""}
                aria-pressed={visao === v}
                onClick={() => trocarVisao(v)}
              >
                {t(`calendario.visoes.${v}`)}
              </button>
            ))}
          </div>
        )}
        {eventos.length > 0 && !escolhendo && (
          <button type="button" className="botao" onClick={() => setEscolhendo(true)}>
            {t("calendario.trocar")}
          </button>
        )}
      </header>

      {mostrarEscolha && <EscolherCalendario aoTerminar={() => setEscolhendo(false)} />}

      {eventos.length > 0 && visao === "mes" && <VisaoMes />}

      {eventos.length > 0 && visao === "lista" && (
        <>
          <section className="cartao">
            <h2>{t("calendario.proximos")}</h2>
            <ul className="lista">
              {/* Reuniões e prazos internos (tipo "outro") não interessam aos alunos aqui. */}
              {proximosEventos(eventos.filter((e) => e.tipo !== "outro"), hoje).map((e) => (
                <ItemEvento key={e.id} evento={e} />
              ))}
            </ul>
          </section>
          <section className="cartao">
            <h2>{t("calendario.semestreTodo")}</h2>
            {[...porMes].map(([mes, doMes]) => (
              <div key={mes} className="mes">
                <h3 className="mes-nome">{nomeMes(mes)}</h3>
                <ul className="lista">
                  {doMes.map((e) => (
                    <ItemEvento key={e.id} evento={e} passado={e.dataFim < hoje || e.tipo === "outro"} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

/** Meses do semestre, de início a fim (ex.: ["2026-07", ..., "2026-12"]). */
function mesesEntre(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  const atual = new Date(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)) - 1, 1);
  const ultimo = fim.slice(0, 7);
  while (paraDataIso(atual).slice(0, 7) <= ultimo) {
    meses.push(paraDataIso(atual).slice(0, 7));
    atual.setMonth(atual.getMonth() + 1);
  }
  return meses;
}

const DIAS_CABECALHO = [0, 1, 2, 3, 4, 5, 6] as const;
const LEGENDA = ["letivo", "sem_aula", "sabado_letivo", "prova_final", "fechamento"] as const;

/**
 * Visão de mês, como a página do SUAP: a grade do mês com os dias pintados
 * pela legenda e, ao lado, os eventos daquele mês. Abre já no mês atual.
 */
function VisaoMes() {
  const { t } = useTranslation();
  const { semestre, eventos } = useSemestre();
  const hoje = hojeIso();
  const mesAtual = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mesAtual.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <>
      <div className="legenda-calendario pequeno" aria-hidden="true">
        {LEGENDA.map((tipo) => (
          <span key={tipo}>
            <i className={`amostra dia-${tipo}`} />
            {t(`calendario.legenda.${tipo}`)}
          </span>
        ))}
        <span>
          <i className="amostra dia-hoje" />
          {t("calendario.legenda.hoje")}
        </span>
      </div>
      {mesesEntre(semestre.inicio, semestre.fim).map((mes) => {
        const primeiro = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1);
        const diasNoMes = new Date(primeiro.getFullYear(), primeiro.getMonth() + 1, 0).getDate();
        const celulas: (string | null)[] = [
          ...Array.from({ length: primeiro.getDay() }, () => null),
          ...Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`),
        ];
        const semanas = Array.from({ length: Math.ceil(celulas.length / 7) }, (_, s) => celulas.slice(s * 7, s * 7 + 7));
        const doMes = eventos.filter((e) => e.dataInicio.slice(0, 7) <= mes && e.dataFim.slice(0, 7) >= mes);

        return (
          <section key={mes} className="cartao mes-cartao" ref={mes === hoje.slice(0, 7) ? mesAtual : undefined}>
            <div>
              <h2>{nomeMes(mes)}</h2>
              <table className="grade-mes">
                <thead>
                  <tr>
                    {DIAS_CABECALHO.map((d) => (
                      <th key={d} scope="col">
                        {nomeDia(d, "short").replace(".", "")}
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
                        return (
                          <td
                            key={data}
                            className={`dia-${marcacao.tipo}${data === hoje ? " dia-hoje" : ""}`}
                            title={marcacao.eventos.map((e) => e.titulo).join(" · ") || undefined}
                          >
                            <span>{Number(data.slice(8))}</span>
                            {marcacao.eventos.length > 0 && <i className="ponto" />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="lista mes-eventos">
              {doMes.length === 0 && <li className="pequeno suave">{t("calendario.semEventos")}</li>}
              {doMes.map((e) => (
                <ItemEvento key={e.id} evento={e} passado={e.dataFim < hoje || e.tipo === "outro"} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function ItemEvento({ evento, passado = false }: { evento: EventoCalendario; passado?: boolean }) {
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
function EscolherCalendario({ aoTerminar }: { aoTerminar: () => void }) {
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
