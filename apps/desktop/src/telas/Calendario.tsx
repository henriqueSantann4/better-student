import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  calendario as repoCalendario,
  ErroPacote,
  hojeIso,
  lerPacoteCalendario,
  periodoDoNome,
  proximosEventos,
  semestreDoPacote,
  type EventoCalendario,
  type PacoteCalendario,
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

export function Calendario() {
  const { t } = useTranslation();
  const { semestre, eventos } = useSemestre();
  const [escolhendo, setEscolhendo] = useState(false);
  const hoje = hojeIso();
  const mostrarEscolha = escolhendo || eventos.length === 0;

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
        {eventos.length > 0 && !escolhendo && (
          <button type="button" className="botao empurrar-direita" onClick={() => setEscolhendo(true)}>
            {t("calendario.trocar")}
          </button>
        )}
      </header>

      {mostrarEscolha && <EscolherCalendario aoTerminar={() => setEscolhendo(false)} />}

      {eventos.length > 0 && (
        <>
          <section className="cartao">
            <h2>{t("calendario.proximos")}</h2>
            <ul className="lista">
              {proximosEventos(eventos, hoje).map((e) => (
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
                    <ItemEvento key={e.id} evento={e} passado={e.dataFim < hoje} />
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

  async function aplicar(pacote: PacoteCalendario) {
    const dados = periodo ? semestreDoPacote(pacote, periodo) : null;
    if (!dados) {
      setAviso(t("calendario.semPeriodo", { semestre: semestre.nome }));
      return;
    }
    const ok = await acao(() => repoCalendario.aplicarPacote(banco, semestre, pacote.id, dados));
    if (ok) aoTerminar();
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
