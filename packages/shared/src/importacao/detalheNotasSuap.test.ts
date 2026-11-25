import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { contaDaForma, explicarEtapa, lerDetalheNotasSuap } from "./detalheNotasSuap.ts";

const exemplo = readFileSync(new URL("./fixtures/detalhe-notas-suap.html", import.meta.url), "utf8");

describe("lerDetalheNotasSuap (página de exemplo)", () => {
  const detalhe = lerDetalheNotasSuap(exemplo);

  it("lê as etapas, a forma de cálculo e a legenda", () => {
    assert.deepEqual(
      detalhe.etapas.map((e) => [e.numero, e.forma]),
      [[1, "Soma Simples"], [null, "Média Aritmética"]],
    );
    assert.deepEqual(detalhe.etapas[1]?.legenda, ["A1: avaliação final"]);
    assert.deepEqual(detalhe.etapas[0]?.legenda, []);
  });

  it("lê cada avaliação, com data e nota (traço = sem nota)", () => {
    const [t, a1, , , a3] = detalhe.etapas[0]!.avaliacoes;
    assert.deepEqual(a1, { sigla: "A1", tipo: "Prova", descricao: "Prova 1", data: "2026-08-10", peso: null, nota: 2.1 });
    assert.equal(t?.nota, 0);
    assert.equal(a3?.nota, null);
  });

  it("refaz a soma simples com o que já saiu e separa o que falta", () => {
    const e = explicarEtapa(detalhe.etapas[0]!);
    assert.equal(e.conta, "soma");
    assert.equal(e.resultado, 3.6);
    assert.deepEqual(e.pendentes.map((a) => a.sigla), ["A3"]);
  });

  it("fórmula: não inventa a conta", () => {
    const formula = lerDetalheNotasSuap(exemplo.replace("Soma Simples", "Fórmula"));
    const e = explicarEtapa(formula.etapas[0]!);
    assert.equal(e.conta, "desconhecida");
    assert.equal(e.resultado, null);
  });

  it("reconhece as formas de cálculo", () => {
    assert.equal(contaDaForma("Média Aritmética"), "media");
    assert.equal(contaDaForma("Média Ponderada"), "media_ponderada");
    assert.equal(contaDaForma("Fórmula"), "desconhecida");
  });

  it("página sem detalhamento não tem etapas", () => {
    assert.deepEqual(lerDetalheNotasSuap("<html><body>nada</body></html>").etapas, []);
  });
});

/** Teste extra com as páginas REAIS (fora do git), se existirem. Não olha valores. */
for (const nome of ["detalhe-matematica.html", "detalhe-software-livre.html"]) {
  const real = new URL(`../../../../amostras-privadas/${nome}`, import.meta.url);
  describe(`detalhe real ${nome}`, { skip: !existsSync(real) && "sem amostra local" }, () => {
    it("tem etapas com avaliações", () => {
      const d = lerDetalheNotasSuap(readFileSync(real, "utf8"));
      assert.ok(d.etapas.length >= 2);
      assert.ok(d.etapas[0]!.avaliacoes.length > 0);
    });
  });
}

describe("aplicarDetalhesSuap", () => {
  it("grava o detalhamento na disciplina do mesmo diário", async () => {
    const { bancoEmMemoria } = await import("../banco/memoria.ts");
    const { disciplinas, semestres } = await import("../banco/index.ts");
    const { aplicarDetalhesSuap } = await import("./importarSuap.ts");
    const banco = bancoEmMemoria();
    const semestre = await semestres.criar(banco, { nome: "2026.2", inicio: "2026-08-03", fim: "2026-12-12" });
    const id = await disciplinas.criar(banco, semestre.id, { nome: "Exemplo", totalAulas: 80 });
    await disciplinas.gravarSuap(banco, id, {
      codigo: null, diario: "100001", aulasCumpridas: null, faltas: null, frequencia: null,
      situacao: null, etapas: [], media: null, naf: null, mfd: null, atualizadoEm: null,
    });
    const detalhe = lerDetalheNotasSuap(exemplo);
    assert.equal(await aplicarDetalhesSuap(banco, semestre.id, [{ diario: "100001", detalhe }, { diario: "999", detalhe }]), 1);
    const [lida] = await disciplinas.listar(banco, semestre.id);
    assert.equal(lida?.suap?.detalhe?.etapas[0]?.forma, "Soma Simples");
  });
});
