import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { diaSemanaDe } from "../datas.ts";
import { ErroPacote, lerPacoteCalendario, semestreDoPacote } from "./pacote.ts";

/**
 * Confere TODOS os pacotes da pasta calendarios/. Como eles são transcritos
 * à mão dos PDFs dos campi, estes testes pegam erros de digitação comuns.
 */
const pasta = new URL("../../calendarios/", import.meta.url);
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".json"));

for (const arquivo of arquivos) {
  describe(`pacote ${arquivo}`, () => {
    const pacote = lerPacoteCalendario(JSON.parse(readFileSync(new URL(arquivo, pasta), "utf8")));

    it("o id é o nome do arquivo", () => assert.equal(`${pacote.id}.json`, arquivo));

    for (const s of pacote.semestres) {
      it(`${s.periodo}: eventos dentro do semestre e em ordem`, () => {
        let anterior = "";
        for (const e of s.eventos) {
          assert.ok(e.inicio >= s.inicio && (e.fim ?? e.inicio) <= s.fim, `${e.titulo} (${e.inicio}) fora de ${s.inicio}–${s.fim}`);
          assert.ok(e.inicio >= anterior, `${e.titulo} fora de ordem`);
          anterior = e.inicio;
        }
      });

      it(`${s.periodo}: sábados letivos caem em sábado e seguem um dia útil`, () => {
        for (const e of s.eventos.filter((x) => x.tipo === "sabado_letivo")) {
          assert.equal(diaSemanaDe(e.inicio), 6, `${e.inicio} não é sábado`);
          assert.ok(e.segueDiaSemana! >= 1 && e.segueDiaSemana! <= 5, `${e.inicio} segue um dia inválido`);
        }
      });

      it(`${s.periodo}: início e fim batem com os eventos de início e fim das aulas`, () => {
        assert.equal(s.eventos.find((e) => e.tipo === "inicio_aulas")?.inicio, s.inicio);
        assert.equal(s.eventos.find((e) => e.tipo === "fim_aulas")?.inicio, s.fim);
      });
    }
  });
}

describe("lerPacoteCalendario", () => {
  const valido = {
    formato: 1, id: "x", instituicao: "X", cursos: "Y",
    semestres: [{ periodo: "2026/2", inicio: "2026-08-01", fim: "2026-12-10", eventos: [] }],
  };

  it("acha o semestre pelo período", () => {
    assert.equal(semestreDoPacote(lerPacoteCalendario(valido), { ano: 2026, periodo: 2 })?.inicio, "2026-08-01");
    assert.equal(semestreDoPacote(lerPacoteCalendario(valido), { ano: 2026, periodo: 1 }), null);
  });

  it("recusa arquivos estranhos", () => {
    assert.throws(() => lerPacoteCalendario({ formato: 2 }), ErroPacote);
    const ruim = structuredClone(valido);
    ruim.semestres[0]!.eventos = [{ tipo: "festa", titulo: "x", inicio: "2026-09-01" }] as never;
    assert.throws(() => lerPacoteCalendario(ruim), ErroPacote);
    const sabado = structuredClone(valido);
    sabado.semestres[0]!.eventos = [{ tipo: "sabado_letivo", titulo: "x", inicio: "2026-08-15" }] as never;
    assert.throws(() => lerPacoteCalendario(sabado), /dia da grade/);
  });
});
