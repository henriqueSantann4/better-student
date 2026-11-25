import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { REGRAS_PADRAO_IFSP, type Avaliacao, type DadosSuap } from "../tipos.ts";
import { mediaNecessaria, notaDaDisciplina } from "./notas.ts";

const registro = { criadoEm: "", atualizadoEm: "", excluidoEm: null };

function avaliacao(nota: number | null, peso = 1, notaMaxima = 10): Avaliacao {
  return { ...registro, id: crypto.randomUUID(), disciplinaId: "d", nome: "", peso, nota, notaMaxima, data: null, tarefaId: null };
}

function suap(dados: Partial<DadosSuap>): DadosSuap {
  return {
    codigo: null, diario: null, aulasCumpridas: null, faltas: null, frequencia: null, situacao: null,
    etapas: [{ numero: 1, nota: null, faltas: null }], media: null, naf: null, mfd: null,
    atualizadoEm: null, importadoEm: "2026-11-25T10:00", ...dados,
  };
}

describe("mediaNecessaria", () => {
  it("sem avaliação pendente não há o que calcular", () => {
    assert.equal(mediaNecessaria([avaliacao(7)], 6), null);
  });

  it("considera os pesos: P1 = 4 (peso 1), falta P2 (peso 2) para média 6 → 7", () => {
    assert.equal(mediaNecessaria([avaliacao(4), avaliacao(null, 2)], 6), 7);
  });

  it("dá ≤ 0 quando já está garantido e > 10 quando não dá mais", () => {
    assert.ok(mediaNecessaria([avaliacao(10, 3), avaliacao(null)], 6)! <= 0);
    assert.ok(mediaNecessaria([avaliacao(0, 3), avaliacao(null)], 6)! > 10);
  });
});

describe("notaDaDisciplina", () => {
  const regras = REGRAS_PADRAO_IFSP;

  it("sem nada lançado fica em andamento, sem fonte", () => {
    const r = notaDaDisciplina({ suap: null, notaIfa: null }, [], regras, false);
    assert.equal(r.fonte, null);
    assert.equal(r.situacao, "em_andamento");
  });

  it("antes da nota do SUAP, usa as avaliações do app e diz quanto falta", () => {
    const r = notaDaDisciplina({ suap: suap({}), notaIfa: null }, [avaliacao(5), avaliacao(null)], regras, false);
    assert.equal(r.fonte, "app");
    assert.equal(r.media, 5);
    assert.equal(r.precisa, 7);
    assert.equal(r.situacao, "em_andamento");
  });

  it("a nota da etapa no SUAP vence as anotações do app", () => {
    const disciplina = { suap: suap({ etapas: [{ numero: 1, nota: 5.4, faltas: 2 }], media: 5.4 }), notaIfa: null };
    const r = notaDaDisciplina(disciplina, [avaliacao(9)], regras, false);
    assert.equal(r.fonte, "suap");
    assert.equal(r.media, 5.4);
    assert.equal(r.situacao, "ifa");
    assert.equal(r.precisa, null);
  });

  it("IFA anotado no app aprova com média limitada ao teto", () => {
    const disciplina = { suap: suap({ etapas: [{ numero: 1, nota: 5, faltas: 0 }], media: 5 }), notaIfa: 8 };
    const r = notaDaDisciplina(disciplina, [], regras, false);
    assert.equal(r.situacao, "aprovado_ifa");
    assert.equal(r.mediaFinal, 6);
  });

  it("com a MFD do SUAP, a média final é a dele", () => {
    const disciplina = { suap: suap({ etapas: [{ numero: 1, nota: 5, faltas: 0 }], media: 5, naf: 7, mfd: 6 }), notaIfa: null };
    const r = notaDaDisciplina(disciplina, [], regras, false);
    assert.equal(r.notaIfa, 7);
    assert.equal(r.mediaFinal, 6);
    assert.equal(r.situacao, "aprovado_ifa");
  });

  it("reprovação por falta vem antes da nota", () => {
    const r = notaDaDisciplina({ suap: null, notaIfa: null }, [avaliacao(10)], regras, true);
    assert.equal(r.situacao, "reprovado_falta");
  });
});
