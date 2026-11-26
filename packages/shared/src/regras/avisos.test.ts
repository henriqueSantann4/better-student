import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bancoEmMemoria } from "../banco/memoria.ts";
import { novidades } from "../banco/novidades.ts";
import { dispensarAvisos, lerAvisosDispensados, semDispensados, type Aviso } from "./avisos.ts";

const aviso = (chave: string, nivel: number): Aviso => ({ chave, nivel, gravidade: "atencao", motivo: "pertoLimite", destino: "faltas" });

describe("avisos vistos", () => {
  it("some depois do check e volta se piorar", () => {
    const dispensados = { "f-poo": 12 };
    assert.deepEqual(semDispensados([aviso("f-poo", 12), aviso("f-ed", 10)], dispensados).map((a) => a.chave), ["f-ed"]);
    assert.deepEqual(semDispensados([aviso("f-poo", 16)], dispensados).map((a) => a.nivel), [16]);
  });

  it("grava o check e esquece avisos que já não existem", async () => {
    const banco = bancoEmMemoria();
    await dispensarAvisos(banco, [aviso("e-feriado", 1)], [aviso("e-feriado", 1)]);
    await dispensarAvisos(banco, [aviso("f-poo", 12)], [aviso("f-poo", 12)]);
    assert.deepEqual(await lerAvisosDispensados(banco), { "f-poo": 12 });
  });
});

describe("novidades", () => {
  it("registra, lista as não vistas e marca como vistas", async () => {
    const banco = bancoEmMemoria();
    await novidades.registrar(banco, [{ tipo: "nota", titulo: "Prova 2", detalhe: "7,5" }, { tipo: "email", titulo: "Aula cancelada" }]);
    const lista = await novidades.naoVistas(banco);
    assert.deepEqual(lista.map((n) => n.titulo), ["Prova 2", "Aula cancelada"]);
    await novidades.marcarVistas(banco, [lista[0]!.id]);
    assert.deepEqual((await novidades.naoVistas(banco)).map((n) => n.titulo), ["Aula cancelada"]);
  });
});
