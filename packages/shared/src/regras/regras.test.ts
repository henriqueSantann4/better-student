import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { REGRAS_PADRAO_IFSP, type Avaliacao, type Falta } from "../tipos.ts";
import { calcularMedia } from "./notas.ts";
import { encontrosRestantes, nivelFaltas, resumirFaltas } from "./faltas.ts";
import { calcularSituacao, type EntradaSituacao } from "./situacao.ts";

const registro = { criadoEm: "", atualizadoEm: "", excluidoEm: null };

function avaliacao(nota: number | null, peso = 1, notaMaxima = 10): Avaliacao {
  return { ...registro, id: crypto.randomUUID(), disciplinaId: "d", nome: "", peso, nota, notaMaxima, data: null, tarefaId: null };
}

function falta(quantidadeAulas: number, excluidoEm: string | null = null): Falta {
  return { ...registro, excluidoEm, id: crypto.randomUUID(), disciplinaId: "d", data: "2026-11-24", horarioAulaId: null, quantidadeAulas, observacao: null };
}

describe("calcularMedia", () => {
  it("sem avaliações não tem média", () => {
    assert.deepEqual(calcularMedia([]), { media: null, completa: false });
  });

  it("faz a média ponderada pelos pesos", () => {
    const r = calcularMedia([avaliacao(8, 2), avaliacao(5, 1)]);
    assert.equal(r.media, 7); // (8×2 + 5×1) ÷ 3
    assert.equal(r.completa, true);
  });

  it("normaliza notas de escalas diferentes para 0–10", () => {
    // 4 de 5 pontos = 8,0; média com um 6 → 7
    assert.equal(calcularMedia([avaliacao(4, 1, 5), avaliacao(6)]).media, 7);
  });

  it("ignora notas que não saíram e marca a média como parcial", () => {
    const r = calcularMedia([avaliacao(9), avaliacao(null)]);
    assert.equal(r.media, 9);
    assert.equal(r.completa, false);
  });

  it("ignora avaliações excluídas", () => {
    const excluida = { ...avaliacao(0), excluidoEm: "2026-11-24T00:00:00Z" };
    assert.deepEqual(calcularMedia([avaliacao(7), excluida]), { media: 7, completa: true });
  });
});

describe("resumirFaltas", () => {
  const regras = REGRAS_PADRAO_IFSP;

  it("Projeto de Extensão 1: 100 aulas → limite de 25", () => {
    const r = resumirFaltas({ totalAulas: 100, frequenciaMinima: null }, [falta(4), falta(4)], regras);
    assert.equal(r.faltas, 8);
    assert.equal(r.limite, 25);
    assert.equal(r.restantes, 17);
    assert.equal(r.frequencia, 0.92);
    assert.equal(r.reprovadoPorFalta, false);
  });

  it("arredonda o limite para baixo (70 aulas → 17, não 17,5)", () => {
    assert.equal(resumirFaltas({ totalAulas: 70, frequenciaMinima: null }, [], regras).limite, 17);
  });

  it("não erra por ponto flutuante (100 aulas, 80% → 20)", () => {
    // (1 − 0.8) × 100 = 19.999999999999996 em ponto flutuante
    assert.equal(resumirFaltas({ totalAulas: 100, frequenciaMinima: 0.8 }, [], regras).limite, 20);
  });

  it("a frequência da disciplina vence a do semestre", () => {
    assert.equal(resumirFaltas({ totalAulas: 100, frequenciaMinima: 0.9 }, [], regras).limite, 10);
  });

  it("chegar exatamente no limite não reprova; passar dele reprova", () => {
    const d = { totalAulas: 100, frequenciaMinima: null };
    assert.equal(resumirFaltas(d, [falta(25)], regras).reprovadoPorFalta, false);
    const r = resumirFaltas(d, [falta(25), falta(1)], regras);
    assert.equal(r.reprovadoPorFalta, true);
    assert.equal(r.restantes, 0);
  });

  it("ignora faltas excluídas", () => {
    const r = resumirFaltas({ totalAulas: 100, frequenciaMinima: null }, [falta(4), falta(4, "2026-11-24T00:00:00Z")], regras);
    assert.equal(r.faltas, 4);
  });
});

describe("encontrosRestantes", () => {
  it("conta só encontros inteiros", () => {
    assert.equal(encontrosRestantes(25, 4), 6);
    assert.equal(encontrosRestantes(3, 4), 0);
  });

  it("encontro sem aulas não divide por zero", () => {
    assert.equal(encontrosRestantes(25, 0), 0);
  });
});

describe("nivelFaltas", () => {
  const d = { totalAulas: 100, frequenciaMinima: null };
  const nivel = (aulas: number, porEncontro = 0) =>
    nivelFaltas(resumirFaltas(d, aulas ? [falta(aulas)] : [], REGRAS_PADRAO_IFSP), porEncontro);

  it("tranquilo com poucas faltas", () => assert.equal(nivel(8, 4), "ok"));
  it("atenção a partir de 75% do limite", () => assert.equal(nivel(19), "atencao"));
  it("atenção se mais um encontro estoura o limite", () => assert.equal(nivel(16, 10), "atencao"));
  it("reprovado depois do limite", () => assert.equal(nivel(26), "reprovado"));
});

describe("calcularSituacao", () => {
  const base: EntradaSituacao = {
    media: null,
    mediaCompleta: true,
    reprovadoPorFalta: false,
    notaIfa: null,
    regras: REGRAS_PADRAO_IFSP,
  };

  it("média 6 aprova (inclusive com erro de ponto flutuante)", () => {
    assert.deepEqual(calcularSituacao({ ...base, media: 6 }), { situacao: "aprovado", mediaFinal: 6 });
    assert.equal(calcularSituacao({ ...base, media: 5.9999999999999 }).situacao, "aprovado");
  });

  it("média abaixo de 4 reprova direto", () => {
    assert.equal(calcularSituacao({ ...base, media: 3.9 }).situacao, "reprovado_nota");
  });

  it("média entre 4 e 6 vai para o IFA", () => {
    assert.deepEqual(calcularSituacao({ ...base, media: 4 }), { situacao: "ifa", mediaFinal: null });
    assert.equal(calcularSituacao({ ...base, media: 5.5 }).situacao, "ifa");
  });

  it("passou no IFA: média final limitada a 6", () => {
    assert.deepEqual(calcularSituacao({ ...base, media: 5, notaIfa: 9 }), { situacao: "aprovado_ifa", mediaFinal: 6 });
  });

  it("não passou no IFA: reprova com a média original", () => {
    assert.deepEqual(calcularSituacao({ ...base, media: 5, notaIfa: 3 }), { situacao: "reprovado_ifa", mediaFinal: 5 });
  });

  it("falta reprova mesmo com média 10", () => {
    assert.equal(calcularSituacao({ ...base, media: 10, reprovadoPorFalta: true }).situacao, "reprovado_falta");
  });

  it("com notas faltando, fica em andamento", () => {
    assert.deepEqual(calcularSituacao({ ...base, media: 10, mediaCompleta: false }), { situacao: "em_andamento", mediaFinal: null });
  });

  it("usa as regras do semestre, não valores fixos", () => {
    const regras = { ...REGRAS_PADRAO_IFSP, mediaAprovacao: 7 };
    assert.equal(calcularSituacao({ ...base, media: 6.5, regras }).situacao, "ifa");
  });
});
