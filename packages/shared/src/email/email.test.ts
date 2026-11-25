import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buscarEmails, emailValido, iniciais, type Email } from "./email.ts";

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
    const base = { trecho: "", data: "", lido: false, estrela: false, categoria: "principal" as const };
    const emails: Email[] = [
      { ...base, id: "1", de: { nome: "Coordenação", email: "c@x.br" }, assunto: "Reunião", corpo: "Sobre o estágio" },
      { ...base, id: "2", de: { nome: "Moodle", email: "m@x.br" }, assunto: "Tarefa", corpo: "Prazo amanhã" },
    ];
    assert.deepEqual(buscarEmails(emails, "estagio").map((e) => e.id), ["1"]);
    assert.deepEqual(buscarEmails(emails, "MOODLE").map((e) => e.id), ["2"]);
    assert.equal(buscarEmails(emails, "  ").length, 2);
  });
});
