import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import type { DiaSemana, EventoCalendario } from "../tipos.ts";
import { lerCalendarioSuap } from "../importacao/calendarioSuap.ts";
import { linhasDe } from "../importacao/html.ts";
import { normalizar } from "../importacao/boletimSuap.ts";
import { tipoSuspendeAulas } from "../banco/calendario.ts";
import type { SemestrePacote } from "../calendario/pacote.ts";
import { contarEncontros, fimDasAulas, planejarEncontros } from "./encontros.ts";

/** Converte um semestre lido (pacote ou SUAP) nos eventos que o banco guardaria. */
function eventosDe(s: SemestrePacote): EventoCalendario[] {
  return s.eventos.map((e, i) => ({
    id: String(i), criadoEm: "", atualizadoEm: "", excluidoEm: null, semestreId: "s", origem: "teste",
    tipo: e.tipo, titulo: e.titulo, dataInicio: e.inicio, dataFim: e.fim ?? e.inicio,
    suspendeAulas: tipoSuspendeAulas(e.tipo), segueDiaSemana: e.segueDiaSemana ?? null,
  }));
}
const em = (diaSemana: DiaSemana) => ({ diaSemana, excluidoEm: null });

describe("encontros (calendário de exemplo)", () => {
  const s = lerCalendarioSuap(readFileSync(new URL("../importacao/fixtures/calendario-suap.html", import.meta.url), "utf8"));
  const eventos = eventosDe(s);

  it("as aulas terminam na véspera da prova final", () => {
    assert.equal(fimDasAulas(s.fim, eventos), "2026-12-15");
  });

  it("tira feriados e soma sábados letivos com a grade do dia", () => {
    // Segundas de 28/07 a 15/12, menos 12/10 (feriado), sem sábados de segunda no exemplo.
    const segundas = contarEncontros([em(1)], eventos, s.inicio, fimDasAulas(s.fim, eventos));
    // Quartas: as quartas normais + o sábado letivo de 29/08, que segue a quarta.
    const quartas = contarEncontros([em(3)], eventos, s.inicio, fimDasAulas(s.fim, eventos));
    const quartasSemSabado = contarEncontros([em(3)], eventos.filter((e) => e.tipo !== "sabado_letivo"), s.inicio, fimDasAulas(s.fim, eventos));
    assert.equal(quartas, quartasSemSabado + 1);
    assert.equal(segundas, 20 - 1); // 20 segundas no período, uma é feriado
  });

  it("calcula aulas por encontro e quantos faltam", () => {
    const p = planejarEncontros(80, [em(2)], eventos, s, "2026-12-01");
    assert.equal(p.total, 20);
    assert.equal(p.aulasPorEncontro, 4);
    assert.equal(p.sugestao, 4);
    assert.equal(p.restantes, 3); // terças 01/12, 08/12 e 15/12
  });

  it("disciplina com dois encontros por semana divide o total entre os dois", () => {
    const p = planejarEncontros(80, [em(2), em(4)], eventos, s, "2026-07-01");
    assert.equal(p.total, p.restantes);
    assert.equal(p.sugestao, Math.round(80 / p.total));
  });

  it("sem grade, não há o que contar", () => {
    assert.deepEqual(planejarEncontros(80, [], eventos, s, "2026-08-01"), { total: 0, restantes: 0, aulasPorEncontro: null, sugestao: null });
  });
});

/**
 * Com o calendário REAL (se existir na pasta privada), a contagem de cada dia
 * da semana tem que bater com a tabela "Resumo" que o próprio SUAP mostra.
 * Os números vêm da página, não ficam escritos aqui.
 */
const amostraReal = new URL("../../../../amostras-privadas/calendario.html", import.meta.url);
describe("encontros x Resumo do SUAP (amostra real)", { skip: !existsSync(amostraReal) && "sem amostra local" }, () => {
  it("cada dia da semana tem o mesmo número de dias letivos que o SUAP informa", () => {
    const html = readFileSync(amostraReal, "utf8");
    const s = lerCalendarioSuap(html);
    const eventos = eventosDe(s);
    const resumo = /<h3>\s*Resumo\s*<\/h3>[\s\S]*?<table[\s\S]*?<\/table>/i.exec(html)![0];
    const celulas = linhasDe(resumo).flat().map((c) => c.texto);
    const dias: Record<string, DiaSemana> = { SEGUNDAS: 1, TERCAS: 2, QUARTAS: 3, QUINTAS: 4, SEXTAS: 5 };
    const ultimoDia = fimDasAulas(s.fim, eventos);
    const semSabados = eventos.filter((e) => e.tipo !== "sabado_letivo");

    for (let i = 0; i < celulas.length - 1; i++) {
      const chave = normalizar(celulas[i]!).split("-")[0]!;
      if (!(chave in dias)) continue;
      const esperado = Number(/(\d+)/.exec(celulas[i + 1]!)![1]);
      // O SUAP conta os dias da semana de calendário; sábados letivos aparecem à parte.
      assert.equal(contarEncontros([em(dias[chave]!)], semSabados, s.inicio, ultimoDia), esperado, celulas[i]!);
    }
  });
});
