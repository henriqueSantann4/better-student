/**
 * Leitor da aba "Locais e Horários de Aula" do aluno no SUAP.
 *
 * A página tem duas partes, e as duas são aproveitadas:
 *  - o quadro "Horários": uma tabela por turno (Matutino, Vespertino,
 *    Noturno), com uma linha por aula ("07:00 - 07:50") e uma coluna por dia.
 *    Cada célula diz qual disciplina está ali. Aulas seguidas da mesma
 *    disciplina no mesmo dia viram UM encontro (ex.: 07:00–10:35, 4 aulas);
 *  - a lista "Diários": o número do diário, a sala e o professor de cada
 *    disciplina.
 *
 * Como no boletim, nada aqui faz requisição: só interpreta o HTML.
 */
import type { DiaSemana } from "../tipos.ts";
import { formatarNome, normalizar } from "./boletimSuap.ts";
import { linhasDe, textoDe, trecho } from "./html.ts";

export interface EncontroSuap {
  /** Sigla da disciplina, a mesma do boletim (ex.: "XYZALP1"). */
  codigo: string | null;
  /** Nome já formatado (ex.: "Banco de Dados I"). */
  nome: string;
  diaSemana: DiaSemana;
  inicio: string;
  fim: string;
  /** Quantas aulas (linhas do quadro) o encontro ocupa. */
  quantidadeAulas: number;
  sala: string | null;
  professor: string | null;
  diario: string | null;
}

export interface HorariosSuap {
  /** Período escolhido na página ("2026.2"), ou `null` se ela não informar. */
  periodo: { ano: number; periodo: number } | null;
  encontros: EncontroSuap[];
}

export class ErroHorariosSuap extends Error {
  constructor() {
    super("Quadro de horários não encontrado.");
    this.name = "ErroHorariosSuap";
  }
}

const DIAS: Record<string, DiaSemana> = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
};

/** Uma disciplina dentro de uma célula do quadro. */
interface Marca {
  codigo: string | null;
  nome: string;
}

/** "SUP.10001 (XYZALP1)" → "XYZALP1". */
function siglaDe(texto: string): string | null {
  return /\(([^()]+)\)/.exec(texto)?.[1]?.trim() ?? null;
}

/**
 * Disciplinas de uma célula. Normalmente é uma só; com conflito de horário
 * (o SUAP pinta de vermelho) podem ser duas. O nome completo fica no
 * atributo `data-hint` do <span>; o texto visível é só o código.
 */
function marcasDaCelula(html: string): Marca[] {
  const marcas: Marca[] = [];
  for (const m of html.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)) {
    const dica = /data-hint\s*=\s*["']([^"']*)["']/i.exec(m[1]!)?.[1];
    const texto = textoDe(m[2]!);
    if (!texto) continue;
    marcas.push({ codigo: siglaDe(texto), nome: formatarNome(dica ? textoDe(dica) : texto) });
  }
  return marcas;
}

/** Células cruas (com o HTML de dentro) de cada linha. */
function celulasCruas(html: string): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, linha]) =>
    [...linha!.matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map((c) => c[2]!),
  );
}

interface Aberto extends Marca {
  diaSemana: DiaSemana;
  inicio: string;
  fim: string;
  quantidadeAulas: number;
  /** Linha do quadro em que o encontro terminou (para saber se a próxima continua). */
  ultimaLinha: number;
}

