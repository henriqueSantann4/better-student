import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agruparTarefas, grupoDaTarefa } from "./agenda.ts";

// Quarta-feira, 25/11/2026, 14h (hora local).
const agora = new Date(2026, 10, 25, 14, 0);
const em = (dia: number, hora = 23, minuto = 59) => new Date(2026, 10, dia, hora, minuto).toISOString();

describe("grupos da Agenda", () => {
  it("separa pelo prazo, no fuso local", () => {
    assert.equal(grupoDaTarefa({ prazo: em(25, 10), concluidaEm: null }, agora), "atrasadas"); // hoje, mas já passou
    assert.equal(grupoDaTarefa({ prazo: em(24), concluidaEm: null }, agora), "atrasadas");
    assert.equal(grupoDaTarefa({ prazo: em(25), concluidaEm: null }, agora), "hoje");
    assert.equal(grupoDaTarefa({ prazo: em(26, 0, 30), concluidaEm: null }, agora), "amanha");
    assert.equal(grupoDaTarefa({ prazo: em(2 + 30), concluidaEm: null }, agora), "semana"); // 02/12
    assert.equal(grupoDaTarefa({ prazo: new Date(2026, 11, 10).toISOString(), concluidaEm: null }, agora), "depois");
    assert.equal(grupoDaTarefa({ prazo: null, concluidaEm: null }, agora), "semPrazo");
    assert.equal(grupoDaTarefa({ prazo: em(24), concluidaEm: "2026-11-24" }, agora), "concluidas");
  });

  it("ordena cada grupo pelo prazo", () => {
    const grupos = agruparTarefas(
      [
        { id: "b", prazo: em(29), concluidaEm: null },
        { id: "a", prazo: em(27), concluidaEm: null },
      ],
      agora,
    );
    assert.deepEqual(grupos.semana.map((t) => t.id), ["a", "b"]);
    assert.deepEqual(grupos.hoje, []);
  });
});
