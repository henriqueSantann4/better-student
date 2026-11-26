// Script injetado nas páginas da janela de login do Moodle (e só nela).
//
// No IFSP o login do Moodle é um botão "SUAP IFSP" (OAuth). Este script só
// CLICA nesse botão quando a página de login aparece, para o aluno não ter de
// clicar: se a sessão do SUAP ainda vale, o SUAP devolve direto ao Moodle e o
// Moodle entrega a chave ao app. Ele não lê nem preenche nada, e a janela não
// tem permissão para chamar comandos do app (quem age é o Rust, olhando os
// endereços visitados).
(function () {
  "use strict";
  if (window.top !== window) return;

  function clicarNoSuap() {
    if (!/\/login\/index\.php/.test(location.pathname)) return;
    // Uma tentativa por janela: se o login pelo SUAP falhar e voltar para
    // esta página, o aluno decide o que fazer (evita ficar em ciclo).
    try {
      if (sessionStorage.getItem("better-student-clicou")) return;
    } catch (e) {
      return;
    }
    var botoes = Array.prototype.slice.call(document.querySelectorAll('a[href*="/auth/oauth2/login.php"]'));
    var suap =
      botoes.filter(function (a) {
        return /suap/i.test((a.textContent || "") + " " + (a.title || ""));
      })[0] || (botoes.length === 1 ? botoes[0] : null);
    if (!suap) return;
    try {
      sessionStorage.setItem("better-student-clicou", "1");
    } catch (e) {
      return;
    }
    suap.click();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", clicarNoSuap);
  } else {
    clicarNoSuap();
  }
})();
