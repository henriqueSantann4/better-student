import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  calendarioServe as calendarioDoPeriodo,
  ErroBoletim,
  mesmoPeriodo,
  periodoConfere,
  periodoDoNome,
  planejarImportacao,
  sincronizarSuap,
  SEM_EXTRAS,
  type BoletimSuap,
  type ExtrasSuap,
  type HorariosSuap,
  type ItemImportacao,
  type ResultadoImportacao,
  type ResultadoHorarios,
} from "@better-student/shared";
import { useApp, useSemestre } from "../contexto";
import { type PacoteSuap, buscarBoletimNoSuap, gravarServidorSuap, lerPacoteSuap, lerServidorSuap, suapAutomaticoDisponivel } from "../suap";
import { CORES } from "../cores";
import { formatarDataHora, formatarNota, nomeDia } from "../formatos";

/**
 * Importa o boletim do SUAP num semestre que já existe. As peças de baixo
 * (EntradaBoletim e PreviaImportacao) também servem ao primeiro acesso,
 * quando o semestre ainda vai ser criado a partir do boletim.
 */
export function ImportarSuap({ aoFechar }: { aoFechar: () => void }) {
  const { t } = useTranslation();
  const { banco, acao, semestre, disciplinas } = useSemestre();
  const [boletim, setBoletim] = useState<BoletimSuap | null>(null);
  const [extras, setExtras] = useState<ExtrasSuap>(SEM_EXTRAS);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [resultadoHorarios, setResultadoHorarios] = useState<ResultadoHorarios | null>(null);
  // Calendário e horários só são aplicados se forem do mesmo período do semestre.
  const periodoSemestre = periodoDoNome(semestre.nome);
  const { calendario } = extras;
  const calendarioServe = calendarioDoPeriodo(calendario, semestre);
  const horarios = extras.horarios && mesmoPeriodo(extras.horarios.periodo, periodoSemestre) ? extras.horarios : null;

  const plano = boletim ? planejarImportacao(boletim, disciplinas) : [];
  const confere = boletim ? periodoConfere(boletim, semestre) : null;

  async function importar() {
    if (!boletim) return;
    const saida: { resultado?: ResultadoImportacao; horarios?: ResultadoHorarios | null } = {};
    const ok = await acao(async () => {
      // Tudo de uma vez (boletim, horários, detalhamento, calendário e provas com data).
      const r = await sincronizarSuap(banco, semestre, boletim, extras, { plano, cores: CORES });
      saida.resultado = r.importacao;
      saida.horarios = r.horarios;
    });
    if (ok && saida.resultado) {
      setResultado(saida.resultado);
      setResultadoHorarios(saida.horarios ?? null);
      setBoletim(null);
    }
  }

  return (
    <section className="cartao">
      <div className="resumo-topo">
        <h2>{t("importar.titulo")}</h2>
        <button type="button" className="botao-icone" onClick={aoFechar} aria-label={t("comum.fechar")}>
          ×
        </button>
      </div>

      {resultado && <ResultadoImportacaoTexto resultado={resultado} horarios={resultadoHorarios} />}

      {boletim ? (
        <>
          {confere === false && <p className="aviso">{t("importar.periodoDiferente", { semestre: semestre.nome })}</p>}
          <PreviaImportacao boletim={boletim} plano={plano} />
          {horarios && <PreviaHorarios horarios={horarios} />}
          {extras.detalhes.length > 0 && (
            <p className="pequeno sucesso">{t("importar.detalhesJunto", { count: extras.detalhes.length })}</p>
          )}
          {calendarioServe && <p className="pequeno sucesso">{t("importar.calendarioJunto", { periodo: calendario!.periodo })}</p>}
          <div className="acoes">
            <button type="button" className="botao primario" onClick={importar}>
              {t("importar.confirmar", { count: plano.length })}
            </button>
            <button type="button" className="botao" onClick={() => setBoletim(null)}>
              {t("comum.cancelar")}
            </button>
          </div>
        </>
      ) : (
        <EntradaBoletim
          aoLer={(b, e) => {
            setResultado(null);
            setBoletim(b);
            setExtras(e);
          }}
          comPassos={!resultado}
        />
      )}
    </section>
  );
}

