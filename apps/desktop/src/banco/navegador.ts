/**
 * Banco para o modo navegador (`pnpm dev:web`), SÓ EM DESENVOLVIMENTO.
 *
 * Usa o sql.js, que é o próprio SQLite compilado para WebAssembly, então as
 * mesmas migrations e consultas do app de verdade funcionam aqui. Os dados
 * ficam no localStorage do navegador.
 *
 * Este arquivo só é importado quando `import.meta.env.DEV` é verdadeiro, por
 * isso o sql.js nunca entra no instalador.
 */
import initSqlJs from "sql.js";
import urlWasm from "sql.js/dist/sql-wasm.wasm?url";
import type { Banco, ValorSql } from "@better-student/shared";

const CHAVE = "better-student:banco-dev";

// O Vite lê os .sql do pacote shared como texto, na ordem do nome.
const migrations = import.meta.glob<string>(
  "../../../../packages/shared/src/banco/migrations/*.sql",
  { query: "?raw", import: "default", eager: true },
);

function lerSalvo(): Uint8Array | null {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (!salvo) return null;
    return Uint8Array.from(atob(salvo), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function abrirBancoNavegador(): Promise<Banco> {
  const SQL = await initSqlJs({ locateFile: () => urlWasm });
  const salvo = lerSalvo();
  const db = salvo ? new SQL.Database(salvo) : new SQL.Database();
  db.exec("PRAGMA foreign_keys = ON;");

  if (!salvo) {
    for (const caminho of Object.keys(migrations).sort()) {
      db.exec(migrations[caminho]!);
    }
  }

  function salvar() {
    try {
      const bytes = db.export();
      let binario = "";
      for (const b of bytes) binario += String.fromCharCode(b);
      localStorage.setItem(CHAVE, btoa(binario));
    } catch {
      // Sem localStorage (janela anônima, por exemplo): segue só em memória.
    }
  }

  return {
    async selecionar<T>(sql: string, parametros: ValorSql[] = []) {
      const consulta = db.prepare(sql, parametros);
      const linhas: T[] = [];
      while (consulta.step()) linhas.push(consulta.getAsObject() as T);
      consulta.free();
      return linhas;
    },
    async executar(sql: string, parametros: ValorSql[] = []) {
      db.run(sql, parametros);
      salvar();
    },
  };
}
