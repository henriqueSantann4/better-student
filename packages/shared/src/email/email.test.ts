import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buscarEmails, classificarEmail, emailValido, iniciais, trechoDe, type Email } from "./email.ts";

describe("classificarEmail", () => {
  it("mensagens automáticas vão para Atualizações", () => {
    assert.equal(classificarEmail("sistema@nao-responda.exemplo.edu.br", "Notas lançadas"), "atualizacoes");
    assert.equal(classificarEmail("nao-responda@exemplo.edu.br", "Aviso"), "atualizacoes");
    assert.equal(classificarEmail("no-reply@accounts.google.com", "Alerta de segurança"), "atualizacoes");
    assert.equal(classificarEmail("moodle@exemplo.edu.br", "Nova tarefa"), "atualizacoes");
    assert.equal(classificarEmail("noreply@moodle.exemplo.edu.br", "Fórum"), "atualizacoes");
  });

  it("comunicação e eventos vão para Divulgação", () => {
    assert.equal(classificarEmail("comunicacao@exemplo.edu.br", "Programação da semana"), "divulgacao");
    assert.equal(classificarEmail("extensao@exemplo.edu.br", "Bolsas"), "divulgacao");
    assert.equal(classificarEmail("coordenacao@exemplo.edu.br", "Inscrições abertas para a Semana Acadêmica"), "divulgacao");
  });

  it("pessoas (professores, coordenação) ficam em Principal", () => {
    assert.equal(classificarEmail("fulana.souza@exemplo.edu.br", "Prova remarcada"), "principal");
    assert.equal(classificarEmail("professor.exemplo@gmail.com", "Material da aula"), "principal");
    assert.equal(classificarEmail("coordenacao@exemplo.edu.br", "Prazo de trancamento"), "principal");
  });
});

describe("trechoDe", () => {
  it("junta as linhas e corta com reticências", () => {
    assert.equal(trechoDe("Olá,\n\nturma!"), "Olá, turma!");
    assert.equal(trechoDe("a".repeat(300), 10), "aaaaaaaaa…");
  });
});

describe("e-mail", () => {
  it("valida o formato do endereço", () => {
    assert.equal(emailValido("fulano@aluno.exemplo.edu.br"), true);
    assert.equal(emailValido("  fulano@exemplo.edu.br "), true);
    assert.equal(emailValido("fulano"), false);
    assert.equal(emailValido("fulano@exemplo"), false);
  });

  it("gera as iniciais sem o título", () => {
    assert.equal(iniciais("Profa. Ana Souza"), "AS");
    assert.equal(iniciais("Coordenação"), "C");
    assert.equal(iniciais("SUAP (não responda)"), "SR");
  });

  it("busca sem diferenciar acentos e maiúsculas", () => {
    const base = { trecho: "", html: null, data: "", lido: false, estrela: false, categoria: "principal" as const };
    const emails: Email[] = [
      { ...base, id: "1", de: { nome: "Coordenação", email: "c@x.br" }, assunto: "Reunião", corpo: "Sobre o estágio" },
      { ...base, id: "2", de: { nome: "Moodle", email: "m@x.br" }, assunto: "Tarefa", corpo: "Prazo amanhã" },
    ];
    assert.deepEqual(buscarEmails(emails, "estagio").map((e) => e.id), ["1"]);
    assert.deepEqual(buscarEmails(emails, "MOODLE").map((e) => e.id), ["2"]);
    assert.equal(buscarEmails(emails, "  ").length, 2);
  });
});