function lerQuadro(tabela: string): Aberto[] {
  const cabecalho = linhasDe(trecho(tabela, "thead") ?? "")[0]?.map((c) => normalizar(c.texto)) ?? [];
  // Coluna → dia da semana (a primeira coluna é o turno/horário).
  const dias = cabecalho.map((rotulo) => DIAS[rotulo.split(/[\s-]/)[0] ?? ""]);
  if (!dias.some((d) => d !== undefined)) return [];

  const encontros: Aberto[] = [];
  const abertos = new Map<string, Aberto>(); // chave: dia + disciplina

  celulasCruas(trecho(tabela, "tbody") ?? "").forEach((celulas, linha) => {
    const horario = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(textoDe(celulas[0] ?? ""));
    if (!horario) return;
    const [inicio, fim] = [horario[1]!.padStart(5, "0"), horario[2]!.padStart(5, "0")];

    celulas.forEach((html, coluna) => {
      const dia = dias[coluna];
      if (dia === undefined) return;
      for (const marca of marcasDaCelula(html)) {
        const chave = `${dia}|${marca.codigo ?? marca.nome}`;
        const aberto = abertos.get(chave);
        if (aberto && aberto.ultimaLinha === linha - 1) {
          // Continua o mesmo encontro (mesmo com intervalo entre as aulas).
          aberto.fim = fim;
          aberto.quantidadeAulas++;
          aberto.ultimaLinha = linha;
        } else {
          const novo: Aberto = { ...marca, diaSemana: dia, inicio, fim, quantidadeAulas: 1, ultimaLinha: linha };
          abertos.set(chave, novo);
          encontros.push(novo);
        }
      }
    });
  });
  return encontros;
}

interface Diario {
  diario: string | null;
  sala: string | null;
  professor: string | null;
}

/** Tabela "Diários": sigla → diário, sala e professor. */
function lerDiarios(html: string): Map<string, Diario> {
  const porSigla = new Map<string, Diario>();
  for (const [, tabela] of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rotulos = (linhasDe(trecho(tabela!, "thead") ?? "")[0] ?? []).map((c) => normalizar(c.texto));
    const iDiario = rotulos.indexOf("DIARIO");
    const iComponente = rotulos.indexOf("COMPONENTE");
    const iLocal = rotulos.indexOf("LOCAL");
    if (iComponente < 0) continue;

    for (const celulas of celulasCruas(trecho(tabela!, "tbody") ?? "")) {
      const componente = celulas[iComponente] ?? "";
      // O primeiro <dd> é o componente; o que vem depois de "Professor" é o professor.
      const textos = [...componente.matchAll(/<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)].map((m) => textoDe(m[1]!));
      const sigla = siglaDe(textos[0] ?? textoDe(componente));
      if (!sigla) continue;
      const local = iLocal >= 0 ? textoDe(celulas[iLocal] ?? "") : "";
      porSigla.set(normalizar(sigla), {
        diario: iDiario >= 0 ? textoDe(celulas[iDiario] ?? "") || null : null,
        // "SALA 12 - Prédio Câmpus X (XYZ)" → "SALA 12": o prédio é igual para todas.
        sala: local.split(" - ")[0]?.trim() || null,
        professor: textos[1] || null,
      });
    }
  }
  return porSigla;
}

export function lerHorariosSuap(html: string): HorariosSuap {
  const quadros = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .map(([, tabela]) => tabela!)
    .filter((tabela) => {
      const cabecalho = normalizar(textoDe(trecho(tabela, "thead") ?? ""));
      return cabecalho.includes("SEGUNDA") && cabecalho.includes("QUARTA");
    });
  if (quadros.length === 0) throw new ErroHorariosSuap();

  const diarios = lerDiarios(html);
  const encontros = quadros
    .flatMap(lerQuadro)
    .map(({ ultimaLinha: _, ...encontro }): EncontroSuap => {
      const diario = encontro.codigo ? diarios.get(normalizar(encontro.codigo)) : undefined;
      return {
        ...encontro,
        sala: diario?.sala ?? null,
        professor: diario?.professor ?? null,
        diario: diario?.diario ?? null,
      };
    })
    .sort((a, b) => a.diaSemana - b.diaSemana || a.inicio.localeCompare(b.inicio));

  // Período: a opção marcada no filtro ("2026.2").
  const opcao = /<option\b[^>]*\bselected\b[^>]*>\s*(\d{4})[./](\d)\s*</i.exec(html);
  const periodo = opcao ? { ano: Number(opcao[1]), periodo: Number(opcao[2]) } : null;

  return { periodo, encontros };
}
