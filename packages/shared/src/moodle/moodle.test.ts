import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ErroMoodle,
  lerAtividadesMoodle,
  lerDisciplinasMoodle,
  lerInfoSite,
  parametrosMoodle,
} from "./moodle.ts";

// Respostas de EXEMPLO, no formato da API do Moodle 4.x, com dados inventados.
const eventos = {
  events: [
    {
      id: 2, name: "Lista 4 está para ser entregue", activityname: "Lista 4", modulename: "assign",
      timesort: 1764716340, url: "https://moodle.exemplo.edu.br/mod/assign/view.php?id=20",
      course: { id: 7, fullname: "Programa&ccedil;&atilde;o Orientada a Objetos", shortname: "POO" },
      action: { name: "Adicionar envio", actionable: true },
    },
    {
      id: 1, name: "Questionário 2 fecha", activityname: "Questionário 2", modulename: "quiz",
      timesort: 1764370800, url: "https://moodle.exemplo.edu.br/mod/quiz/view.php?id=10",
      course: { id: 8, fullname: "Banco de Dados I", shortname: "BD1" }, action: null,
    },
  ],
  firstid: 1,
  lastid: 2,
};

describe("leitura da API do Moodle", () => {
  it("lê o site e o usuário", () => {
    assert.deepEqual(lerInfoSite({ sitename: "MOODLE DE EXEMPLO", fullname: "Fulano de Tal", userid: 42 }), {
      nomeSite: "MOODLE DE EXEMPLO", nomeUsuario: "Fulano de Tal", idUsuario: 42,
    });
  });

  it("lê as disciplinas em ordem alfabética, com progresso", () => {
    const lista = lerDisciplinasMoodle([
      { id: 8, fullname: "Banco de Dados I", shortname: "BD1", progress: 33.3 },
      { id: 7, displayname: "Programa&ccedil;&atilde;o", shortname: "POO" },
    ]);
    assert.deepEqual(lista.map((d) => [d.nome, d.progresso]), [["Banco de Dados I", 33], ["Programação", null]]);
  });

  it("lê as atividades com prazo, da mais próxima para a mais distante", () => {
    const lista = lerAtividadesMoodle(eventos);
    assert.deepEqual(lista.map((a) => a.nome), ["Questionário 2", "Lista 4"]);
    const lista4 = lista[1]!;
    assert.equal(lista4.disciplina, "Programação Orientada a Objetos");
    assert.equal(lista4.tipo, "assign");
    assert.equal(lista4.acao, "Adicionar envio");
    assert.equal(lista4.prazo, new Date(1764716340 * 1000).toISOString());
    assert.equal(lista[0]!.acao, null);
  });

  it("transforma o erro do Moodle (que vem com HTTP 200) em exceção", () => {
    assert.throws(
      () => lerInfoSite({ exception: "moodle_exception", errorcode: "invalidtoken", message: "Token inválido" }),
      (e: unknown) => e instanceof ErroMoodle && e.codigo === "invalidtoken",
    );
  });

  it("monta os parâmetros no formato da API REST", () => {
    assert.deepEqual(parametrosMoodle({ userid: 42, ativo: true, cursos: [7, 8], opcoes: { limite: 5 } }), [
      ["userid", "42"], ["ativo", "1"], ["cursos[0]", "7"], ["cursos[1]", "8"], ["opcoes[limite]", "5"],
    ]);
  });
});
