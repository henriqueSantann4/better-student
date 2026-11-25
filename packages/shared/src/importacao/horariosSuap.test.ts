import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { ErroHorariosSuap, lerHorariosSuap } from "./horariosSuap.ts";
import { disciplinaDoEncontro, importarHorarios } from "./importarHorarios.ts";
import { bancoEmMemoria } from "../banco/memoria.ts";
import { disciplinas, horarios, semestres } from "../banco/index.ts";

const exemplo = readFileSync(new URL("./fixtures/horarios-suap.html", import.meta.url), "utf8");

describe("lerHorariosSuap (página de exemplo)", () => {
  const grade = lerHorariosSuap(exemplo);
  const resumo = grade.encontros.map((e) => `${e.diaSemana} ${e.inicio}-${e.fim} ${e.quantidadeAulas} ${e.codigo}`);

  it("lê o período escolhido no filtro", () => {
    assert.deepEqual(grade.periodo, { ano: 2026, periodo: 2 });
  });

  it("junta aulas seguidas num encontro, mesmo com intervalo no meio", () => {
    assert.ok(resumo.includes("1 07:00-09:45 3 XYZALP1"));
  });

  it("separa disciplinas diferentes no mesmo dia e lê os turnos da noite", () => {
    assert.deepEqual(resumo, [
      "1 07:00-09:45 3 XYZALP1",
      "3 07:00-08:40 2 XYZBD1",
      "3 08:55-10:35 2 XYZING",
      // Conflito (duas disciplinas na célula): não emenda com o encontro anterior de BD.
      "3 09:45-10:35 1 XYZBD1",
      "5 19:00-19:50 1 XYZALP1",
    ]);
  });

  it("traz nome formatado, sala, professor e diário da lista de diários", () => {
    const alg = grade.encontros[0]!;
    assert.equal(alg.nome, "Algoritmos e Lógica de Programação");
    assert.equal(alg.sala, "LAB-01");
    assert.equal(alg.professor, "Fulano de Tal");
    assert.equal(alg.diario, "100001");
    const ingles = grade.encontros.find((e) => e.codigo === "XYZING")!;
    assert.equal(ingles.sala, null);
  });

  it("recusa página sem quadro de horários", () => {
    assert.throws(() => lerHorariosSuap("<html><table><tr><td>x</td></tr></table></html>"), ErroHorariosSuap);
  });
});

describe("importarHorarios", () => {
  it("casa pelo código do SUAP, substitui os horários e preenche o professor", async () => {
    const banco = bancoEmMemoria();
    const semestre = await semestres.criar(banco, { nome: "2026.2", inicio: "2026-08-03", fim: "2026-12-12" });
    const alg = await disciplinas.criar(banco, semestre.id, { nome: "Algoritmos", totalAulas: 80 });
    await disciplinas.gravarSuap(banco, alg, {
      codigo: "XYZALP1", diario: null, aulasCumpridas: null, faltas: null, frequencia: null,
      situacao: null, etapas: [], media: null, naf: null, mfd: null, atualizadoEm: null,
    });
    await disciplinas.criar(banco, semestre.id, { nome: "Banco de Dados I", totalAulas: 40 });
    await horarios.criar(banco, { disciplinaId: alg, diaSemana: 2, inicio: "10:00", fim: "11:00", quantidadeAulas: 1 });

    const grade = lerHorariosSuap(exemplo);
    const primeira = await importarHorarios(banco, semestre.id, grade);
    assert.equal(primeira.gravados, 4);
    assert.deepEqual(primeira.semDisciplina, ["Inglês Instrumental para a Computação"]);

    // Reimportar não duplica.
    await importarHorarios(banco, semestre.id, grade);
    const lista = await horarios.listarDoSemestre(banco, semestre.id);
    assert.equal(lista.length, 4);
    assert.ok(!lista.some((h) => h.diaSemana === 2), "o horário antigo foi substituído");
    assert.equal(lista.find((h) => h.diaSemana === 1)?.sala, "LAB-01");

    const [, algAtual] = (await disciplinas.listar(banco, semestre.id)).sort((a, b) => a.nome.localeCompare(b.nome)).reverse();
    assert.equal(algAtual?.professor, "Fulano de Tal");
  });

  it("sem código, casa pelo nome", () => {
    const [encontro] = lerHorariosSuap(exemplo).encontros;
    const d = { id: "1", nome: "ALGORITMOS E LOGICA DE PROGRAMACAO", sigla: null, suap: null } as never;
    assert.equal(disciplinaDoEncontro(encontro!, [d]), d);
  });
});

/**
 * Teste extra com a página REAL, se existir em amostras-privadas/ (fora do
 * git). Só confere que ainda dá para ler, sem olhar valores pessoais.
 */
const amostraReal = new URL("../../../../amostras-privadas/locais-aula.html", import.meta.url);
describe("horários reais (amostras-privadas)", { skip: !existsSync(amostraReal) && "sem amostra local" }, () => {
  it("lê encontros com dia, hora e quantidade de aulas", () => {
    const grade = lerHorariosSuap(readFileSync(amostraReal, "utf8"));
    assert.ok(grade.encontros.length > 0);
    for (const e of grade.encontros) {
      assert.match(e.inicio, /^\d{2}:\d{2}$/);
      assert.ok(e.quantidadeAulas >= 1);
      assert.ok(e.codigo);
    }
  });
});
