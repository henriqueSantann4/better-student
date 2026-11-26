import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { lerCriteriosAvaliacao } from "./criteriosSuap.ts";

const fixture = readFileSync(new URL("./fixtures/turma-virtual-criterios.html", import.meta.url), "utf8");

describe("critérios de avaliação da Turma Virtual", () => {
  it("lê só a seção dos critérios, com um parágrafo por linha", () => {
    assert.equal(
      lerCriteriosAvaliacao(fixture),
      "Serão aplicadas duas provas (P1 e P2), valendo 4 pontos cada, e uma lista (L) de 2 pontos. Nota Final = P1 + P2 + L\nQuem não atingir 6,0 vai para o IFA.",
    );
  });

  it("seção vazia vira texto vazio; página sem a seção, null", () => {
    assert.equal(lerCriteriosAvaliacao('<div class="box"><h3>Instrumentos e Critérios de Avaliação da Aprendizagem</h3><div><p></p></div></div>'), "");
    assert.equal(lerCriteriosAvaliacao("<h3>Outra coisa</h3>"), null);
  });

  it("lê a página salva de verdade, se existir (amostra privada)", { skip: !amostra() }, () => {
    const texto = lerCriteriosAvaliacao(amostra()!);
    assert.ok(texto && texto.length > 20);
  });
});

/** A Turma Virtual salva em amostras-privadas/ (fora do git), se existir. */
function amostra(): string | null {
  const pasta = new URL("../../../../amostras-privadas/", import.meta.url);
  if (!existsSync(pasta)) return null;
  const nome = readdirSync(pasta).find((n) => n.startsWith("Turma Virtual") && n.endsWith(".html"));
  return nome ? readFileSync(new URL(encodeURIComponent(nome), pasta), "utf8") : null;
}
