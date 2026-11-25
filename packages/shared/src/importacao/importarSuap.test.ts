import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Banco } from "../banco/banco.ts";
import { bancoEmMemoria } from "../banco/memoria.ts";
import { semestres } from "../banco/semestres.ts";
import { disciplinas } from "../banco/disciplinas.ts";
import { faltas } from "../banco/faltas.ts";
import { calendario } from "../banco/calendario.ts";
import { lerPacoteCalendario, semestreDoPacote } from "../calendario/pacote.ts";
import { lerBoletimSuap } from "./boletimSuap.ts";
import { aplicarImportacao, periodoConfere, planejarImportacao, semestreDoBoletim } from "./importarSuap.ts";

const boletim = lerBoletimSuap(readFileSync(new URL("./fixtures/boletim-suap.html", import.meta.url), "utf8"));

describe("importação do boletim do SUAP", () => {
  let banco: Banco;
  let semestreId: string;

  beforeEach(async () => {
    banco = bancoEmMemoria();
    semestreId = (await semestres.criar(banco, { nome: "2026.2", inicio: "2026-08-03", fim: "2026-12-18" })).id;
  });

  it("casa pelo nome sem acento e cria as que faltam", async () => {
    await disciplinas.criar(banco, semestreId, { nome: "banco de dados i", totalAulas: 80 });
    const plano = planejarImportacao(boletim, await disciplinas.listar(banco, semestreId));
    assert.deepEqual(
      plano.map((p) => p.existente?.nome ?? null),
      [null, "banco de dados i", null],
    );

    const r = await aplicarImportacao(banco, semestreId, boletim, plano, ["#111111"]);
    assert.deepEqual(r, { criadas: 2, atualizadas: 1, ignoradas: [] });
  });

  it("atualiza o total de aulas e grava o retrato do SUAP", async () => {
    await aplicarImportacao(banco, semestreId, boletim, planejarImportacao(boletim, []));
    const bd = (await disciplinas.listar(banco, semestreId)).find((d) => d.suap?.codigo === "XYZBD1");
    assert.equal(bd?.totalAulas, 100);
    assert.equal(bd?.suap?.faltas, 25);
    assert.equal(bd?.suap?.aulasCumpridas, 85);
    assert.equal(bd?.suap?.atualizadoEm, "2026-11-25T10:46");
    assert.ok(bd?.suap?.importadoEm);

    const ingles = (await disciplinas.listar(banco, semestreId)).find((d) => d.suap?.codigo === "XYZING");
    assert.deepEqual([ingles?.suap?.naf, ingles?.suap?.mfd], [7, 6]);
    assert.deepEqual(ingles?.suap?.etapas, [{ numero: 1, nota: 4.5, faltas: 2 }]);
  });

  it("importar de novo não duplica: casa pelo código gravado", async () => {
    await aplicarImportacao(banco, semestreId, boletim, planejarImportacao(boletim, []));
    // Mesmo se o usuário renomear a disciplina no app.
    const [primeira] = await disciplinas.listar(banco, semestreId);
    await disciplinas.atualizar(banco, primeira!.id, { ...primeira!, nome: "Outro nome" });

    const plano = planejarImportacao(boletim, await disciplinas.listar(banco, semestreId));
    const r = await aplicarImportacao(banco, semestreId, boletim, plano);
    assert.deepEqual(r, { criadas: 0, atualizadas: 3, ignoradas: [] });
    assert.equal((await disciplinas.listar(banco, semestreId)).length, 3);
  });

  it("não mexe nas faltas registradas no app", async () => {
    const id = await disciplinas.criar(banco, semestreId, { nome: "Banco de Dados I", totalAulas: 100 });
    await faltas.registrar(banco, { disciplinaId: id, data: "2026-11-24", horarioAulaId: null, quantidadeAulas: 4 });
    await aplicarImportacao(banco, semestreId, boletim, planejarImportacao(boletim, await disciplinas.listar(banco, semestreId)));
    assert.equal((await faltas.listarDoSemestre(banco, semestreId)).length, 1);
  });

  it("confere o período do boletim com o nome do semestre", () => {
    assert.equal(periodoConfere(boletim, { nome: "2026.2" }), true);
    assert.equal(periodoConfere(boletim, { nome: "2026/1" }), false);
    assert.equal(periodoConfere(boletim, { nome: "Segundo semestre" }), null);
  });

  it("começar pelo SUAP: cria o semestre do boletim com datas estimadas", async () => {
    const novo = await semestres.criar(bancoEmMemoria(), semestreDoBoletim(boletim));
    assert.equal(novo.nome, "2026.2");
    assert.deepEqual([novo.inicio, novo.fim, novo.datasEstimadas], ["2026-08-01", "2026-12-20", true]);
  });

  it("boletim sem período usa o período da data de hoje", () => {
    const semPeriodo = { ...boletim, periodo: null };
    assert.equal(semestreDoBoletim(semPeriodo, new Date(2027, 2, 10)).nome, "2027.1");
  });

  it("editar as datas tira a marca de estimadas", async () => {
    const b = bancoEmMemoria();
    const s = await semestres.criar(b, semestreDoBoletim(boletim));
    await semestres.atualizar(b, s.id, { nome: "2026.2", inicio: "2026-08-04", fim: "2026-12-12" });
    const editado = await semestres.atual(b);
    assert.deepEqual([editado?.inicio, editado?.datasEstimadas], ["2026-08-04", false]);
  });

  it("calendário do campus: grava os eventos, acerta as datas e não duplica", async () => {
    const pacote = lerPacoteCalendario(JSON.parse(readFileSync(new URL("../../calendarios/ifsp-votuporanga-superiores-2026.json", import.meta.url), "utf8")));
    const b = bancoEmMemoria();
    const s = await semestres.criar(b, semestreDoBoletim(boletim));
    const dados = semestreDoPacote(pacote, { ano: 2026, periodo: 2 })!;
    await calendario.aplicarPacote(b, s, pacote.id, dados);
    await calendario.aplicarPacote(b, (await semestres.atual(b))!, pacote.id, dados);

    const eventos = await calendario.listar(b, s.id);
    assert.equal(eventos.length, dados.eventos.length);
    const atual = await semestres.atual(b);
    assert.deepEqual([atual?.inicio, atual?.fim, atual?.datasEstimadas], ["2026-07-28", "2026-12-17", false]);
    assert.equal(eventos.find((e) => e.dataInicio === "2026-11-14")?.segueDiaSemana, 1);
    assert.equal(eventos.find((e) => e.titulo === "Finados")?.suspendeAulas, true);
  });
});
