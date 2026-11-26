import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { bancoEmMemoria } from "../banco/memoria.ts";
import { semestres } from "../banco/semestres.ts";
import { disciplinas } from "../banco/disciplinas.ts";
import { tarefas } from "../banco/tarefas.ts";
import type { Disciplina } from "../tipos.ts";
import { lerBoletimSuap } from "./boletimSuap.ts";
import { lerDetalheNotasSuap } from "./detalheNotasSuap.ts";
import { notasNovas, sincronizarSuap, SEM_EXTRAS } from "./sincronizarSuap.ts";

const fixture = (nome: string) => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url), "utf8");
const boletim = lerBoletimSuap(fixture("boletim-suap.html"));
const detalhe = lerDetalheNotasSuap(fixture("detalhe-notas-suap.html"));

const comSuap = (id: string, suap: Partial<NonNullable<Disciplina["suap"]>> | null) =>
  ({ id, suap: suap && { etapas: [], detalhe: null, ...suap } }) as Disciplina;

describe("notas novas do SUAP", () => {
  it("na primeira importação nada é novidade", () => {
    assert.deepEqual(notasNovas([comSuap("a", null)], [comSuap("a", { etapas: [{ numero: 1, nota: 7, faltas: 0 }] })]), []);
  });

  it("pelo boletim: etapa que ganhou ou mudou de nota", () => {
    const antes = [comSuap("a", { etapas: [{ numero: 1, nota: null, faltas: 0 }] })];
    const depois = [comSuap("a", { etapas: [{ numero: 1, nota: 6.5, faltas: 0 }] })];
    assert.deepEqual(notasNovas(antes, depois), [{ disciplinaId: "a", descricao: "Etapa 1", nota: 6.5 }]);
  });

  it("pelo Detalhar: avaliação que ganhou nota", () => {
    const semA3 = structuredClone(detalhe);
    const comA3 = structuredClone(detalhe);
    comA3.etapas[0]!.avaliacoes.find((a) => a.sigla === "A3")!.nota = 3;
    assert.deepEqual(notasNovas([comSuap("a", { detalhe: semA3 })], [comSuap("a", { detalhe: comA3 })]), [
      { disciplinaId: "a", descricao: "Prova 3", nota: 3 },
    ]);
  });
});

describe("sincronizar com o SUAP", () => {
  it("cria as disciplinas, grava o detalhamento e põe as provas com data na Agenda", async () => {
    const banco = bancoEmMemoria();
    const semestre = await semestres.criar(banco, { nome: "2026.2", inicio: "2026-08-03", fim: "2026-12-18" });
    const diario = boletim.disciplinas[0]!.diario!;
    const r = await sincronizarSuap(banco, semestre, boletim, { ...SEM_EXTRAS, detalhes: [{ diario, detalhe }] });
    assert.equal(r.importacao.criadas + r.importacao.atualizadas, boletim.disciplinas.length);
    assert.deepEqual(r.notasNovas, []);
    const lista = await disciplinas.listar(banco, semestre.id);
    assert.ok(lista.some((d) => d.suap?.detalhe));
    // A fixture tem a Prova 1 em 10/08/2026: já passou, entra concluída.
    const [prova] = await tarefas.listar(banco);
    assert.equal(prova?.titulo, "Prova 1");
    assert.ok(prova?.concluidaEm);
  });
});
