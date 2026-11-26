import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./estilos.css";
import { App } from "./App";
import { Atualizador } from "./atualizacao";
import { aplicarTema, temaSalvo } from "./tema";

aplicarTema(temaSalvo(), false);

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento #root não encontrado");

createRoot(raiz).render(
  <StrictMode>
    <Atualizador>
      <App />
    </Atualizador>
  </StrictMode>,
);
