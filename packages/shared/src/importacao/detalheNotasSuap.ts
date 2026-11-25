/**
 * Leitor do "Detalhar" do boletim do SUAP (página
 * /edu/detalhar_matricula_diario_boletim/<matrícula>/<diário>/).
 *
 * A página tem um título por etapa ("Etapa 1 - Soma Simples", "Etapa Final -
 * Média Aritmética") e, abaixo de cada um, a tabela com as avaliações. O app
 * só MOSTRA isso e, quando a forma de cálculo é conhecida (soma, média),
 * refaz a mesma conta que o SUAP faz, para o aluno ver de onde veio a nota.
 * Nada é estimado: avaliação sem nota fica sem nota.
 */
import type { DataIso } from "../tipos.ts";
import { lerNumero, normalizar } from "./boletimSuap.ts";
import { linhasDe, textoDe, trecho } from "./html.ts";

export interface AvaliacaoDetalhe {
  sigla: string;
  tipo: string | null;
  descricao: string | null;
  data: DataIso | null;
  peso: number | null;
  /** `null` = ainda sem nota no SUAP. */
  nota: number | null;
}

export interface EtapaDetalhe {
  /** Número da etapa; `null` na "Etapa Final" (a avaliação final, o IFA). */
  numero: number | null;
  /** Como o SUAP chama a conta: "Soma Simples", "Fórmula", "Média Aritmética"... */
  forma: string;
  /** Linhas da legenda, quando o professor escreve alguma. */
  legenda: string[];
  avaliacoes: AvaliacaoDetalhe[];
}

export interface DetalheNotasSuap {
  etapas: EtapaDetalhe[];
}

function textoOuNulo(texto: string | undefined): string | null {
  const limpo = texto?.trim();
  return limpo && limpo !== "-" ? limpo : null;
}

/** "21/08/2026" → "2026-08-21". */
function dataIso(texto: string | undefined): DataIso | null {
  const achado = /(\d{2})\/(\d{2})\/(\d{4})/.exec(texto ?? "");
  return achado ? `${achado[3]}-${achado[2]}-${achado[1]}` : null;
}

export function lerDetalheNotasSuap(html: string): DetalheNotasSuap {
  const etapas: EtapaDetalhe[] = [];
  // Cada etapa: o título <h4> e, depois dele, a legenda e a primeira tabela.
  const partes = html.split(/<h4\b[^>]*>/i).slice(1);
  for (const parte of partes) {
    const titulo = textoDe(parte.slice(0, parte.search(/<\/h4>/i)));
    const achado = /^Etapa\s+(\d+|Final)\s*[-–]\s*(.+)$/i.exec(titulo);
    if (!achado) continue;
    const tabela = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(parte)?.[1];
    if (!tabela) continue;

    const rotulos = (linhasDe(trecho(tabela, "thead") ?? "")[0] ?? []).map((c) => normalizar(c.texto));
    const coluna = (nome: string) => rotulos.findIndex((r) => r.startsWith(nome));
    const [iSigla, iTipo, iDescricao, iData, iPeso, iNota] = ["SIGLA", "TIPO", "DESCRICAO", "DATA", "PESO", "NOTA"].map(coluna);
    if (iSigla! < 0 || iNota! < 0) continue;

    const legendaHtml = /<div\b[^>]*class=["'][^"']*legenda[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(parte.slice(0, parte.search(/<table\b/i)))?.[1];
    const legenda = [...(legendaHtml ?? "").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => textoDe(m[1]!)).filter(Boolean);

    const avaliacoes: AvaliacaoDetalhe[] = [];
    for (const linha of linhasDe(trecho(tabela, "tbody") ?? "")) {
      const c = linha.map((x) => x.texto);
      const sigla = textoOuNulo(c[iSigla!]);
      if (!sigla) continue;
      const valor = (i: number) => (i >= 0 ? c[i] : undefined);
      avaliacoes.push({
        sigla,
        tipo: textoOuNulo(valor(iTipo!)),
        descricao: textoOuNulo(valor(iDescricao!)),
        data: dataIso(valor(iData!)),
        peso: lerNumero(valor(iPeso!)),
        nota: lerNumero(valor(iNota!)),
      });
    }
    etapas.push({
      numero: /^\d+$/.test(achado[1]!) ? Number(achado[1]) : null,
      forma: achado[2]!.trim(),
      legenda,
      avaliacoes,
    });
  }
  return { etapas };
}

/** O tipo de conta que o app sabe refazer. */
export type ContaEtapa = "soma" | "media" | "media_ponderada" | "desconhecida";

export function contaDaForma(forma: string): ContaEtapa {
  const f = normalizar(forma);
  if (f.includes("SOMA")) return "soma";
  if (f.includes("PONDERADA")) return "media_ponderada";
  if (f.includes("MEDIA")) return "media";
  return "desconhecida"; // ex.: "Fórmula": o SUAP não mostra qual é
}

export interface ExplicacaoEtapa {
  conta: ContaEtapa;
  /** Notas que entram na conta (sem as que ainda não saíram). */
  parcelas: number[];
  /** Resultado da conta, quando dá para refazer. */
  resultado: number | null;
  /** Avaliações que ainda não têm nota. */
  pendentes: AvaliacaoDetalhe[];
}

/** Refaz a conta da etapa com as notas que já saíram, do jeito que o SUAP descreve. */
export function explicarEtapa(etapa: EtapaDetalhe): ExplicacaoEtapa {
  const conta = contaDaForma(etapa.forma);
  const comNota = etapa.avaliacoes.filter((a) => a.nota !== null);
  const pendentes = etapa.avaliacoes.filter((a) => a.nota === null);
  const parcelas = comNota.map((a) => a.nota!);
  const arredondar = (x: number) => Math.round(x * 100) / 100;
  let resultado: number | null = null;
  if (parcelas.length > 0) {
    if (conta === "soma") resultado = arredondar(parcelas.reduce((s, n) => s + n, 0));
    else if (conta === "media") resultado = arredondar(parcelas.reduce((s, n) => s + n, 0) / parcelas.length);
    else if (conta === "media_ponderada" && comNota.every((a) => a.peso !== null)) {
      const pesos = comNota.reduce((s, a) => s + a.peso!, 0);
      if (pesos > 0) resultado = arredondar(comNota.reduce((s, a) => s + a.nota! * a.peso!, 0) / pesos);
    }
  }
  return { conta, parcelas, resultado, pendentes };
}
