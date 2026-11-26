import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ErroMoodle,
  lerAtividadesMoodle,
  lerDisciplinasMoodle,
  lerInfoSite,
  lerNotasMoodle,
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

describe("lerNotasMoodle", () => {
  // Formato de gradereport_user_get_grade_items (valores inventados).
  const resposta = {
    usergrades: [
      {
        courseid: 10,
        userid: 5,
        gradeitems: [
          { id: 1, itemname: "Segunda atividade avaliativa", itemtype: "mod", itemmodule: "quiz", cmid: 77, graderaw: 5.66667, grademax: 7, gradedategraded: 1795000000 },
          { id: 2, itemname: "Relat&oacute;rio", itemtype: "mod", itemmodule: "assign", cmid: 78, graderaw: null, grademax: 3 },
          { id: 3, itemname: "Nota escondida", itemtype: "mod", itemmodule: "assign", cmid: 79, graderaw: 9, grademax: 10, gradeishidden: true },
          { id: 4, itemname: "Lançada à mão", itemtype: "manual", itemmodule: null, graderaw: 2, grademax: 2 },
          { id: 5, itemname: null, itemtype: "category", graderaw: 7.6 },
          { id: 6, itemname: null, itemtype: "course", graderaw: 7.6, grademax: 10 },
        ],
      },
    ],
    warnings: [],
  };
  const notas = lerNotasMoodle(resposta, "https://moodle.exemplo.edu.br/");

  it("deixa de fora os totais de curso e de categoria", () => {
    assert.deepEqual(notas.map((n) => n.id), [1, 2, 3, 4]);
  });

  it("lê nota, máximo, data e link (arredonda para duas casas)", () => {
    const [quiz] = notas;
    assert.equal(quiz?.nota, 5.67);
    assert.equal(quiz?.maxima, 7);
    assert.equal(quiz?.corrigidaEm, new Date(1795000000 * 1000).toISOString());
    assert.equal(quiz?.url, "https://moodle.exemplo.edu.br/mod/quiz/view.php?id=77");
  });

  it("sem nota, nota escondida e item lançado à mão", () => {
    assert.equal(notas[1]?.nome, "Relatório");
    assert.equal(notas[1]?.nota, null);
    assert.equal(notas[2]?.nota, null, "nota escondida pelo professor não aparece");
    assert.equal(notas[3]?.url, null);
    assert.equal(notas[3]?.nota, 2);
  });

  it("erro do Moodle vira ErroMoodle", () => {
    assert.throws(() => lerNotasMoodle({ exception: "x", errorcode: "nopermissions", message: "sem permissão" }), ErroMoodle);
  });
});
