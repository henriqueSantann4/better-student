/**
 * Arquivos de EXEMPLO, todos inventados, para ver a aba Materiais no modo
 * navegador (`pnpm dev:web`), que não tem acesso a pastas do computador.
 * Só é importado em desenvolvimento: não entra no instalador.
 */
import type { ArquivoMoodle } from "@better-student/shared";
import type { PastaMaterial } from "./materiais";

const dia = (n: number) => Date.now() - n * 86_400_000;

export function pastasDeExemplo(pastas: string[]): PastaMaterial[] {
  return pastas.map((pasta, i) => ({
    pasta,
    arquivos:
      i === 0
        ? [
            { nome: "Aula 1 - introdução.pdf", tamanho: 1_250_000, modificado: dia(30) },
            { nome: "Lista de exercícios 1.pdf", tamanho: 320_000, modificado: dia(12) },
            { nome: "foto-quadro-2026-11-18.jpg", tamanho: 2_400_000, modificado: dia(8) },
          ]
        : i === 1
          ? [{ nome: "Modelo relacional.pptx", tamanho: 4_800_000, modificado: dia(20) }]
          : [],
  }));
}

export function arquivosMoodleDeExemplo(): ArquivoMoodle[] {
  const base = { tamanho: 900_000, url: "https://moodle.exemplo.edu.br/webservice/pluginfile.php/1/x.pdf", modificado: null };
  return [
    { ...base, secao: "Semana 1", recurso: "Slides", nomeOriginal: "Aula 1 - introdução.pdf", nome: "Aula 1 - introdução.pdf" },
    { ...base, secao: "Semana 2", recurso: "Slides", nomeOriginal: "Aula 2 - vetores.pdf", nome: "Aula 2 - vetores.pdf" },
    { ...base, secao: "Semana 3", recurso: "Listas", nomeOriginal: "Lista 2.pdf", nome: "Lista 2.pdf" },
  ];
}
