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

  // Roda só as migrations novas. O número da última aplicada fica no próprio
  // arquivo do SQLite (PRAGMA user_version), como o plugin do Tauri faz com a
  // tabela _sqlx_migrations.
  const versao = (db.exec("PRAGMA user_version")[0]?.values[0]?.[0] as number | undefined) ?? 0;
  // Bancos criados antes deste controle já têm a 0001, mas estão com versão 0.
  const jaTemTabelas = db.exec("SELECT 1 FROM sqlite_master WHERE name = 'semestre'").length > 0;
  const aplicadas = versao === 0 && jaTemTabelas ? 1 : versao;
  const pendentes = Object.keys(migrations).sort().slice(aplicadas);
  for (const caminho of pendentes) db.exec(migrations[caminho]!);
  const total = Object.keys(migrations).length;
  if (total !== versao) {
    db.exec(`PRAGMA user_version = ${total}`);
    salvar();
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
