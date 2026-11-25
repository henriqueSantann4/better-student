import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuração recomendada pelo Tauri 2: porta fixa e sem limpar a tela,
// para os logs do Rust continuarem visíveis no terminal.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // A pasta do Rust não é da interface: quem vigia ela é o próprio Tauri.
      // Sem isso, o Vite tenta vigiar os arquivos que o Cargo está gravando em
      // src-tauri/target e, no Windows, recebe EBUSY (arquivo travado).
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
