import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { DiaSemana, EventoCalendario, HorarioAula, Tarefa, TipoTarefa } from "../tipos.ts";
import { estadoDaAula, proximoDiaDeAulas, proximosPrazos } from "./inicio.ts";

const registro = { criadoEm: "", atualizadoEm: "", excluidoEm: null };

function aula(diaSemana: DiaSemana, inicio: string, fim: string): HorarioAula {
  return { ...registro, id: `${diaSemana}-${inicio}`, disciplinaId: "d", diaSemana, inicio, fim, quantidadeAulas: 2, sala: null };
}

function feriado(data: string): EventoCalendario {
  return {
    ...registro, id: data, semestreId: "s", tipo: "feriado", titulo: "Feriado", dataInicio: data, dataFim: data,
    suspendeAulas: true, segueDiaSemana: null, origem: null,
  };
}

function tarefa(id: string, tipo: TipoTarefa, prazo: string | null, concluida = false): Tarefa {
  return {
    ...registro, id, disciplinaId: null, tipo, titulo: id, descricao: null, prazo, prioridade: "media",
    concluidaEm: concluida ? "2026-11-01T00:00:00Z" : null, lembretes: null, origem: null, origemId: null, url: null,
  };
}

// 25/11/2026 é uma quarta-feira.
const grade = [aula(3, "07:00", "08:40"), aula(3, "08:55", "10:35"), aula(4, "07:00", "11:40"), aula(1, "07:00", "10:35")];

describe("proximoDiaDeAulas", () => {
  it("de madrugada, mostra as aulas de hoje", () => {
    const r = proximoDiaDeAulas(new Date(2026, 10, 25, 3, 0), grade, []);
    assert.equal(r?.data, "2026-11-25");
    assert.equal(r?.distancia, 0);
    assert.equal(r?.aulas.length, 2);
  });

  it("durante a última aula, ainda é hoje", () => {
    assert.equal(proximoDiaDeAulas(new Date(2026, 10, 25, 10, 0), grade, [])?.data, "2026-11-25");
  });

  it("depois que a última aula acaba, passa para o próximo dia com aula", () => {
    const r = proximoDiaDeAulas(new Date(2026, 10, 25, 12, 0), grade, []);
    assert.equal(r?.data, "2026-11-26");
    assert.equal(r?.distancia, 1);
  });

  it("pula fim de semana e feriado", () => {
    // Quinta à tarde: sexta não tem aula, sábado e domingo também não; segunda é feriado → quarta.
    const r = proximoDiaDeAulas(new Date(2026, 10, 26, 15, 0), grade, [feriado("2026-11-30")]);
    assert.equal(r?.data, "2026-12-02");
  });

  it("não passa do fim do semestre", () => {
    assert.equal(proximoDiaDeAulas(new Date(2026, 10, 25, 12, 0), grade, [], "2026-11-25"), null);
  });

  it("sem grade, não há dia de aula", () => {
    assert.equal(proximoDiaDeAulas(new Date(2026, 10, 25, 3, 0), [], []), null);
  });
});

describe("estadoDaAula", () => {
  it("encerrada, agora ou depois", () => {
    const a = aula(3, "08:55", "10:35");
    assert.equal(estadoDaAula(a, new Date(2026, 10, 25, 8, 0)), "depois");
    assert.equal(estadoDaAula(a, new Date(2026, 10, 25, 9, 0)), "agora");
    assert.equal(estadoDaAula(a, new Date(2026, 10, 25, 10, 35)), "encerrada");
  });
});

describe("proximosPrazos", () => {
  const agora = new Date("2026-11-25T12:00:00Z");
  const lista = [
    tarefa("p3", "prova", "2026-12-10T10:00:00Z"),
    tarefa("p1", "prova", "2026-11-27T10:00:00Z"),
    tarefa("p2", "prova", "2026-12-01T10:00:00Z"),
    tarefa("velha", "prova", "2026-11-20T10:00:00Z"),
    tarefa("feita", "prova", "2026-11-26T10:00:00Z", true),
    tarefa("ap", "apresentacao", "2026-11-30T10:00:00Z"),
    tarefa("lista", "lista", "2026-11-26T10:00:00Z"),
    tarefa("moodle", "atividade_moodle", "2026-11-28T10:00:00Z"),
    tarefa("sem", "outro", null),
  ];
  const r = proximosPrazos(lista, agora);

  it("as duas próximas de cada fila, sem concluídas nem sem prazo", () => {
    assert.deepEqual(r.provas.map((t) => t.id), ["p1", "p2"]);
    assert.deepEqual(r.trabalhos.map((t) => t.id), ["ap"]);
    assert.deepEqual(r.tarefas.map((t) => t.id), ["lista", "moodle"]);
  });

  it("as vencidas viram atrasadas", () => {
    assert.deepEqual(r.atrasadas.map((t) => t.id), ["velha"]);
  });
});
