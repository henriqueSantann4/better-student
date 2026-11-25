import { useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  aplicarImportacao,
  ErroBoletim,
  lerBoletimSuap,
  periodoConfere,
  planejarImportacao,
  type BoletimSuap,
  type ResultadoImportacao,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { CORES } from "../cores";
import { formatarDataHora, formatarNota } from "../formatos";

/**
 * Importa o boletim do SUAP, de duas formas:
 *  - abrindo a página salva (Ctrl+S → "Página da Web, somente HTML");
 *  - colando a página copiada (Ctrl+A, Ctrl+C no navegador). Ao copiar, o
 *    navegador guarda também a versão HTML, e é ela que o app lê.
 * Antes de gravar, mostra o que vai acontecer com cada disciplina.
 */
export function ImportarSuap({ aoFechar }: { aoFechar: () => void }) {
  const { t } = useTranslation();
  const { banco, acao, semestre, disciplinas } = useSemestre();
  const [boletim, setBoletim] = useState<BoletimSuap | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  function ler(html: string) {
    setResultado(null);
    try {
      setBoletim(lerBoletimSuap(html));
      setAviso(null);
    } catch (erro) {
      setBoletim(null);
      setAviso(erro instanceof ErroBoletim ? t(`importar.erro.${erro.motivo}`) : String(erro));
    }
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

  const plano = boletim ? planejarImportacao(boletim, disciplinas) : [];
  const confere = boletim ? periodoConfere(boletim, semestre) : null;

  async function importar() {
    if (!boletim) return;
    // As cores novas continuam o rodízio a partir das disciplinas que já existem.
    const cores = [...CORES.slice(disciplinas.length % CORES.length), ...CORES];
    const saida: { resultado?: ResultadoImportacao } = {};
    const ok = await acao(async () => {
      saida.resultado = await aplicarImportacao(banco, semestre.id, boletim, plano, cores);
    });
    if (ok && saida.resultado) {
      setResultado(saida.resultado);
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

      {resultado ? (
        <p className="sucesso">
          {t("importar.concluido", { criadas: resultado.criadas, atualizadas: resultado.atualizadas })}
          {resultado.ignoradas.length > 0 && ` ${t("importar.ignoradas", { nomes: resultado.ignoradas.join(", ") })}`}
        </p>
      ) : (
        <ol className="passos pequeno">
          <li>{t("importar.passo1")}</li>
          <li>{t("importar.passo2")}</li>
        </ol>
      )}

      {!boletim && (
        <div className="linha importar-entradas">
          <label className="botao primario">
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
      )}

      {aviso && <p className="aviso">{aviso}</p>}

      {boletim && (
        <>
          <p className="pequeno suave">
            {boletim.periodo && t("importar.periodo", { periodo: `${boletim.periodo.ano}/${boletim.periodo.periodo}` })}
            {boletim.atualizadoEm && ` · ${t("importar.atualizadoSuap", { data: formatarDataHora(boletim.atualizadoEm) })}`}
          </p>
          {confere === false && (
            <p className="aviso">{t("importar.periodoDiferente", { semestre: semestre.nome })}</p>
          )}
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
          <div className="acoes">
            <button type="button" className="botao primario" onClick={importar}>
              {t("importar.confirmar", { count: plano.length })}
            </button>
            <button type="button" className="botao" onClick={() => setBoletim(null)}>
              {t("comum.cancelar")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