export function ResultadoImportacaoTexto({
  resultado,
  horarios = null,
}: {
  resultado: ResultadoImportacao;
  horarios?: ResultadoHorarios | null;
}) {
  const { t } = useTranslation();
  return (
    <p className="sucesso">
      {t("importar.concluido", { criadas: resultado.criadas, atualizadas: resultado.atualizadas })}
      {resultado.ignoradas.length > 0 && ` ${t("importar.ignoradas", { nomes: resultado.ignoradas.join(", ") })}`}
      {horarios && ` ${t("importar.horariosGravados", { count: horarios.gravados })}`}
      {horarios &&
        horarios.semDisciplina.length > 0 &&
        ` ${t("importar.horariosSemDisciplina", { nomes: horarios.semDisciplina.join(", ") })}`}
    </p>
  );
}

/**
 * Recebe o boletim de duas formas:
 *  - abrindo a página salva (Ctrl+S → "Página da Web, somente HTML");
 *  - colando a página copiada (Ctrl+A, Ctrl+C no navegador). Ao copiar, o
 *    navegador guarda também a versão HTML, e é ela que o app lê.
 */
export function EntradaBoletim({
  aoLer,
  comPassos = true,
}: {
  /** Os extras só vêm pela busca automática (a página colada é só o boletim). */
  aoLer: (boletim: BoletimSuap, extras: ExtrasSuap) => void;
  comPassos?: boolean;
}) {
  const { t } = useTranslation();
  const { banco } = useApp();
  const [aviso, setAviso] = useState<string | null>(null);
  const [aguardando, setAguardando] = useState(false);
  const [servidor, setServidor] = useState<string | null>(null);
  const pararEspera = useRef<(() => void) | null>(null);
  const automatico = suapAutomaticoDisponivel();

  useEffect(() => {
    if (automatico) lerServidorSuap(banco).then(setServidor).catch(() => undefined);
    // Ao sair da tela, para de esperar o boletim.
    return () => pararEspera.current?.();
  }, [banco, automatico]);

  function ler(html: string, pacote?: Omit<PacoteSuap, "boletim">) {
    try {
      const { boletim, extras } = lerPacoteSuap({ boletim: html, horarios: null, calendario: null, detalhes: [], ...pacote });
      setAviso(null);
      aoLer(boletim, extras);
    } catch (erro) {
      setAviso(erro instanceof ErroBoletim ? t(`importar.erro.${erro.motivo}`) : String(erro));
    }
  }

  async function buscarNoSuap() {
    if (!servidor) return;
    setAviso(null);
    setAguardando(true);
    try {
      await gravarServidorSuap(banco, servidor);
      pararEspera.current = await buscarBoletimNoSuap(servidor, (pacote) => {
        setAguardando(false);
        ler(pacote.boletim, pacote);
      });
    } catch (erro) {
      setAguardando(false);
      setAviso(String(erro));
    }
  }

  function cancelarEspera() {
    pararEspera.current?.();
    setAguardando(false);
  }

  async function abrirArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (arquivo) ler(await arquivo.text());
  }

  function colar(e: ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    if (html) ler(html);
    else setAviso(t("importar.erro.semHtml"));
  }

  return (
    <>
      {automatico && servidor !== null && (
        <div className="automatico">
          {aguardando ? (
            <>
              <p className="pequeno">{t("importar.aguardandoSuap")}</p>
              <button type="button" className="botao" onClick={cancelarEspera}>
                {t("comum.cancelar")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="botao primario" onClick={buscarNoSuap}>
                {t("importar.buscarNoSuap")}
              </button>
              <p className="pequeno suave">{t("importar.buscarNoSuapDica")}</p>
              <details className="pequeno">
                <summary>{t("importar.outroInstituto")}</summary>
                <label className="formulario">
                  {t("importar.enderecoSuap")}
                  <input value={servidor} onChange={(e) => setServidor(e.target.value)} />
                </label>
              </details>
            </>
          )}
          <p className="pequeno suave separador">{t("importar.ouManual")}</p>
        </div>
      )}
      {comPassos && (
        <ol className="passos pequeno">
          <li>{t("importar.passo1")}</li>
          <li>{t("importar.passo2")}</li>
        </ol>
      )}
      <div className="linha importar-entradas">
        <label className={automatico ? "botao" : "botao primario"}>
          {t("importar.abrirArquivo")}
          <input type="file" accept=".html,.htm,text/html" onChange={abrirArquivo} hidden />
        </label>
        <textarea
          className="area-colar"
          placeholder={t("importar.colarAqui")}
          onPaste={colar}
          value=""
          onChange={() => undefined}
          rows={2}
        />
      </div>
      {aviso && <p className="aviso">{aviso}</p>}
    </>
  );
}

