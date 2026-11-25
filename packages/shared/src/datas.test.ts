import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diaSemanaDe, hojeIso, paraDataIso } from "./datas.ts";

describe("datas", () => {
  it("monta a data local, sem passar por UTC", () => {
    // 23h do dia 24 no horário local continua sendo dia 24.
    assert.equal(paraDataIso(new Date(2026, 10, 24, 23, 30)), "2026-11-24");
    assert.equal(hojeIso(new Date(2026, 0, 5, 0, 10)), "2026-01-05");
  });

  it("calcula o dia da semana de uma data", () => {
    assert.equal(diaSemanaDe("2026-11-24"), 2); // terça
    assert.equal(diaSemanaDe("2026-11-29"), 0); // domingo
  });
});
