import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  avaliacoes as repoAvaliacoes,
  disciplinas as repoDisciplinas,
  notaDaDisciplina,
  resumirFaltas,
  tarefas as repoTarefas,
  textosRecuperacao,
  type Avaliacao,
  type Disciplina,
  type RegrasAcademicas,
  type Situacao,
  type Tarefa,
} from "@better-student/shared";
import { useSemestre } from "../contexto";
import { formatarData, formatarDataHora, formatarNota } from "../formatos";
import { ImportarSuap } from "./ImportarSuap";

/** Tipos de tarefa da Agenda que costumam valer nota. */
const TIPOS_AVALIADOS = new Set(["prova", "trabalho", "apresentacao"]);

/** Cor da etiqueta de cada situação. */
const CLASSE_SITUACAO: Record<Situacao, string> = {
  em_andamento: "neutra",
  aprovado: "",
  aprovado_ifa: "",
  ifa: "atencao",
  reprovado_nota: "reprovado",
  reprovado_ifa: "reprovado",
  reprovado_falta: "reprovado",
};

/** Lê "7,5" ou "7.5". Vazio = `null`; texto inválido = `undefined`. */
function lerNota(texto: string): number | null | undefined {
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "") return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor >= 0 ? valor : undefined;
}

export function Notas() {
  const { t } = useTranslation();
  const { banco, disciplinas } = useSemestre();
  const [importando, setImportando] = useState(false);
  // As provas e trabalhos da Agenda viram sugestões de avaliação.
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);

  useEffect(() => {
    repoTarefas.listar(banco).then(setTarefas).catch(() => setTarefas([]));
  }, [banco]);

  return (
    <>
      <header className="cabecalho">
        <h1>{t("notas.titulo")}</h1>
        {disciplinas.length > 0 && !importando && (
          <button type="button" className="botao empurrar-direita" onClick={() => setImportando(true)}>
            {t("faltas.atualizarSuap")}
          </button>
        )}
      </header>
      {importando && <ImportarSuap aoFechar={() => setImportando(false)} />}
      {disciplinas.length === 0 ? (
        <p className="cartao suave">{t("faltas.semDisciplinas")}</p>
      ) : (
        <>
          <p className="suave pequeno">{t("notas.explicacao")}</p>
          {disciplinas.map((d) => (
            <CartaoNotas key={d.id} disciplina={d} tarefas={tarefas.filter((x) => x.disciplinaId === d.id)} />
          ))}
          <p className="pequeno suave">{t("notas.regrasEmConfig")}</p>
        </>
      )}
    </>
  );
}

function CartaoNotas({ disciplina, tarefas }: { disciplina: Disciplina; tarefas: Tarefa[] }) {
  const { t } = useTranslation();
  const { banco, acao, semestre, faltas, avaliacoes, instituicao } = useSemestre();
  const recuperacao = textosRecuperacao(instituicao.perfil);
  const minhas = avaliacoes.filter((a) => a.disciplinaId === disciplina.id);
  const { reprovadoPorFalta } = resumirFaltas(
    disciplina,
    faltas.filter((f) => f.disciplinaId === disciplina.id),
    semestre,
    disciplina.suap?.faltas ?? null,
  );
  const nota = notaDaDisciplina(disciplina, minhas, semestre, reprovadoPorFalta);
  // Provas e trabalhos da Agenda que ainda não viraram avaliação.
  const sugestoes = tarefas.filter(
    (x) => TIPOS_AVALIADOS.has(x.tipo) && !minhas.some((a) => a.tarefaId === x.id),
  );
  const suap = disciplina.suap;

  return (
    <section className="cartao notas-cartao" style={{ borderTopColor: disciplina.cor ?? undefined }}>
      <div className="resumo-topo">
        <div>
          <h2>{disciplina.nome}</h2>
          {suap && (
            <p className="pequeno suave">
              {t("notas.suap")}{" "}
              {suap.etapas.map((e) => `${t("notas.etapa", { numero: e.numero })} ${formatarNota(e.nota)}`).join(" · ")}
              {suap.naf !== null && ` · ${t("notas.naf", recuperacao)} ${formatarNota(suap.naf)}`}
              {suap.mfd !== null && ` · ${t("notas.mfd")} ${formatarNota(suap.mfd)}`}
              {suap.importadoEm && ` · ${t("notas.atualizado", { data: formatarDataHora(suap.importadoEm) })}`}
            </p>
          )}
        </div>
        <span className={`etiqueta ${CLASSE_SITUACAO[nota.situacao]}`}>{t(`notas.situacao.${nota.situacao}`, recuperacao)}</span>
      </div>

      <div className="notas-media">
        <strong className="notas-numero">
          {formatarNota(nota.pontos ? arredondar(nota.pontos.garantidos) : (nota.mediaFinal ?? nota.media))}
        </strong>
        <span className="pequeno suave">
          {nota.fonte === "suap"
            ? t("notas.fonteSuap")
            : nota.fonte === "suap_parcial"
              ? t("notas.fonteSuapParcial")
              : nota.pontos
                ? t("notas.fontePontos")
                : nota.fonte === "app"
                  ? t("notas.fonteApp")
                  : t("notas.semNota")}
        </span>
      </div>
      <Orientacao disciplina={disciplina} nota={nota} regras={semestre} />

      {minhas.length > 0 && (
        <TabelaAvaliacoes avaliacoes={minhas} />
      )}

      {sugestoes.length > 0 && (
        <div className="notas-sugestoes pequeno">
          <span className="suave">{t("notas.daAgenda")}</span>
          {sugestoes.map((x) => (
            <button
              key={x.id}
              type="button"
              className="botao pequeno"
              onClick={() =>
                acao(() =>
                  repoAvaliacoes.criar(banco, {
                    disciplinaId: disciplina.id,
                    nome: x.titulo,
                    data: x.prazo ? x.prazo.slice(0, 10) : null,
                    tarefaId: x.id,
                    notaMaxima: 10,
                    peso: 10,
                  }),
                )
              }
            >
              + {x.titulo}
              {x.prazo && ` (${formatarData(x.prazo.slice(0, 10))})`}
            </button>
          ))}
        </div>
      )}

      <NovaAvaliacao disciplinaId={disciplina.id} />
    </section>
  );
}