/** Tabela com o que vai acontecer com cada disciplina do boletim. */
export function PreviaImportacao({ boletim, plano }: { boletim: BoletimSuap; plano: readonly ItemImportacao[] }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="pequeno suave">
        {boletim.periodo && t("importar.periodo", { periodo: `${boletim.periodo.ano}/${boletim.periodo.periodo}` })}
        {boletim.atualizadoEm && ` · ${t("importar.atualizadoSuap", { data: formatarDataHora(boletim.atualizadoEm) })}`}
      </p>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>{t("importar.disciplina")}</th>
              <th>{t("importar.acao")}</th>
              <th className="numero">{t("importar.aulas")}</th>
              <th className="numero">{t("importar.faltas")}</th>
              <th className="numero">{t("importar.media")}</th>
            </tr>
          </thead>
          <tbody>
            {plano.map(({ suap, existente }) => (
              <tr key={suap.codigo ?? suap.nome}>
                <td>
                  {suap.nome} <span className="suave pequeno">{suap.codigo}</span>
                </td>
                <td>
                  {existente ? (
                    <span className="etiqueta">{t("importar.atualizar", { nome: existente.nome })}</span>
                  ) : (
                    <span className="etiqueta atencao">{t("importar.nova")}</span>
                  )}
                </td>
                <td className="numero">{suap.aulasPrevistas ?? "–"}</td>
                <td className="numero">{suap.faltas ?? "–"}</td>
                <td className="numero">{formatarNota(suap.mfd ?? suap.media)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pequeno suave">{t("importar.explicacao")}</p>
    </>
  );
}

/** Encontros da grade que vieram do SUAP, um por linha, na ordem da semana. */
export function PreviaHorarios({ horarios }: { horarios: HorariosSuap }) {
  const { t } = useTranslation();
  if (horarios.encontros.length === 0) return null;
  return (
    <>
      <h3>{t("importar.horariosTitulo")}</h3>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>{t("importar.dia")}</th>
              <th>{t("importar.horario")}</th>
              <th>{t("importar.disciplina")}</th>
              <th className="numero">{t("importar.aulas")}</th>
              <th>{t("importar.sala")}</th>
            </tr>
          </thead>
          <tbody>
            {horarios.encontros.map((e) => (
              <tr key={`${e.diaSemana}-${e.inicio}-${e.codigo ?? e.nome}`}>
                <td>{nomeDia(e.diaSemana)}</td>
                <td>
                  {e.inicio}–{e.fim}
                </td>
                <td>{e.nome}</td>
                <td className="numero">{e.quantidadeAulas}</td>
                <td className="suave">{e.sala ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pequeno suave">{t("importar.horariosExplicacao")}</p>
    </>
  );
}
