/**
 * Leitor do calendário acadêmico do SUAP (página /edu/calendarioacademico/<id>/).
 *
 * A página tem, para cada mês, uma tabela (com o mês na <caption>) e uma
 * lista ao lado (<ul class="calendario-referencia">). A CLASSE de cada item
 * da lista diz o tipo, conforme a legenda do próprio SUAP:
 *   success → etapa · conflito_leve → prova final · conflito → fechamento
 *   recesso → feriado/recesso · evento → evento
 * O texto do item traz as datas: "Dia 5: ..." ou "De 16/12 a 17/12: ...".
 *
 * A tabela "Relação de Recessos" diz se cada recesso é feriado ou não.
 * O resultado tem o mesmo formato de um semestre de pacote de calendário,
 * então é aplicado pelo mesmo caminho (calendario.aplicarPacote).
 */
import type { DataIso, DiaSemana, TipoEventoCalendario } from "../tipos.ts";
import type { EventoPacote, SemestrePacote } from "../calendario/pacote.ts";
import { linhasDe, textoDe, trecho } from "./html.ts";
import { normalizar } from "./boletimSuap.ts";

export class ErroCalendarioSuap extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroCalendarioSuap";
  }
}

const MESES: Record<string, number> = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

const DIAS: Record<string, DiaSemana> = { SEGUNDA: 1, TERCA: 2, QUARTA: 3, QUINTA: 4, SEXTA: 5 };

/**
 * Eventos internos de servidores (reuniões, prazos de professores). Ficam
 * como "outro", e a tela não os destaca entre os próximos eventos.
 */
const INTERNOS = /^(REUNIA|REUNIOES|CONSELHO DE CAMPUS|PLANO DE INTERVENCAO|ATRIBUICAO DE AULAS|DATA LIMITE (PARA )?(DE )?ENTREGA D[AO] (FPA|PIT|RIT)|PUBLICACAO DOS HORARIOS|ENCERRAMENTO DE POSSE)/;

