import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import type { Banco } from "./banco.ts";
import { bancoEmMemoria } from "./memoria.ts";
import { semestres } from "./semestres.ts";
import { disciplinas } from "./disciplinas.ts";
import { horarios } from "./horarios.ts";
import { faltas } from "./faltas.ts";
import { REGRAS_PADRAO_IFSP } from "../tipos.ts";

describe("repositórios", () => {
  let banco: Banco;
  let semestreId: string;

  beforeEach(async () => {
    banco = bancoEmMemoria();
    semestreId = (await semestres.criar(banco, { nome: "2026.2", inicio: "2026-08-01", fim: "2026-12-20" })).id;
  });

  it("criar um semestre o torna o atual, com as regras padrão", async () => {
    const atual = await semestres.atual(banco);
    assert.equal(atual?.id, semestreId);
    assert.equal(atual?.frequenciaMinima, 0.75);
    assert.equal(atual?.notaMinimaIfa, 6);
  });

  it("sem semestre criado, não há semestre atual", async () => {
    assert.equal(await semestres.atual(bancoEmMemoria()), null);
  });

  it("cria, edita e exclui uma disciplina", async () => {
    const id = await disciplinas.criar(banco, semestreId, { nome: "POO", totalAulas: 80 });
    await disciplinas.atualizar(banco, id, { nome: "POO", sigla: "POOS3", totalAulas: 76 });

    const [d] = await disciplinas.listar(banco, semestreId);
    assert.equal(d?.sigla, "POOS3");
    assert.equal(d?.totalAulas, 76);
    assert.equal(d?.frequenciaMinima, null);

    await disciplinas.excluir(banco, id);
    assert.deepEqual(await disciplinas.listar(banco, semestreId), []);
  });

  it("lista os horários por dia e hora, sem os de disciplinas excluídas", async () => {
    const poo = await disciplinas.criar(banco, semestreId, { nome: "POO", totalAulas: 80 });
    const bd = await disciplinas.criar(banco, semestreId, { nome: "BD", totalAulas: 80 });
    await horarios.criar(banco, { disciplinaId: poo, diaSemana: 3, inicio: "19:00", fim: "22:30", quantidadeAulas: 4 });
    await horarios.criar(banco, { disciplinaId: bd, diaSemana: 1, inicio: "21:00", fim: "22:30", quantidadeAulas: 2 });
    await horarios.criar(banco, { disciplinaId: poo, diaSemana: 1, inicio: "19:00", fim: "20:40", quantidadeAulas: 2 });

    const lista = await horarios.listarDoSemestre(banco, semestreId);
    assert.deepEqual(lista.map((h) => `${h.diaSemana} ${h.inicio}`), ["1 19:00", "1 21:00", "3 19:00"]);

    await disciplinas.excluir(banco, bd);
    assert.equal((await horarios.listarDoSemestre(banco, semestreId)).length, 2);
  });

  it("registra, recusa duplicada e exclui uma falta", async () => {
    const poo = await disciplinas.criar(banco, semestreId, { nome: "POO", totalAulas: 80 });
    const h = await horarios.criar(banco, { disciplinaId: poo, diaSemana: 1, inicio: "19:00", fim: "22:30", quantidadeAulas: 4 });
    const falta = { disciplinaId: poo, data: "2026-11-23", horarioAulaId: h, quantidadeAulas: 4 };

    const id = await faltas.registrar(banco, falta);
    await assert.rejects(faltas.registrar(banco, falta), /UNIQUE/);

    await faltas.excluir(banco, id);
    assert.deepEqual(await faltas.listarDoSemestre(banco, semestreId), []);
    // Depois de excluída, a mesma falta pode ser lançada de novo.
    await faltas.registrar(banco, falta);
    assert.equal((await faltas.listarDoSemestre(banco, semestreId)).length, 1);
  });
});

describe("avaliações", () => {
  it("cria, lança nota, lista por data e exclui", async () => {
    const { avaliacoes } = await import("./avaliacoes.ts");
    const banco = bancoEmMemoria();
    const semestre = await semestres.criar(banco, { nome: "2026.2", inicio: "2026-08-03", fim: "2026-12-12" });
    const d = await disciplinas.criar(banco, semestre.id, { nome: "POO", totalAulas: 80 });
    const p2 = await avaliacoes.criar(banco, { disciplinaId: d, nome: "P2", peso: 2, data: "2026-12-01" });
    await avaliacoes.criar(banco, { disciplinaId: d, nome: "P1", data: "2026-09-20" });
    await avaliacoes.criar(banco, { disciplinaId: d, nome: "Trabalho", notaMaxima: 5 });
    await avaliacoes.lancarNota(banco, p2, 7.5);

    const lista = await avaliacoes.listarDoSemestre(banco, semestre.id);
    assert.deepEqual(lista.map((a) => a.nome), ["P1", "P2", "Trabalho"]);
    assert.equal(lista[1]?.nota, 7.5);
    assert.equal(lista[1]?.peso, 2);
    assert.equal(lista[2]?.notaMaxima, 5);

    await avaliacoes.excluir(banco, p2);
    assert.equal((await avaliacoes.listarDoSemestre(banco, semestre.id)).length, 2);

    await disciplinas.gravarNotaIfa(banco, d, 6.5);
    assert.equal((await disciplinas.listar(banco, semestre.id))[0]?.notaIfa, 6.5);

    await semestres.atualizarRegras(banco, semestre.id, { ...REGRAS_PADRAO_IFSP, mediaAprovacao: 7 });
    assert.equal((await semestres.atual(banco))?.mediaAprovacao, 7);
  });
});