/** A frase que diz o que fazer: quanto falta, se vai para o IFA, etc. */
function Orientacao({
  disciplina,
  nota,
  regras,
}: {
  disciplina: Disciplina;
  nota: ReturnType<typeof notaDaDisciplina>;
  regras: RegrasAcademicas;
}) {
  const { t } = useTranslation();
  const { banco, acao, instituicao } = useSemestre();
  const recuperacao = textosRecuperacao(instituicao.perfil);
  const [ifa, setIfa] = useState(disciplina.notaIfa !== null ? formatarNota(disciplina.notaIfa) : "");

  if (nota.situacao === "reprovado_falta") return <p className="pequeno texto-perigo">{t("notas.dica.falta")}</p>;

  // IFA: mostra a regra e, se o SUAP ainda não tem a NAF, deixa anotar a nota.
  if (nota.situacao === "ifa" || ((nota.situacao === "aprovado_ifa" || nota.situacao === "reprovado_ifa") && disciplina.suap?.naf == null)) {
    const salvar = () => {
      const valor = lerNota(ifa);
      if (valor === undefined || (valor !== null && valor > 10)) return;
      if (valor !== disciplina.notaIfa) acao(() => repoDisciplinas.gravarNotaIfa(banco, disciplina.id, valor));
    };
    return (
      <div className="notas-ifa pequeno">
        <span className="texto-atencao">
          {t("notas.dica.ifa", {
            ...recuperacao,
            minimo: formatarNota(regras.notaMinimaIfa),
            teto: formatarNota(regras.tetoAposIfa),
          })}
        </span>
        <label>
          {t("notas.notaIfa", recuperacao)}
          <input
            className="campo-nota"
            inputMode="decimal"
            value={ifa}
            onChange={(e) => setIfa(e.target.value)}
            onBlur={salvar}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
            placeholder="–"
          />
        </label>
      </div>
    );
  }

  const { pontos } = nota;
  if (!pontos) {
    return nota.fonte === null ? <p className="pequeno suave">{t("notas.dica.vazio")}</p> : null;
  }
  if (pontos.faltam <= 1e-9) return <p className="pequeno texto-ok">{t("notas.dica.garantido")}</p>;
  if (pontos.faltam > pontos.emJogo + 1e-9) {
    return (
      <p className="pequeno texto-perigo">
        {t("notas.dica.impossivel", { minimo: formatarNota(regras.mediaMinimaIfa), ...recuperacao })}
      </p>
    );
  }
  return (
    <p className="pequeno">
      {t("notas.dica.precisa", {
        emJogo: formatarNota(arredondar(pontos.emJogo)),
        // Para cima: 0,55 vira 0,6, porque é o mínimo que precisa tirar.
        faltam: formatarNota(Math.ceil(pontos.faltam * 10 - 1e-9) / 10),
        aprovacao: formatarNota(regras.mediaAprovacao),
      })}
    </p>
  );
}

