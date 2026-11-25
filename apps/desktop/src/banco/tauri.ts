import Database from "@tauri-apps/plugin-sql";
import type { Banco } from "@better-student/shared";

/** Mesmo nome registrado no `lib.rs` (constante BANCO). */
const ENDERECO = "sqlite:better-student.db";

/**
 * Banco de verdade, dentro do app Tauri. O `load` conecta ao arquivo e o
 * plugin roda as migrations pendentes antes de devolver a conexão.
 */
export async function abrirBancoTauri(): Promise<Banco> {
  const db = await Database.load(ENDERECO);
  return {
    selecionar: (sql, parametros = []) => db.select(sql, parametros),
    executar: async (sql, parametros = []) => {
      await db.execute(sql, parametros);
    },
  };
}
