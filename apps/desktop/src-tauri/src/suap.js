// Script injetado em TODAS as páginas da janela do SUAP (e só nela).
//
// Ele não lê nem guarda a senha: o login é feito pelo próprio usuário, na
// página real do SUAP (onde o reCAPTCHA funciona normalmente). Depois do
// login, ele busca o boletim do mesmo jeito que o site faz ao clicar na aba
// (endereço /edu/aluno/<matrícula>/boletins/) e entrega o HTML ao app pelo
// único comando que esta janela pode chamar: `entregar_suap`.
(function () {
  "use strict";
  if (window.top !== window) return; // ignora iframes

  var AVISO_ID = "better-student-aviso";

  function aviso(texto, tipo) {
    var caixa = document.getElementById(AVISO_ID);
    if (!caixa) {
      caixa = document.createElement("div");
      caixa.id = AVISO_ID;
      caixa.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;" +
        "font:14px/1.4 'Segoe UI',system-ui,sans-serif;color:#fff;text-align:center;" +
        "box-shadow:0 2px 8px rgba(0,0,0,.25)";
      document.body.appendChild(caixa);
    }
    caixa.style.background = tipo === "erro" ? "#c92a2a" : tipo === "ok" ? "#2b8a3e" : "#3b5bdb";
    caixa.textContent = "Better Student: " + texto;
  }

  function matriculaDaPagina() {
    var links = document.querySelectorAll('a[href*="/edu/aluno/"]');
    for (var i = 0; i < links.length; i++) {
      var achado = /\/edu\/aluno\/([^/?#]+)\//.exec(links[i].getAttribute("href") || "");
      if (achado) return decodeURIComponent(achado[1]);
    }
    return null;
  }

  async function buscarBoletim() {
    if (document.querySelector('input[type="password"]')) {
      aviso("entre com seu usuário e senha do SUAP. Depois disso, o boletim é buscado sozinho.");
      return;
    }
    var matricula = matriculaDaPagina();
    if (!matricula) {
      aviso("não encontrei seu cadastro de aluno nesta página. Abra o menu Ensino → Dados do Aluno.", "erro");
      return;
    }
    aviso("buscando seu boletim…");
    try {
      var resposta = await fetch("/edu/aluno/" + encodeURIComponent(matricula) + "/boletins/?tab=boletim", {
        credentials: "same-origin",
        headers: { "HX-Request": "true" },
      });
      var html = await resposta.text();
      if (!resposta.ok || html.indexOf("tabela_boletim") < 0) {
        throw new Error("o SUAP não devolveu o boletim (HTTP " + resposta.status + ")");
      }
      aviso("boletim encontrado! Voltando para o app…", "ok");
      await window.__TAURI_INTERNALS__.invoke("entregar_suap", { boletim: html });
    } catch (erro) {
      aviso("não consegui buscar o boletim: " + (erro && erro.message ? erro.message : erro), "erro");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buscarBoletim);
  } else {
    buscarBoletim();
  }
})();
