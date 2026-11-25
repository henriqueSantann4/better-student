import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { EventoCalendario, HorarioAula } from "../tipos.ts";
import { aulasDoDia, diaLetivo, marcarDia, proximosEventos } from "./calendario.ts";

const registro = { id: "e", criadoEm: "", atualizadoEm: "", excluidoEm: null };
function evento(e: Partial<EventoCalendario>): EventoCalendario {
  return { ...registro, semestreId: "s", tipo: "outro", titulo: "", dataInicio: "", dataFim: "", suspendeAulas: false, segueDiaSemana: null, origem: null, ...e } as EventoCalendario;
}
const eventos = [
  evento({ tipo: "feriado", titulo: "Finados", dataInicio: "2026-11-02", dataFim: "2026-11-02", suspendeAulas: true }),
  evento({ tipo: "recesso", titulo: "Recesso", dataInicio: "2026-10-13", dataFim: "2026-10-16", suspendeAulas: true }),
  evento({ tipo: "sabado_letivo", titulo: "Sábado letivo", dataInicio: "2026-11-14", dataFim: "2026-11-14", segueDiaSemana: 1 }),
  evento({ tipo: "prazo", titulo: "Trancamento", dataInicio: "2026-09-25", dataFim: "2026-09-25" }),
];
const segunda = { ...registro, id: "h1", disciplinaId: "d", diaSemana: 1, inicio: "19:00", fim: "22:30", quantidadeAulas: 4, sala: null } as HorarioAula;

describe("dia letivo", () => {
  it("feriado e recesso não têm aula", () => {
    assert.equal(diaLetivo("2026-11-02", eventos).letivo, false);
    assert.equal(diaLetivo("2026-10-15", eventos).motivo?.titulo, "Recesso");
  });

  it("sábado letivo segue a grade de outro dia", () => {
    const d = diaLetivo("2026-11-14", eventos);
    assert.deepEqual([d.letivo, d.diaDaGrade], [true, 1]);
    assert.deepEqual(aulasDoDia("2026-11-14", [segunda], eventos).aulas, [segunda]);
  });

  it("domingo não tem aula; dia comum segue a própria grade", () => {
    assert.equal(diaLetivo("2026-11-29", eventos).letivo, false);
    assert.deepEqual(aulasDoDia("2026-11-23", [segunda], eventos).aulas, [segunda]);
    assert.deepEqual(aulasDoDia("2026-11-02", [segunda], eventos).aulas, []); // segunda, mas feriado
  });

  it("lista os próximos eventos a partir de hoje", () => {
    assert.deepEqual(proximosEventos(eventos, "2026-10-14").map((e) => e.titulo), ["Recesso", "Finados", "Sábado letivo"]);
  });
});

describe("marcarDia (visão de mês)", () => {
  const semestre = { inicio: "2026-07-28", fim: "2026-12-17" };
  const comFinal = [
    ...eventos,
    evento({ tipo: "prova_final", titulo: "Prova final", dataInicio: "2026-12-16", dataFim: "2026-12-17" }),
    evento({ tipo: "fim_aulas", titulo: "Fechamento", dataInicio: "2026-12-17", dataFim: "2026-12-17" }),
    evento({ tipo: "outro", titulo: "Reunião de Gestão", dataInicio: "2026-11-23", dataFim: "2026-11-23" }),
  ];
  const tipo = (d: string) => marcarDia(d, comFinal, semestre).tipo;

  it("pinta cada tipo de dia", () => {
    assert.equal(tipo("2026-11-23"), "letivo");
    assert.equal(tipo("2026-11-02"), "sem_aula");
    assert.equal(tipo("2026-11-14"), "sabado_letivo");
    assert.equal(tipo("2026-11-21"), "fora"); // sábado comum
    assert.equal(tipo("2026-07-27"), "fora"); // antes do semestre
    assert.equal(tipo("2026-12-16"), "prova_final");
    assert.equal(tipo("2026-12-17"), "fechamento"); // fechamento vence a prova final
  });

  it("não lista eventos internos no dia", () => {
    assert.deepEqual(marcarDia("2026-11-23", comFinal, semestre).eventos, []);
  });
});
