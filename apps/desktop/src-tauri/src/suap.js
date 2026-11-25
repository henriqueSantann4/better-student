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
      aviso("boletim encontrado! Procurando o calendário acadêmico…");
      // O calendário é um bônus: se não der para achar, o boletim vai do mesmo jeito.
      var calendario = await buscarCalendario(periodoDoBoletim(html)).catch(function () {
        return null;
      });
      aviso(calendario ? "boletim e calendário encontrados! Voltando para o app…" : "boletim encontrado! Voltando para o app…", "ok");
      await window.__TAURI_INTERNALS__.invoke("entregar_suap", { boletim: html, calendario: calendario });
    } catch (erro) {
      aviso("não consegui buscar o boletim: " + (erro && erro.message ? erro.message : erro), "erro");
    }
  }

  /** Período do boletim, ex.: { ano: "2026", periodo: "2" }. */
  function periodoDoBoletim(html) {
    var titulo = /Boletim\s*-\s*(\d{4})\s*\/\s*(\d)/i.exec(html);
    if (titulo) return { ano: titulo[1], periodo: titulo[2] };
    var opcao = /<option\b(?=[^>]*\bselected\b)[^>]*value=["'](\d{4})_(\d)["']/i.exec(html);
    return opcao ? { ano: opcao[1], periodo: opcao[2] } : null;
  }

  /**
   * Faz o mesmo caminho que o aluno: abre o "Calendário de Eventos", procura
   * os links para calendários acadêmicos e fica com o do período do boletim
   * (preferindo o de cursos superiores, se houver mais de um).
   */
  async function buscarCalendario(periodo) {
    if (!periodo) return null;
    var resposta = await fetch("/eventos/calendario_eventos/", { credentials: "same-origin" });
    if (!resposta.ok) return null;
    var pagina = new DOMParser().parseFromString(await resposta.text(), "text/html");
    var marcas = [periodo.ano + "/" + periodo.periodo, periodo.ano + "." + periodo.periodo];
    var melhor = null;
    var melhorNota = 0;
    pagina.querySelectorAll('a[href*="/edu/calendarioacademico/"]').forEach(function (link) {
      // O texto do link e o da linha/item em volta ("[6399] Cursos Superiores - 2026/2 ...").
      var texto = (link.textContent + " " + ((link.closest("tr, li, div") || link).textContent || "")).toLowerCase();
      var nota = 0;
      if (marcas.some(function (m) { return texto.indexOf(m) >= 0; })) nota += 2;
      if (texto.indexOf("superior") >= 0) nota += 1;
      if (nota >= 2 && nota > melhorNota) {
        melhorNota = nota;
        melhor = link.getAttribute("href");
      }
    });
    if (!melhor) return null;
    var calendario = await fetch(new URL(melhor, location.origin).pathname, { credentials: "same-origin" });
    var htmlCalendario = await calendario.text();
    return calendario.ok && htmlCalendario.indexOf("calendario-referencia") >= 0 ? htmlCalendario : null;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buscarBoletim);
  } else {
    buscarBoletim();
  }
})();
