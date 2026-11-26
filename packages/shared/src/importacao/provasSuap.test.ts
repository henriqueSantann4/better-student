import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import type { Banco } from "../banco/banco.ts";
import { bancoEmMemoria } from "../banco/memoria.ts";
import { semestres } from "../banco/semestres.ts";
import { disciplinas } from "../banco/disciplinas.ts";
import { horarios } from "../banco/horarios.ts";
import { tarefas } from "../banco/tarefas.ts";
import { paraDataIso } from "../datas.ts";
import type { DetalheNotasSuap } from "./detalheNotasSuap.ts";
import { avaliacoesComData, importarProvasSuap } from "./provasSuap.ts";

// Quinta, 26/11/2026, meio-dia (hora local).
const AGORA = new Date(2026, 10, 26, 12, 0);

const detalhe = (avaliacoes: Partial<DetalheNotasSuap["etapas"][0]["avaliacoes"][0]>[]): DetalheNotasSuap => ({
  etapas: [{
    numero: 1,
    forma: "Soma Simples",
    legenda: [],
    avaliacoes: avaliacoes.map((a, i) => ({ sigla: `A${i + 1}`, tipo: "Prova", descricao: null, data: null, peso: null, nota: null, ...a })),
  }],
});

describe("provas e trabalhos do SUAP na Agenda", () => {
  let banco: Banco;
  let semestreId: string;
  let poo: string;

  const importar = async (d: DetalheNotasSuap | null) => {
    await disciplinas.gravarDetalheSuap(banco, poo, d);
    const lista = await disciplinas.listar(banco, semestreId);
    return importarProvasSuap(banco, lista, await horarios.listarDoSemestre(banco, semestreId), [], AGORA);
  };

  beforeEach(async () => {
    banco = bancoEmMemoria();
    semestreId = (await semestres.criar(banco, { nome: "2026.2", inicio: "2026-08-03", fim: "2026-12-18" })).id;
    poo = await disciplinas.criar(banco, semestreId, { nome: "Programação Orientada a Objetos", totalAulas: 80 });
    // Aula de POO na quarta, 19h.
    await horarios.criar(banco, { disciplinaId: poo, diaSemana: 3, inicio: "19:00", fim: "22:35", quantidadeAulas: 4 });
    await disciplinas.gravarSuap(banco, poo, {
      codigo: "POO", diario: "1", aulasCumpridas: 60, faltas: 0, frequencia: 100, situacao: "Cursando",
      etapas: [], media: null, naf: null, mfd: null, atualizadoEm: null,
    });
  });

  it("só entram avaliações com data; o que não é Prova vira trabalho", () => {
    const lista = avaliacoesComData([{
      id: "d1", suap: { detalhe: detalhe([
        { tipo: "Prova", descricao: "Prova 1", data: "2026-12-02" },
        { tipo: "Ponto Extra", descricao: "Substitutiva", data: "2026-12-09" },
        { tipo: "Trabalho", descricao: "Trabalho", data: null },
      ]) },
    } as never]);
    assert.deepEqual(lista.map((a) => [a.titulo, a.tipo, a.data]), [
      ["Prova 1", "prova", "2026-12-02"],
      ["Substitutiva", "trabalho", "2026-12-09"],
    ]);
  });

  it("cria no horário da aula; a que já passou entra concluída e não conta como novidade", async () => {
    const r = await importar(detalhe([
      { descricao: "Prova 1", data: "2026-09-23", nota: 5 },
      { descricao: "Prova 2", data: "2026-12-02" },
      { tipo: "Trabalho", descricao: "Seminário", data: "2026-12-05" },
    ]));
    assert.deepEqual(r.novas.map((a) => a.titulo), ["Prova 2", "Seminário"]);

    const lista = await tarefas.listar(banco);
    const p2 = lista.find((t) => t.titulo === "Prova 2")!;
    assert.equal(new Date(p2.prazo!).getHours(), 19); // quarta tem aula às 19h
    assert.equal(p2.origem, "suap");
    assert.equal(p2.concluidaEm, null);
    // Sábado sem aula: vale até o fim do dia.
    assert.equal(new Date(lista.find((t) => t.titulo === "Seminário")!.prazo!).getHours(), 23);
    assert.ok(lista.find((t) => t.titulo === "Prova 1")!.concluidaEm);
  });

  it("importar de novo não duplica; data mudada no SUAP muda o prazo; sumiu, apaga", async () => {
    await importar(detalhe([{ descricao: "Prova 2", data: "2026-12-02" }, { descricao: "Prova 3", data: "2026-12-09" }]));
    let r = await importar(detalhe([{ descricao: "Prova 2", data: "2026-12-02" }, { descricao: "Prova 3", data: "2026-12-16" }]));
    assert.deepEqual([r.novas.length, r.remarcadas.map((a) => a.titulo)], [0, ["Prova 3"]]);
    let lista = await tarefas.listar(banco);
    assert.equal(lista.length, 2);
    assert.equal(paraDataIso(new Date(lista.find((t) => t.titulo === "Prova 3")!.prazo!)), "2026-12-16");

    // O professor tirou a data da Prova 3.
    r = await importar(detalhe([{ descricao: "Prova 2", data: "2026-12-02" }, { descricao: "Prova 3", data: null }]));
    assert.deepEqual(r.removidas, ["Prova 3"]);
    lista = await tarefas.listar(banco);
    assert.deepEqual(lista.map((t) => t.titulo), ["Prova 2"]);
  });

  it("não mexe no prazo que o aluno ajustou se o SUAP não mudou a data", async () => {
    await importar(detalhe([{ descricao: "Prova 2", data: "2026-12-02" }]));
    const [t] = await tarefas.listar(banco);
    const ajustado = new Date(2026, 11, 2, 20, 30).toISOString();
    await tarefas.atualizar(banco, t!.id, { ...t!, prazo: ajustado });
    await importar(detalhe([{ descricao: "Prova 2", data: "2026-12-02" }]));
    assert.equal((await tarefas.listar(banco))[0]!.prazo, ajustado);
  });

  it("junta com a anotação do aluno; se o SUAP tirar a data, a anotação fica sem a marca", async () => {
    const minha = await tarefas.criar(banco, {
      titulo: "Prova de POO", tipo: "prova", disciplinaId: poo, prazo: new Date(2026, 11, 2, 19, 0).toISOString(),
    });
    let r = await importar(detalhe([{ descricao: "Prova 2", data: "2026-12-02" }]));
    assert.deepEqual([r.novas.length, r.juntadas], [0, 1]);
    let lista = await tarefas.listar(banco);
    assert.equal(lista.length, 1);
    assert.equal(lista[0]!.id, minha);
    assert.ok(lista[0]!.suapChave);

    r = await importar(detalhe([{ descricao: "Prova 2", data: null }]));
    assert.deepEqual(r.removidas, ["Prova de POO"]);
    lista = await tarefas.listar(banco);
    assert.deepEqual([lista.length, lista[0]!.suapChave], [1, null]);
  });

  it("sem o Detalhar gravado, não apaga nada", async () => {
    await importar(detalhe([{ descricao: "Prova 2", data: "2026-12-02" }]));
    const r = await importar(null);
    assert.deepEqual(r.removidas, []);
    assert.equal((await tarefas.listar(banco)).length, 1);
  });
});
