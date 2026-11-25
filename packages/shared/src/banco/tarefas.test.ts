import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bancoEmMemoria } from "./memoria.ts";
import { subtarefas, tarefas } from "./tarefas.ts";
import type { AtividadeMoodle } from "../moodle/moodle.ts";

const atividade = (id: number, prazo: string, nome = `Atividade ${id}`): AtividadeMoodle => ({
  id, nome, tipo: "assign", disciplina: "POO", disciplinaId: 7, prazo, url: `https://moodle.exemplo.edu.br/a/${id}`, acao: "Adicionar envio",
});

describe("tarefas", () => {
  it("cria, conclui e exclui", async () => {
    const banco = bancoEmMemoria();
    const id = await tarefas.criar(banco, { titulo: "Prova de BD", tipo: "prova", prazo: "2026-12-01T19:00:00Z", prioridade: "alta" });
    await tarefas.concluir(banco, id, true);
    const [t] = await tarefas.listar(banco);
    assert.equal(t?.titulo, "Prova de BD");
    assert.ok(t?.concluidaEm);
    await tarefas.excluir(banco, id);
    assert.deepEqual(await tarefas.listar(banco), []);
  });

  it("subtarefas ficam em ordem e podem ser marcadas", async () => {
    const banco = bancoEmMemoria();
    const id = await tarefas.criar(banco, { titulo: "Trabalho", tipo: "trabalho" });
    const s1 = await subtarefas.criar(banco, id, "Pesquisar");
    await subtarefas.criar(banco, id, "Escrever");
    await subtarefas.marcar(banco, s1, true);
    const lista = await subtarefas.listar(banco);
    assert.deepEqual(lista.map((s) => [s.titulo, s.ordem, s.concluida]), [["Pesquisar", 0, true], ["Escrever", 1, false]]);
  });
});

describe("importar atividades do Moodle", () => {
  const agora = "2026-11-25T12:00:00Z";

  it("cria uma vez e, ao importar de novo, atualiza em vez de duplicar", async () => {
    const banco = bancoEmMemoria();
    let r = await tarefas.importarMoodle(banco, [atividade(1, "2026-12-01T23:59:00Z")], () => null, agora);
    assert.deepEqual(r, { novas: 1, atualizadas: 0, concluidas: 0 });
    r = await tarefas.importarMoodle(banco, [atividade(1, "2026-12-03T23:59:00Z", "Lista 4 (prazo estendido)")], () => null, agora);
    assert.deepEqual(r, { novas: 0, atualizadas: 1, concluidas: 0 });
    const lista = await tarefas.listar(banco);
    assert.equal(lista.length, 1);
    assert.deepEqual([lista[0]?.titulo, lista[0]?.prazo, lista[0]?.tipo], ["Lista 4 (prazo estendido)", "2026-12-03T23:59:00Z", "atividade_moodle"]);
  });

  it("mantém o que o usuário mudou (prioridade, descrição)", async () => {
    const banco = bancoEmMemoria();
    await tarefas.importarMoodle(banco, [atividade(1, "2026-12-01T23:59:00Z")], () => null, agora);
    const [t] = await tarefas.listar(banco);
    await tarefas.atualizar(banco, t!.id, { ...t!, prioridade: "alta", descricao: "começar no fim de semana" });
    await tarefas.importarMoodle(banco, [atividade(1, "2026-12-01T23:59:00Z")], () => null, agora);
    const [depois] = await tarefas.listar(banco);
    assert.deepEqual([depois?.prioridade, depois?.descricao], ["alta", "começar no fim de semana"]);
  });

  it("some da linha do tempo antes do prazo → conclui (o Moodle tira o que foi entregue)", async () => {
    const banco = bancoEmMemoria();
    await tarefas.importarMoodle(banco, [atividade(1, "2026-12-01T23:59:00Z"), atividade(2, "2026-11-20T23:59:00Z")], () => null, agora);
    const r = await tarefas.importarMoodle(banco, [], () => null, agora);
    assert.equal(r.concluidas, 1); // só a 1: a 2 já tinha passado do prazo, então não dá para saber
    const lista = await tarefas.listar(banco);
    assert.ok(lista.find((t) => t.origemId === "1")?.concluidaEm);
    assert.equal(lista.find((t) => t.origemId === "2")?.concluidaEm, null);
  });

  it("liga a tarefa à disciplina do app", async () => {
    const banco = bancoEmMemoria();
    await tarefas.importarMoodle(banco, [atividade(1, "2026-12-01T23:59:00Z")], () => null, agora);
    // Sem disciplina ainda (a disciplina do app pode ser criada depois)...
    assert.equal((await tarefas.listar(banco))[0]?.disciplinaId, null);
  });
});
