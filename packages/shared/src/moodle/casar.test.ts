import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Disciplina } from "../tipos.ts";
import { casarDisciplinaMoodle } from "./casar.ts";

// Disciplinas e salas de EXEMPLO, imitando os formatos vistos no Moodle.
function disciplina(nome: string, codigo: string | null): Disciplina {
  return {
    id: nome, criadoEm: "", atualizadoEm: "", excluidoEm: null, semestreId: "s", nome, sigla: null,
    professor: null, totalAulas: 80, frequenciaMinima: null, cor: null, notaIfa: null,
    suap: codigo
      ? { codigo, diario: null, aulasCumpridas: null, faltas: null, frequencia: null, situacao: null, etapas: [], media: null, naf: null, mfd: null, atualizadoEm: null, importadoEm: "" }
      : null,
  };
}

const disciplinas = [
  disciplina("Matemática Discreta", "XYZMDIS"),
  disciplina("Programação Orientada a Objetos", "XYZPOOB"),
  disciplina("Estrutura de Dados 1", "XYZEDA1"),
  disciplina("Projeto Extensão 1", "XYZPEX1"),
  disciplina("Banco de Dados", null),
];
const casar = (nome: string, sigla = "") => casarDisciplinaMoodle({ nome, sigla }, disciplinas)?.nome ?? null;

describe("casarDisciplinaMoodle", () => {
  it("casa pelo código do SUAP em qualquer posição do nome", () => {
    assert.equal(casar("[20262.2.XYZ.BAC.SIN.2021.1M.SUP.10001 (XYZMDIS) 123] MATEMÁTICA DISCRETA"), "Matemática Discreta");
    assert.equal(casar("XYZPOOB - PROGRAMAÇÃO ORIENTADA A OBJETOS", "XYZPOOB"), "Programação Orientada a Objetos");
    assert.equal(casar("2026-2 BSI PROJETO EXTENSÃO 1", "[20262 (XYZPEX1) 399]"), "Projeto Extensão 1");
  });

  it("sem código, casa pelo nome, sem acentos nem maiúsculas", () => {
    assert.equal(casar("Estrutura de Dados 1 - 2026", "Estrutura de Dados 1 - 2026"), "Estrutura de Dados 1");
    assert.equal(casar("BANCO DE DADOS - turma B"), "Banco de Dados");
  });

  it("não inventa: sala sem código nem nome conhecido fica sem disciplina", () => {
    assert.equal(casar("ED anulada", "ED1 anulada"), null);
    assert.equal(casar("Sala de avisos do curso"), null);
  });

  it("não confunde 'Estrutura de Dados 1' com uma sala de 'Estrutura de Dados 2'", () => {
    assert.equal(casar("Estrutura de Dados 2 - 2027"), null);
  });
});
