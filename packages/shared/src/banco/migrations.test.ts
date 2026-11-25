/**
 * Aplica as migrations num SQLite em memória (o `node:sqlite`, embutido no
 * Node) para garantir que o SQL é válido e que as restrições funcionam.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { sqliteEmMemoria } from "./memoria.ts";

const agora = "2026-11-24T12:00:00-03:00";

describe("migrations", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = sqliteEmMemoria();
    db.prepare(
      "INSERT INTO semestre (id, nome, inicio, fim, criado_em, atualizado_em) VALUES ('s1', '2026.2', '2026-08-01', '2026-12-20', ?, ?)",
    ).run(agora, agora);
    db.prepare(
      "INSERT INTO disciplina (id, semestre_id, nome, total_aulas, criado_em, atualizado_em) VALUES ('d1', 's1', 'Projeto de Extensão 1', 100, ?, ?)",
    ).run(agora, agora);
    db.prepare(
      "INSERT INTO horario_aula (id, disciplina_id, dia_semana, inicio, fim, quantidade_aulas, criado_em, atualizado_em) VALUES ('h1', 'd1', 1, '07:00', '10:30', 4, ?, ?)",
    ).run(agora, agora);
  });

  it("cria o semestre com as regras padrão do IFSP", () => {
    const s = db.prepare("SELECT frequencia_minima, media_aprovacao, media_minima_ifa, teto_apos_ifa FROM semestre").get();
    assert.deepEqual({ ...s }, { frequencia_minima: 0.75, media_aprovacao: 6, media_minima_ifa: 4, teto_apos_ifa: 6 });
  });

  const inserirFalta = (id: string, excluidoEm: string | null = null) =>
    db
      .prepare(
        "INSERT INTO falta (id, disciplina_id, data, horario_aula_id, quantidade_aulas, criado_em, atualizado_em, excluido_em) VALUES (?, 'd1', '2026-11-23', 'h1', 4, ?, ?, ?)",
      )
      .run(id, agora, agora, excluidoEm);

  it("impede lançar a mesma falta duas vezes", () => {
    inserirFalta("f1");
    assert.throws(() => inserirFalta("f2"), /UNIQUE/);
  });

  it("uma falta excluída não bloqueia um novo lançamento", () => {
    inserirFalta("f1", agora);
    assert.doesNotThrow(() => inserirFalta("f2"));
  });

  it("rejeita dados inválidos", () => {
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO avaliacao (id, disciplina_id, nome, nota, nota_maxima, criado_em, atualizado_em) VALUES ('a1', 'd1', 'P1', 11, 10, ?, ?)")
          .run(agora, agora),
      /CHECK/,
    );
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO tarefa (id, tipo, titulo, criado_em, atualizado_em) VALUES ('t1', 'festa', 'x', ?, ?)")
          .run(agora, agora),
      /CHECK/,
    );
  });

  it("rejeita referência a disciplina inexistente", () => {
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO falta (id, disciplina_id, data, quantidade_aulas, criado_em, atualizado_em) VALUES ('f1', 'nao-existe', '2026-11-23', 4, ?, ?)")
          .run(agora, agora),
      /FOREIGN KEY/,
    );
  });
});
