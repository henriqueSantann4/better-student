import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { LEMBRETES_PADRAO, gravarLembretesPadrao, lerLembretesPadrao, momentosDosLembretes } from "./lembretes.ts";
import { bancoEmMemoria } from "../banco/memoria.ts";

describe("lembretes", () => {
  it("prova: 3 lembretes, a partir de 3 dias antes, um por dia", () => {
    const prazo = new Date("2026-12-10T19:00:00");
    const momentos = momentosDosLembretes(prazo, LEMBRETES_PADRAO.prova!).map((d) => d.toISOString());
    assert.deepEqual(momentos, [
      new Date("2026-12-07T19:00:00").toISOString(),
      new Date("2026-12-08T19:00:00").toISOString(),
      new Date("2026-12-09T19:00:00").toISOString(),
    ]);
  });

  it("nunca agenda no prazo ou depois dele", () => {
    const momentos = momentosDosLembretes(new Date("2026-12-10T19:00:00"), {
      quantidade: 5,
      inicioAntesMinutos: 2 * 24 * 60,
      intervaloMinutos: 24 * 60,
    });
    assert.equal(momentos.length, 2);
  });

  it("lê o que foi salvo e completa com o padrão", async () => {
    const banco = bancoEmMemoria();
    assert.deepEqual(await lerLembretesPadrao(banco), LEMBRETES_PADRAO);
    await gravarLembretesPadrao(banco, { ...LEMBRETES_PADRAO, lista: null });
    const lidos = await lerLembretesPadrao(banco);
    assert.equal(lidos.lista, null);
    assert.deepEqual(lidos.prova, LEMBRETES_PADRAO.prova);
  });
});
