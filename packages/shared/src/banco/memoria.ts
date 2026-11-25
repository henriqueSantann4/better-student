/**
 * Banco SQLite em memória para os testes, usando o `node:sqlite` embutido no
 * Node. Aplica todas as migrations, na ordem, como o app faz ao abrir.
 * Não é exportado pelo pacote: só os testes usam.
 */
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { Banco, ValorSql } from "./banco.ts";

const pasta = new URL("./migrations/", import.meta.url);

export function sqliteEmMemoria(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(arquivo, pasta), "utf8"));
  }
  return db;
}

/** Implementação de `Banco` sobre o `node:sqlite`. */
export function bancoEmMemoria(): Banco {
  const db = sqliteEmMemoria();
  return {
    async selecionar<T>(sql: string, parametros: ValorSql[] = []) {
      return db.prepare(sql).all(...parametros) as T[];
    },
    async executar(sql: string, parametros: ValorSql[] = []) {
      db.prepare(sql).run(...parametros);
    },
  };
}