/** Duas casas, para não aparecer 3,9500000001. */
function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** As avaliações anotadas. A coluna de peso só aparece se alguma usa peso diferente do valor. */
function TabelaAvaliacoes({ avaliacoes }: { avaliacoes: Avaliacao[] }) {
  const { t } = useTranslation();
  const comPeso = avaliacoes.some((a) => a.peso !== a.notaMaxima);
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead>
          <tr>
            <th>{t("notas.avaliacao")}</th>
            <th>{t("notas.data")}</th>
            {comPeso && <th className="numero">{t("notas.peso")}</th>}
            <th className="numero">{t("notas.nota")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {avaliacoes.map((a) => (
            <LinhaAvaliacao key={a.id} avaliacao={a} comPeso={comPeso} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaAvaliacao({ avaliacao, comPeso }: { avaliacao: Avaliacao; comPeso: boolean }) {
  const { t } = useTranslation();
  const { banco, acao } = useSemestre();
  const [texto, setTexto] = useState(avaliacao.nota !== null ? formatarNota(avaliacao.nota) : "");
  const [invalida, setInvalida] = useState(false);

  // Se a nota mudar por fora (ex.: recarregou), acompanha.
  useEffect(() => {
    setTexto(avaliacao.nota !== null ? formatarNota(avaliacao.nota) : "");
  }, [avaliacao.nota]);

  function salvar() {
    const valor = lerNota(texto);
    const ok = valor !== undefined && (valor === null || valor <= avaliacao.notaMaxima);
    setInvalida(!ok);
    if (ok && valor !== avaliacao.nota) acao(() => repoAvaliacoes.lancarNota(banco, avaliacao.id, valor));
  }

  return (
    <tr>
      <td>{avaliacao.nome}</td>
      <td className="suave">{avaliacao.data ? formatarData(avaliacao.data) : "–"}</td>
      {comPeso && <td className="numero">{formatarNota(avaliacao.peso)}</td>}
      <td className="numero sem-quebra">
        <input
          className={`campo-nota ${invalida ? "invalido" : ""}`}
          inputMode="decimal"
          aria-label={t("notas.notaDe", { nome: avaliacao.nome })}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => e.key === "Enter" && salvar()}
          placeholder="–"
        />
        <span className="suave"> / {formatarNota(avaliacao.notaMaxima)}</span>
      </td>
      <td className="numero">
        <button
          type="button"
          className="botao-icone"
          aria-label={t("notas.excluir", { nome: avaliacao.nome })}
          onClick={() => acao(() => repoAvaliacoes.excluir(banco, avaliacao.id))}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function NovaAvaliacao({ disciplinaId }: { disciplinaId: string }) {
  const { t } = useTranslation();
  const { banco, acao } = useSemestre();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [peso, setPeso] = useState("");
  const [maxima, setMaxima] = useState("10");
  const [nota, setNota] = useState("");
  const [data, setData] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  if (!aberto) {
    return (
      <p>
        <button type="button" className="link" onClick={() => setAberto(true)}>
          + {t("notas.adicionar")}
        </button>
      </p>
    );
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const valorMaxima = lerNota(maxima);
    // Sem peso informado, a avaliação pesa o quanto vale (P1 de 7 pesa 7, trabalho de 3 pesa 3).
    const valorPeso = peso.trim() === "" ? valorMaxima : lerNota(peso);
    const valorNota = lerNota(nota);
    if (!valorPeso || !valorMaxima || valorNota === undefined || (valorNota !== null && valorNota > valorMaxima)) {
      setAviso(t("notas.invalido"));
      return;
    }
    const ok = await acao(() =>
      repoAvaliacoes.criar(banco, {
        disciplinaId,
        nome: nome.trim(),
        peso: valorPeso,
        notaMaxima: valorMaxima,
        nota: valorNota,
        data: data || null,
      }),
    );
    if (ok) {
      setNome("");
      setNota("");
      setData("");
      setAviso(null);
      setAberto(false);
    }
  }

  return (
    <form className="formulario notas-nova" onSubmit={enviar}>
      <div className="linha">
        <label className="largo">
          {t("notas.avaliacao")}
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("notas.nomeDica")} required autoFocus />
        </label>
        <label>
          {t("notas.data")}
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label>
          {t("notas.valeAte")}
          <input className="campo-nota" inputMode="decimal" value={maxima} onChange={(e) => setMaxima(e.target.value)} />
        </label>
        <label>
          {t("notas.peso")}
          <input className="campo-nota" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder={t("notas.pesoDica")} />
        </label>
        <label>
          {t("notas.nota")}
          <input
            className="campo-nota"
            inputMode="decimal"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={t("notas.notaDica")}
          />
        </label>
      </div>
      {aviso && <p className="aviso">{aviso}</p>}
      <div className="acoes">
        <button type="submit" className="botao primario">
          {t("comum.salvar")}
        </button>
        <button type="button" className="botao" onClick={() => setAberto(false)}>
          {t("comum.cancelar")}
        </button>
      </div>
    </form>
  );
}
