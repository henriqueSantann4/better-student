import { isTauri } from "@tauri-apps/api/core";
import type { Banco } from "@better-student/shared";
import { abrirBancoTauri } from "./tauri.ts";

/**
 * Abre o banco certo para o ambiente: o arquivo SQLite de verdade dentro do
 * Tauri, ou o banco de desenvolvimento no navegador.
 *
 * O `import()` dinâmico + `import.meta.env.DEV` faz o Vite descartar o
 * banco do navegador (e o sql.js) no build de produção.
 */
export async function abrirBanco(): Promise<Banco> {
  if (isTauri()) return abrirBancoTauri();
  if (import.meta.env.DEV) {
    const { abrirBancoNavegador } = await import("./navegador.ts");
    return abrirBancoNavegador();
  }
  throw new Error("Banco indisponível fora do app.");
}