function data(ano: number, mes: number, dia: number): DataIso {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

interface ItemLista {
  classe: string;
  inicio: DataIso;
  fim: DataIso;
  titulo: string;
}

/** Lê os itens das listas de todos os meses, já com datas completas. */
function itensDosMeses(html: string): ItemLista[] {
  const itens: ItemLista[] = [];
  const blocos = html.split(/<table\b[^>]*class=["'][^"']*calendario-dias[^"']*["'][^>]*>/i).slice(1);
  for (const bloco of blocos) {
    const legenda = normalizar(textoDe(trecho(bloco, "caption") ?? ""));
    const mesAno = /([A-Z]+)\s*\/\s*(\d{4})/.exec(legenda);
    if (!mesAno || !MESES[mesAno[1]!]) continue;
    const mes = MESES[mesAno[1]!]!;
    const ano = Number(mesAno[2]);
    const lista = /<ul\b[^>]*calendario-referencia[^>]*>([\s\S]*?)<\/ul>/i.exec(bloco)?.[1] ?? "";

    for (const [, classe, conteudo] of lista.matchAll(/<li\b[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/li>/gi)) {
      const texto = textoDe(conteudo!);
      const umDia = /^Dia\s+(\d{1,2})\s*:\s*(.+)$/i.exec(texto);
      const periodo = /^De\s+(\d{1,2})\/(\d{1,2})\s+a\s+(\d{1,2})\/(\d{1,2})\s*:\s*(.+)$/i.exec(texto);
      if (umDia) {
        const d = data(ano, mes, Number(umDia[1]));
        itens.push({ classe: classe!.trim(), inicio: d, fim: d, titulo: umDia[2]!.trim() });
      } else if (periodo) {
        const [, di, mi, df, mf, titulo] = periodo;
        // Um período que vira o ano (ex.: 21/12 a 5/1) termina no ano seguinte.
        const anoFim = Number(mf) < Number(mi) ? ano + 1 : ano;
        const anoInicio = Number(mi) > mes ? ano - 1 : ano;
        itens.push({
          classe: classe!.trim(),
          inicio: data(anoInicio, Number(mi), Number(di)),
          fim: data(anoFim, Number(mf), Number(df)),
          titulo: titulo!.trim(),
        });
      }
    }
  }
  // Períodos longos aparecem em todos os meses: fica uma cópia de cada.
  const vistos = new Set<string>();
  return itens.filter((i) => {
    const chave = `${i.inicio}|${i.fim}|${i.titulo}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/** Títulos dos recessos que a tabela "Relação de Recessos" marca como feriado. */
function feriados(html: string): Set<string> {
  const resultado = new Set<string>();
  const posicao = html.search(/>\s*Relação de Recessos\s*</i);
  if (posicao < 0) return resultado;
  const tabela = /<table\b[\s\S]*?<\/table>/i.exec(html.slice(posicao))?.[0] ?? "";
  for (const linha of linhasDe(tabela)) {
    const [, descricao, tipo] = linha.map((c) => c.texto);
    if (descricao && tipo && normalizar(tipo).includes("FERIADO")) resultado.add(normalizar(descricao));
  }
  return resultado;
}

function classificar(item: ItemLista, ehFeriado: (titulo: string) => boolean): EventoPacote {
  const classes = item.classe.split(/\s+/);
  const titulo = normalizar(item.titulo);
  let tipo: TipoEventoCalendario = "evento";
  let segueDiaSemana: DiaSemana | undefined;

  if (classes.includes("conflito_leve")) tipo = "prova_final";
  else if (classes.includes("conflito")) tipo = "fim_aulas";
  else if (classes.includes("recesso")) tipo = ehFeriado(item.titulo) ? "feriado" : "recesso";
  else {
    const sabado = /SABADO LETIVO\s*\(\s*([A-Z]+)/.exec(titulo);
    if (sabado && DIAS[sabado[1]!]) {
      tipo = "sabado_letivo";
      segueDiaSemana = DIAS[sabado[1]!];
    } else if (/^(RETORNO|INICIO) DAS AULAS/.test(titulo)) tipo = "inicio_aulas";
    else if (INTERNOS.test(titulo)) tipo = "outro";
    else if (/^DATA LIMITE|^PRAZO/.test(titulo)) tipo = "prazo";
  }
  const evento: EventoPacote = { tipo, titulo: item.titulo, inicio: item.inicio };
  if (item.fim !== item.inicio) evento.fim = item.fim;
  if (segueDiaSemana !== undefined) evento.segueDiaSemana = segueDiaSemana;
  return evento;
}

export function lerCalendarioSuap(html: string): SemestrePacote {
  const titulo = textoDe(trecho(html, "h2") ?? "");
  const periodo = /(\d{4})\s*\/\s*(\d)/.exec(titulo);
  if (!periodo) throw new ErroCalendarioSuap("Não achei o período (ex.: 2026/2) no título do calendário.");

  const itens = itensDosMeses(html);
  const etapas = itens.filter((i) => i.classe.split(/\s+/).includes("success"));
  if (etapas.length === 0) throw new ErroCalendarioSuap("Não achei as etapas do semestre no calendário.");

  const fechamento = itens.find((i) => i.classe.split(/\s+/).includes("conflito"));
  const inicio = etapas.map((e) => e.inicio).sort()[0]!;
  const fim = fechamento?.fim ?? [...etapas.map((e) => e.fim)].sort().at(-1)!;

  const listaFeriados = feriados(html);
  const ehFeriado = (t: string) => listaFeriados.has(normalizar(t));

  const eventos = itens
    // As etapas viram o início/fim do semestre; o resto entra se cair dentro dele.
    .filter((i) => !i.classe.split(/\s+/).includes("success"))
    .filter((i) => i.fim >= inicio && i.inicio <= fim)
    .map((i) => classificar(i, ehFeriado));

  // Garante os marcos de início e fim, que a tela e o semestre usam.
  if (!eventos.some((e) => e.tipo === "inicio_aulas")) eventos.push({ tipo: "inicio_aulas", titulo: "Início das aulas", inicio });
  if (!eventos.some((e) => e.tipo === "fim_aulas")) eventos.push({ tipo: "fim_aulas", titulo: "Fim do período", inicio: fim });
  eventos.sort((a, b) => a.inicio.localeCompare(b.inicio));

  return { periodo: `${periodo[1]}/${periodo[2]}`, inicio, fim, eventos };
}
