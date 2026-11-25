import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimarDatas, nomeDoPeriodo, periodoDaData, periodoDoNome } from "./semestre.ts";

describe("período do semestre", () => {
  it("lê o período de nomes comuns", () => {
    assert.deepEqual(periodoDoNome("2026.2"), { ano: 2026, periodo: 2 });
    assert.deepEqual(periodoDoNome("2026/1"), { ano: 2026, periodo: 1 });
    assert.equal(periodoDoNome("Segundo semestre"), null);
  });

  it("monta o nome a partir do período", () => {
    assert.equal(nomeDoPeriodo({ ano: 2026, periodo: 2 }), "2026.2");
  });

  it("deduz o período pela data: julho em diante é o 2º", () => {
    assert.deepEqual(periodoDaData(new Date(2026, 5, 30)), { ano: 2026, periodo: 1 });
    assert.deepEqual(periodoDaData(new Date(2026, 6, 1)), { ano: 2026, periodo: 2 });
  });

  it("estima as datas de cada semestre", () => {
    assert.deepEqual(estimarDatas({ ano: 2026, periodo: 1 }), { inicio: "2026-02-01", fim: "2026-07-10" });
    assert.deepEqual(estimarDatas({ ano: 2026, periodo: 2 }), { inicio: "2026-08-01", fim: "2026-12-20" });
  });
});
