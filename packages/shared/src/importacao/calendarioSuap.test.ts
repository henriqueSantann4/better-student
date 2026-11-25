import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { diaSemanaDe } from "../datas.ts";
import { ErroCalendarioSuap, lerCalendarioSuap } from "./calendarioSuap.ts";

const exemplo = readFileSync(new URL("./fixtures/calendario-suap.html", import.meta.url), "utf8");

describe("lerCalendarioSuap (calendário de exemplo)", () => {
  const s = lerCalendarioSuap(exemplo);
  const porTitulo = (t: string) => s.eventos.find((e) => e.titulo.startsWith(t));

  it("lê o período e usa a etapa e o fechamento como início e fim", () => {
    assert.deepEqual([s.periodo, s.inicio, s.fim], ["2026/2", "2026-07-28", "2026-12-17"]);
  });

  it("deixa de fora o que cai antes ou depois do semestre", () => {
    assert.equal(porTitulo("Férias"), undefined);
    assert.equal(porTitulo("Feriado Estadual"), undefined);
    assert.equal(porTitulo("Natal"), undefined);
  });

  it("separa feriado de recesso pela Relação de Recessos", () => {
    assert.equal(porTitulo("Aniversário da Cidade")?.tipo, "feriado");
    assert.equal(porTitulo("Nossa Senhora")?.tipo, "feriado");
    assert.equal(porTitulo("Recesso (Acadêmico")?.tipo, "recesso");
  });

  it("reconhece sábados letivos e o dia da grade que eles seguem", () => {
    const sabados = s.eventos.filter((e) => e.tipo === "sabado_letivo");
    assert.deepEqual(sabados.map((e) => [e.inicio, e.segueDiaSemana]), [
      ["2026-08-29", 3],
      ["2026-10-24", 4],
      ["2026-12-05", 5],
    ]);
    for (const e of sabados) assert.equal(diaSemanaDe(e.inicio), 6);
  });

  it("classifica prova final, fechamento, início, prazos e eventos internos", () => {
    assert.deepEqual([porTitulo("Prova Final")?.inicio, porTitulo("Prova Final")?.fim, porTitulo("Prova Final")?.tipo], ["2026-12-16", "2026-12-17", "prova_final"]);
    assert.equal(porTitulo("Fechamento")?.tipo, "fim_aulas");
    assert.equal(porTitulo("Retorno das Aulas")?.tipo, "inicio_aulas");
    assert.equal(porTitulo("Data limite para Cert")?.tipo, "prazo");
    assert.equal(porTitulo("Reunião de Gestão")?.tipo, "outro");
    assert.equal(porTitulo("Encerramento de posse")?.tipo, "outro");
    assert.equal(porTitulo("Semana Acadêmica")?.fim, "2026-09-04");
  });

  it("não repete a 1ª etapa, que aparece em todos os meses", () => {
    assert.equal(s.eventos.filter((e) => e.titulo.includes("1ª Etapa")).length, 0);
  });

  it("recusa páginas que não são calendário", () => {
    assert.throws(() => lerCalendarioSuap("<h2>Boletim</h2>"), ErroCalendarioSuap);
  });
});

const amostraReal = new URL("../../../../amostras-privadas/calendario.html", import.meta.url);
describe("calendário real (amostras-privadas)", { skip: !existsSync(amostraReal) && "sem amostra local" }, () => {
  it("lê o semestre, com sábados letivos em sábados", () => {
    const s = lerCalendarioSuap(readFileSync(amostraReal, "utf8"));
    assert.ok(s.inicio < s.fim);
    assert.ok(s.eventos.length > 0);
    for (const e of s.eventos.filter((x) => x.tipo === "sabado_letivo")) assert.equal(diaSemanaDe(e.inicio), 6);
  });
});
