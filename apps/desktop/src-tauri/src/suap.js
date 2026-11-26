// Script injetado em TODAS as páginas da janela do SUAP (e só nela).
//
// Ele não lê nem guarda a senha: o login é feito pelo próprio usuário, na
// página real do SUAP (onde o reCAPTCHA funciona normalmente). Depois do
// login, ele busca o boletim, os horários de aula, o calendário acadêmico e o
// "Detalhar" de cada disciplina do mesmo jeito que o site faz ao clicar, e entrega o HTML ao app pelo
// único comando que esta janela pode chamar: `entregar_suap`.
(function () {
  "use strict";
  if (window.top !== window) return; // ignora iframes

  var AVISO_ID = "better-student-aviso";
  // Janela escondida, aberta pelo app para atualizar sozinho (ver `abrir_suap`).
  var SILENCIOSO = window.__BETTER_STUDENT_SILENCIOSO__ === true;
  // Busca completa (horários, calendário, critérios das turmas) ou só o que muda.
  var COMPLETO = window.__BETTER_STUDENT_COMPLETO__ !== false;

  /** Na janela escondida, quando não dá para seguir: avisa o app, que fecha a janela. */
  function desistir(motivo) {
    window.__TAURI_INTERNALS__.invoke("suap_sem_sessao", { motivo: String(motivo) }).catch(function () {});
  }

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
      // A sessão expirou: o login é sempre feito pelo usuário, na janela visível.
      if (SILENCIOSO) return desistir("login");
      aviso("entre com seu usuário e senha do SUAP. Depois disso, o boletim é buscado sozinho.");
      return;
    }
    var matricula = matriculaDaPagina();
    if (!matricula) {
      if (SILENCIOSO) return desistir("sem_matricula");
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
      aviso("boletim encontrado! Procurando seus horários de aula e o calendário acadêmico…");
      // Horários e calendário são bônus: se não der para achar, o boletim vai do mesmo jeito.
      var nada = function () {
        return null;
      };
      var horarios = COMPLETO ? await buscarHorarios(matricula).catch(nada) : null;
      var calendario = COMPLETO ? await buscarCalendario(periodoDoBoletim(html)).catch(nada) : null;
      if (COMPLETO) aviso("buscando os critérios de avaliação das disciplinas…");
      var turmas = COMPLETO
        ? await buscarCriterios(html).catch(function () {
            return [];
          })
        : [];
      aviso("buscando o detalhamento das notas…");
      var detalhes = await buscarDetalhes(html).catch(function () {
        return [];
      });
      var achados = ["boletim"];
      if (horarios) achados.push("horários");
      if (calendario) achados.push("calendário");
      if (detalhes.length) achados.push("notas detalhadas");
      if (turmas.length) achados.push("critérios de avaliação");
      aviso(achados.join(", ").replace(/, ([^,]*)$/, " e $1") + " encontrados! Voltando para o app…", "ok");
      await window.__TAURI_INTERNALS__.invoke("entregar_suap", {
        boletim: html,
        horarios: horarios,
        calendario: calendario,
        detalhes: detalhes,
        turmas: turmas,
      });
    } catch (erro) {
      var mensagem = erro && erro.message ? erro.message : erro;
      if (SILENCIOSO) return desistir(mensagem);
      aviso("não consegui buscar o boletim: " + mensagem, "erro");
    }
  }

  /**
   * Aba "Locais e Horários de Aula", buscada como o site faz ao clicar nela
   * (o quadro de horários por turno e a lista de diários com as salas).
   */
  async function buscarHorarios(matricula) {
    var resposta = await fetch("/edu/aluno/" + encodeURIComponent(matricula) + "/locais-aula/", {
      credentials: "same-origin",
      headers: { "HX-Request": "true" },
    });
    var html = await resposta.text();
    return resposta.ok && /data-hint|Segunda/.test(html) ? html : null;
  }

  /**
   * O "Detalhar" de cada disciplina do boletim (as avaliações de cada etapa).
   * O número do diário, na primeira coluna da linha, diz de qual disciplina é.
   */
  async function buscarDetalhes(htmlBoletim) {
    var pagina = new DOMParser().parseFromString(htmlBoletim, "text/html");
    var links = pagina.querySelectorAll('a[href*="/edu/detalhar_matricula_diario_boletim/"]');
    var detalhes = [];
    for (var i = 0; i < links.length && i < 40; i++) {
      var linha = links[i].closest("tr");
      var diario = linha && linha.cells[0] ? linha.cells[0].textContent.trim() : "";
      if (!/^\d+$/.test(diario)) continue;
      var caminho = new URL(links[i].getAttribute("href"), location.origin).pathname;
      var resposta = await fetch(caminho, { credentials: "same-origin" });
      var html = await resposta.text();
      if (resposta.ok && html.indexOf("Detalhamento das Notas") >= 0) detalhes.push({ diario: diario, html: html });
    }
    return detalhes;
  }

  /**
   * Da Turma Virtual de cada disciplina (link no boletim), só a seção
   * "Instrumentos e Critérios de Avaliação da Aprendizagem" do plano de
   * ensino. O resto da página (lista de colegas etc.) não sai daqui.
   * Página aberta sem a seção = o professor não preencheu: vai vazia.
   */
  async function buscarCriterios(htmlBoletim) {
    var pagina = new DOMParser().parseFromString(htmlBoletim, "text/html");
    var vistos = {};
    var turmas = [];
    var links = pagina.querySelectorAll('a[href*="/edu/sala_virtual/"]');
    for (var i = 0; i < links.length && turmas.length < 40; i++) {
      var achado = /\/edu\/sala_virtual\/(\d+)\//.exec(links[i].getAttribute("href") || "");
      if (!achado || vistos[achado[1]]) continue;
      vistos[achado[1]] = true;
      var resposta = await fetch("/edu/sala_virtual/" + achado[1] + "/?tab=dados_gerais", { credentials: "same-origin" });
      if (!resposta.ok) continue;
      var doc = new DOMParser().parseFromString(await resposta.text(), "text/html");
      var secao = "";
      doc.querySelectorAll("h3").forEach(function (h) {
        if (!secao && /Instrumentos\s+e\s+Crit/i.test(h.textContent || "")) {
          secao = (h.closest(".box") || h.parentElement).outerHTML;
        }
      });
      turmas.push({ diario: achado[1], html: secao });
    }
    return turmas;
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
