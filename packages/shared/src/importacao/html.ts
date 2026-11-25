/**
 * Utilitários mínimos para ler HTML sem depender do navegador.
 *
 * Por que não usar o DOMParser? Ele só existe no navegador: o leitor do
 * boletim também precisa rodar nos testes (Node) e, no futuro, no celular.
 * Como a página do SUAP é uma tabela simples e bem formada, expressões
 * regulares dão conta, e o pacote continua sem dependências.
 */

const ENTIDADES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ccedil: "ç",
  Ccedil: "Ç",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

// Vogais acentuadas (&aacute; &Atilde; &ecirc; ...): monta a letra juntando a
// vogal com o acento e normalizando (NFC), em vez de listar uma por uma.
const ACENTOS: Record<string, string> = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈" };
for (const vogal of "aeiouAEIOU") {
  for (const [nome, marca] of Object.entries(ACENTOS)) {
    ENTIDADES[`${vogal}${nome}`] = (vogal + marca).normalize("NFC");
  }
}

/** Troca entidades HTML (&amp;, &ccedil;, &#233;, &#xE9;) pelo caractere. */
export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome: string) => {
    if (nome[0] === "#") {
      const codigo = nome[1] === "x" || nome[1] === "X" ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
    }
    // Maiúscula importa (&Aacute; é "Á"); para as básicas, aceita qualquer caixa (&AMP;).
    return ENTIDADES[nome] ?? ENTIDADES[nome.toLowerCase()] ?? inteira;
  });
}

/** Texto visível de um trecho de HTML: sem tags, sem entidades, espaços colapsados. */
export function textoDe(html: string): string {
  return decodificarEntidades(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export interface Celula {
  texto: string;
  colspan: number;
  rowspan: number;
}

function atributoNumerico(atributos: string, nome: string): number {
  const achado = new RegExp(`${nome}\\s*=\\s*["']?(\\d+)`, "i").exec(atributos);
  return achado ? Math.max(1, Number(achado[1])) : 1;
}

/** Linhas (<tr>) de um trecho de tabela, cada uma com suas células (<td>/<th>). */
export function linhasDe(html: string): Celula[][] {
  const linhas: Celula[][] = [];
  for (const [, conteudo] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celulas: Celula[] = [];
    for (const m of conteudo!.matchAll(/<t([hd])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      const atributos = m[2]!;
      celulas.push({
        texto: textoDe(m[3]!),
        colspan: atributoNumerico(atributos, "colspan"),
        rowspan: atributoNumerico(atributos, "rowspan"),
      });
    }
    linhas.push(celulas);
  }
  return linhas;
}

/** Primeiro trecho entre <tag ...> e </tag> dentro do HTML. */
export function trecho(html: string, tag: string): string | null {
  const achado = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(html);
  return achado ? achado[1]! : null;
}

/**
 * Transforma as linhas de cabeçalho (com rowspan e colspan) em um rótulo por
 * coluna. Ex.: "ETAPA 1" com colspan=2 sobre "NOTA" e "FALTAS" vira as
 * colunas "ETAPA 1/NOTA" e "ETAPA 1/FALTAS".
 */
export function rotulosDoCabecalho(linhas: Celula[][]): string[] {
  const grade: string[][] = linhas.map(() => []);
  linhas.forEach((celulas, l) => {
    let coluna = 0;
    for (const celula of celulas) {
      while (grade[l]![coluna] !== undefined) coluna++;
      for (let dl = 0; dl < celula.rowspan && l + dl < linhas.length; dl++) {
        for (let dc = 0; dc < celula.colspan; dc++) {
          grade[l + dl]![coluna + dc] = celula.texto;
        }
      }
      coluna += celula.colspan;
    }
  });
  const largura = Math.max(0, ...grade.map((linha) => linha.length));
  return Array.from({ length: largura }, (_, c) => {
    const partes: string[] = [];
    for (const linha of grade) {
      const texto = linha[c];
      if (texto && partes[partes.length - 1] !== texto) partes.push(texto);
    }
    return partes.join("/");
  });
}

/** Expande as células de uma linha do corpo conforme o colspan. */
export function expandirColspan(celulas: Celula[]): string[] {
  return celulas.flatMap((c) => Array.from({ length: c.colspan }, () => c.texto));
}
