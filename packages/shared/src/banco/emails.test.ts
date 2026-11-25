import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bancoEmMemoria } from "./memoria.ts";
import { emails, type EmailRecebido } from "./emails.ts";

const conta = "fulano@aluno.exemplo.edu.br";
const recebido = (uid: number, de = "fulana@exemplo.edu.br"): EmailRecebido => ({
  uid,
  deNome: "Fulana",
  deEmail: de,
  assunto: `Assunto ${uid}`,
  data: `2026-11-2${uid}T10:00:00Z`,
  corpo: `Corpo do e-mail ${uid}`,
  lido: false,
  estrela: false,
});

describe("repositório de e-mails", () => {
  it("grava, classifica e lista do mais novo para o mais antigo", async () => {
    const banco = bancoEmMemoria();
    await emails.gravarLote(banco, conta, { uidValidity: 7, emails: [recebido(1), recebido(2, "x@nao-responda.exemplo.edu.br")] });
    const lista = await emails.listar(banco, conta);
    assert.deepEqual(lista.map((e) => e.assunto), ["Assunto 2", "Assunto 1"]);
    assert.deepEqual(lista.map((e) => e.categoria), ["atualizacoes", "principal"]);
    assert.deepEqual(await emails.estado(banco, conta), { uidValidity: 7, maiorUid: 2 });
  });

  it("não sobrescreve o que foi marcado no app ao receber de novo", async () => {
    const banco = bancoEmMemoria();
    await emails.gravarLote(banco, conta, { uidValidity: 7, emails: [recebido(1)] });
    const [e] = await emails.listar(banco, conta);
    await emails.marcar(banco, e!.id, "lido", true);
    await emails.gravarLote(banco, conta, { uidValidity: 7, emails: [recebido(1)] });
    assert.equal((await emails.listar(banco, conta))[0]?.lido, true);
  });

  it("refaz a cópia se o servidor renumerar a caixa (UIDVALIDITY novo)", async () => {
    const banco = bancoEmMemoria();
    await emails.gravarLote(banco, conta, { uidValidity: 7, emails: [recebido(1), recebido(2)] });
    await emails.gravarLote(banco, conta, { uidValidity: 9, emails: [recebido(5)] });
    assert.equal((await emails.listar(banco, conta)).length, 1);
    assert.deepEqual(await emails.estado(banco, conta), { uidValidity: 9, maiorUid: 5 });
  });

  it("limpa a cópia de uma conta", async () => {
    const banco = bancoEmMemoria();
    await emails.gravarLote(banco, conta, { uidValidity: 7, emails: [recebido(1)] });
    await emails.limpar(banco, conta);
    assert.equal(await emails.estado(banco, conta), null);
  });
});
