/**
 * Materiais: uma pasta por disciplina no disco (o banco não guarda os
 * arquivos). Aqui ficam os nomes das pastas e a leitura dos arquivos que os
 * professores postam no Moodle. Nada aqui mexe em disco: isso é do núcleo.
 */
import { conferirResposta } from "../moodle/moodle.ts";
import { textoDe } from "../importacao/html.ts";

/** Pasta para o que não tem disciplina (fotos fora do horário de aula, por exemplo). */
export const PASTA_SEM_DISCIPLINA = "_Sem disciplina";

// Nomes que o Windows reserva para dispositivos e não aceita como pasta ou arquivo.
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Nome seguro para pasta ou arquivo no Windows: sem `<>:"/\|?*` nem
 * caracteres de controle, sem ponto ou espaço no fim, sem nome reservado
 * (CON, NUL...) e com tamanho limitado. Mantém acentos.
 */
export function nomeSeguro(nome: string, reserva = "Sem nome", limite = 120): string {
  let limpo = nome
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (limpo.length > limite) {
    // Corta preservando a extensão, se houver.
    const ponto = limpo.lastIndexOf(".");
    const extensao = ponto > 0 && limpo.length - ponto <= 10 ? limpo.slice(ponto) : "";
    limpo = limpo.slice(0, limite - extensao.length).trim() + extensao;
  }
  if (!limpo || limpo === "." || limpo === "..") return reserva;
  return RESERVADOS.test(limpo) ? `${limpo}_` : limpo;
}

/** Nome da pasta de uma disciplina (ex.: "Estrutura de Dados 1"). */
export function pastaDaDisciplina(nome: string): string {
  return nomeSeguro(nome, "Disciplina", 80);
}

/** Um arquivo postado numa sala do Moodle. */
export interface ArquivoMoodle {
  /** Seção da sala (ex.: "Semana 3"). */
  secao: string;
  /** Nome do recurso onde o arquivo está (ex.: "Slides da aula 5"). */
  recurso: string;
  /** Nome original do arquivo. */
  nomeOriginal: string;
  /** Nome com que ele é salvo na pasta (único dentro da disciplina). */
  nome: string;
  tamanho: number;
  /** Endereço do arquivo na API do Moodle (precisa da chave para baixar). */
  url: string;
  /** Última alteração no Moodle (ISO). */
  modificado: string | null;
}

interface ConteudoBruto {
  type?: string;
  filename?: string;
  filesize?: number;
  fileurl?: string;
  timemodified?: number;
}

interface ModuloBruto {
  name?: string;
  modname?: string;
  uservisible?: boolean;
  contents?: ConteudoBruto[];
}

interface SecaoBruta {
  name?: string;
  modules?: ModuloBruto[];
}

/**
 * Arquivos de uma sala (resposta de core_course_get_contents). Entram os
 * arquivos de recursos e pastas; links e textos ficam de fora. Quando dois
 * arquivos têm o mesmo nome (ex.: "aula.pdf" em semanas diferentes), o nome
 * salvo ganha o nome do recurso na frente, para um não apagar o outro.
 */
export function lerArquivosMoodle(resposta: unknown): ArquivoMoodle[] {
  const secoes = conferirResposta<SecaoBruta[]>(resposta);
  const brutos: Omit<ArquivoMoodle, "nome">[] = [];
  for (const secao of Array.isArray(secoes) ? secoes : []) {
    for (const modulo of secao.modules ?? []) {
      if (modulo.uservisible === false) continue;
      for (const c of modulo.contents ?? []) {
        if (c.type !== "file" || !c.fileurl || !c.filename) continue;
        brutos.push({
          secao: textoDe(secao.name ?? ""),
          recurso: textoDe(modulo.name ?? ""),
          nomeOriginal: c.filename,
          tamanho: Number(c.filesize ?? 0),
          url: c.fileurl,
          modificado: c.timemodified ? new Date(c.timemodified * 1000).toISOString() : null,
        });
      }
    }
  }

  const repeticoes = new Map<string, number>();
  for (const a of brutos) {
    const chave = nomeSeguro(a.nomeOriginal).toLowerCase();
    repeticoes.set(chave, (repeticoes.get(chave) ?? 0) + 1);
  }
  const usados = new Set<string>();
  return brutos.map((a) => {
    const simples = nomeSeguro(a.nomeOriginal);
    let nome = (repeticoes.get(simples.toLowerCase()) ?? 0) > 1 ? nomeSeguro(`${a.recurso} - ${a.nomeOriginal}`) : simples;
    // Ainda repetido (mesmo recurso, mesmo nome): numera.
    for (let n = 2; usados.has(nome.toLowerCase()); n++) {
      const ponto = simples.lastIndexOf(".");
      nome = ponto > 0 ? `${simples.slice(0, ponto)} (${n})${simples.slice(ponto)}` : `${simples} (${n})`;
    }
    usados.add(nome.toLowerCase());
    return { ...a, nome };
  });
}

/** "1536000" → "1,5 MB" (para listas). */
export function tamanhoLegivel(bytes: number, lingua = "pt-BR"): string {
  const unidades = ["B", "KB", "MB", "GB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  const casas = i === 0 || valor >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(lingua, { maximumFractionDigits: casas }).format(valor)} ${unidades[i]}`;
}
