import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { ErroBoletim, formatarNome, lerBoletimSuap, lerNumero } from "./boletimSuap.ts";

const exemplo = readFileSync(new URL("./fixtures/boletim-suap.html", import.meta.url), "utf8");

describe("lerBoletimSuap (boletim de exemplo)", () => {
  const boletim = lerBoletimSuap(exemplo);

  it("lê o período e a data de atualização", () => {
    assert.deepEqual(boletim.periodo, { ano: 2026, periodo: 2 });
    assert.equal(boletim.atualizadoEm, "2026-11-25T10:46");
  });

  it("lê as três disciplinas, ignorando o rodapé de totais", () => {
    assert.deepEqual(
      boletim.disciplinas.map((d) => d.nome),
      ["Algoritmos e Lógica de Programação", "Banco de Dados I", "Inglês Instrumental para a Computação"],
    );
  });

  it("separa o código e lê aulas, faltas e frequência", () => {
    const [alg] = boletim.disciplinas;
    assert.equal(alg?.codigo, "XYZALP1");
    assert.equal(alg?.diario, "100001");
    assert.equal(alg?.aulasPrevistas, 80);
    assert.equal(alg?.aulasCumpridas, 60);
    assert.equal(alg?.faltas, 10);
    assert.equal(alg?.frequencia, 0.8333);
    assert.equal(alg?.situacao, "Cursando (Aguarda Carga Horária)");
  });

  it("lê as notas por etapa, a média, o NAF (IFA) e a MFD", () => {
    const [alg, bd, ingles] = boletim.disciplinas;
    assert.deepEqual(alg?.etapas, [{ numero: 1, nota: 7.5, faltas: 10 }]);
    assert.equal(alg?.media, 7.5);
    assert.equal(bd?.media, null);
    assert.deepEqual([ingles?.media, ingles?.naf, ingles?.mfd], [4.5, 7, 6]);
  });

  it("acha a tabela pelo cabeçalho quando o id some (HTML copiado da página)", () => {
    const semId = exemplo.replace('id="tabela_boletim"', "");
    assert.equal(lerBoletimSuap(semId).disciplinas.length, 3);
  });

  it("sem o título, usa o período marcado no seletor (pedaço da aba)", () => {
    const pedaco = exemplo
      .replace("Boletim - 2026/2 - Matriculado", "Boletim")
      .replace("<table", '<select id="ano_periodo"><option value="2026_2" selected>2026/2</option><option value="2026_1">2026/1</option></select><table');
    assert.deepEqual(lerBoletimSuap(pedaco).periodo, { ano: 2026, periodo: 2 });
  });

  it("recusa páginas sem a tabela do boletim", () => {
    assert.throws(() => lerBoletimSuap("<html><body>Login</body></html>"), ErroBoletim);
  });
});

describe("utilitários do leitor", () => {
  it("lê números do jeito que o SUAP escreve", () => {
    assert.equal(lerNumero("80 Aulas"), 80);
    assert.equal(lerNumero("5,40"), 5.4);
    assert.equal(lerNumero("81,25%"), 0.8125);
    assert.equal(lerNumero("-"), null);
    assert.equal(lerNumero(""), null);
  });

  it("formata nomes em maiúsculas", () => {
    assert.equal(formatarNome("MATEMÁTICA APLICADA À INFORMÁTICA"), "Matemática Aplicada à Informática");
    assert.equal(formatarNome("ESTRUTURA DE DADOS 1"), "Estrutura de Dados 1");
    assert.equal(formatarNome("CÁLCULO II"), "Cálculo II");
  });
});

/**
 * Teste extra com a página REAL, se existir na pasta amostras-privadas/ (que
 * nunca vai para o Git). Só confere que a leitura funciona, sem fixar valores.
 * Em outras máquinas, ou no CI, ele é pulado.
 */
const amostraReal = new URL("../../../../amostras-privadas/boletim.html", import.meta.url);
describe("boletim real (amostras-privadas)", { skip: !existsSync(amostraReal) && "sem amostra local" }, () => {
  it("lê todas as disciplinas com nome e aulas previstas", () => {
    const boletim = lerBoletimSuap(readFileSync(amostraReal, "utf8"));
    assert.ok(boletim.periodo, "período encontrado");
    assert.ok(boletim.disciplinas.length > 0);
    for (const d of boletim.disciplinas) {
      assert.ok(d.nome.length > 0);
      assert.ok(d.codigo, `código de ${d.nome}`);
      assert.ok(d.aulasPrevistas && d.aulasPrevistas > 0, `aulas previstas de ${d.nome}`);
      assert.ok(d.faltas !== null, `faltas de ${d.nome}`);
    }
  });
});
