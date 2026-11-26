import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DiaSemana, Disciplina, EventoCalendario, HorarioAula } from "../tipos.ts";
import { lerFrase, prazoDaFrase, type ContextoFrase } from "./frase.ts";

// Quarta-feira, 25/11/2026, 14h.
const agora = new Date(2026, 10, 25, 14, 0);

const registro = { criadoEm: "", atualizadoEm: "", excluidoEm: null };
function disciplina(id: string, nome: string, codigo: string | null = null): Disciplina {
  return {
    ...registro, id, semestreId: "s", nome, sigla: null, professor: null, totalAulas: 80, frequenciaMinima: null, cor: null, notaIfa: null, criterios: { suap: null, editados: null },
    suap: codigo ? { codigo, diario: null, aulasCumpridas: null, faltas: null, frequencia: null, situacao: null, etapas: [], media: null, naf: null, mfd: null, atualizadoEm: null, importadoEm: "", detalhe: null } : null,
  };
}
function aula(disciplinaId: string, diaSemana: DiaSemana, inicio: string): HorarioAula {
  return { ...registro, id: `${disciplinaId}-${diaSemana}`, disciplinaId, diaSemana, inicio, fim: "22:30", quantidadeAulas: 4, sala: null };
}

const disciplinas = [
  disciplina("poo", "Programação Orientada a Objetos", "XYZPOOB"),
  disciplina("ed1", "Estrutura de Dados 1"),
  disciplina("bd", "Banco de Dados"),
  disciplina("mat", "Matemática Aplicada à Informática"),
];
// Grade: POO na quinta 19h; segunda tem BD e ED1; sexta não tem aula.
const horarios = [aula("poo", 4, "19:00"), aula("bd", 1, "19:00"), aula("ed1", 1, "21:00")];
const feriado: EventoCalendario = {
  ...registro, id: "f", semestreId: "s", tipo: "feriado", titulo: "Feriado", dataInicio: "2026-12-03", dataFim: "2026-12-03",
  suspendeAulas: true, segueDiaSemana: null, origem: null,
};
const ctx: ContextoFrase = { agora, disciplinas, horarios, eventos: [feriado] };
const ler = (frase: string) => lerFrase(frase, ctx);

describe("leitor de frases: o que está escrito", () => {
  it("prova de POO quinta 19h → tudo escrito", () => {
    const r = ler("prova de POO quinta 19h");
    assert.deepEqual([r.tipo, r.disciplinaId, r.data, r.hora], ["prova", "poo", "2026-11-26", "19:00"]);
    assert.deepEqual([r.disciplinaOrigem, r.dataOrigem, r.horaOrigem], ["escrita", "escrita", "escrita"]);
    assert.equal(r.titulo, "Prova de POO quinta 19h");
  });

  it("entende datas do jeito que se fala", () => {
    assert.equal(ler("lista amanhã").data, "2026-11-26");
    assert.equal(ler("trabalho depois de amanhã").data, "2026-11-27");
    assert.equal(ler("prova dia 12").data, "2026-12-12");
    assert.equal(ler("prova dia 2").data, "2026-12-02"); // dia 2 já passou neste mês → o próximo
    assert.equal(ler("entrega 15/01").data, "2027-01-15"); // sem ano e no passado → ano que vem
    assert.equal(ler("prova quarta").data, "2026-12-02"); // hoje é quarta → a da semana que vem
    assert.equal(ler("prova sexta que vem").data, "2026-12-04");
  });

  it("entende horas do jeito que se fala", () => {
    assert.equal(ler("prova amanhã 19:30").hora, "19:30");
    assert.equal(ler("prova amanhã 8h15").hora, "08:15");
    assert.equal(ler("prova amanhã às 7 da noite").hora, "19:00");
  });

  it("reconhece a disciplina pelas iniciais, pelo código ou por uma palavra", () => {
    assert.equal(ler("lista de ED1 dia 30").disciplinaId, "ed1");
    assert.equal(ler("trabalho xyzpoob").disciplinaId, "poo");
    assert.equal(ler("prova de matemática dia 30").disciplinaId, "mat");
    assert.equal(ler("prova de banco de dados dia 30").disciplinaId, "bd");
  });

  it("aceita as iniciais sem o número final (BD para 'Banco de Dados I')", () => {
    const comNumero = { ...ctx, disciplinas: [disciplina("bd1", "Banco de Dados I"), disciplina("poo", "Programação Orientada a Objetos")] };
    assert.equal(lerFrase("prova de BD dia 30", comNumero).disciplinaId, "bd1");
    assert.equal(lerFrase("prova de BDI dia 30", comNumero).disciplinaId, "bd1");
    // Duas disciplinas com as mesmas iniciais-base: pergunta em vez de chutar.
    const duas = { ...ctx, disciplinas: [disciplina("ed1", "Estrutura de Dados 1"), disciplina("ed2", "Estrutura de Dados 2")] };
    assert.deepEqual(lerFrase("lista de ED dia 30", duas).opcoesDisciplina.sort(), ["ed1", "ed2"]);
    assert.equal(lerFrase("lista de ED2 dia 30", duas).disciplinaId, "ed2");
  });

  it("reconhece o tipo pela palavra", () => {
    assert.equal(ler("seminário de POO").tipo, "apresentacao");
    assert.equal(ler("exercícios de BD").tipo, "lista");
    assert.equal(ler("comprar livro").tipo, "outro");
  });
});

describe("leitor de frases: o que vem da grade", () => {
  it("uma aula no dia → preenche disciplina e horário", () => {
    const r = ler("prova quinta");
    assert.deepEqual([r.disciplinaId, r.hora, r.disciplinaOrigem, r.horaOrigem], ["poo", "19:00", "grade", "grade"]);
  });

  it("várias aulas no dia → devolve as opções", () => {
    const r = ler("prova segunda");
    assert.equal(r.disciplinaId, null);
    assert.deepEqual(r.opcoesDisciplina.sort(), ["bd", "ed1"]);
    assert.ok(r.avisos.includes("variasAulasNoDia"));
  });

  it("nenhuma aula no dia (ou feriado) → aviso", () => {
    assert.ok(ler("prova sexta").avisos.includes("semAulaNoDia"));
    assert.ok(ler("prova dia 3").avisos.includes("semAulaNoDia")); // 03/12 é quinta, mas é feriado
  });

  it("entrega em dia sem aula não gera aviso (trabalho pode ser qualquer dia)", () => {
    assert.deepEqual(ler("trabalho sexta 14h").avisos, []);
  });

  it("disciplina sem data → fica sem prazo (o app não inventa um dia)", () => {
    const r = ler("lista de POO");
    assert.deepEqual([r.disciplinaId, r.data, r.hora], ["poo", null, null]);
  });

  it("prova com data e sem hora → no horário da aula daquele dia", () => {
    const r = ler("prova de poo dia 26 no horário da aula"); // 26/11 é quinta, dia de POO
    assert.deepEqual([r.tipo, r.data, r.hora, r.horaOrigem], ["prova", "2026-11-26", "19:00", "grade"]);
  });

  it("disciplina num dia em que ela não tem aula → avisa e deixa a hora em aberto", () => {
    const r = ler("prova de poo dia 28"); // 28/11 é sábado
    assert.deepEqual([r.disciplinaId, r.data, r.hora], ["poo", "2026-11-28", null]);
    assert.ok(r.avisos.includes("disciplinaSemAulaNoDia"));
  });

  it("o que foi escrito vence a dedução", () => {
    const r = ler("prova de BD quinta 10h"); // quinta é dia de POO, mas a frase diz BD e 10h
    assert.deepEqual([r.disciplinaId, r.hora, r.disciplinaOrigem], ["bd", "10:00", "escrita"]);
  });
});

describe("prazoDaFrase", () => {
  it("junta data e hora locais; sem hora, vale até o fim do dia", () => {
    assert.equal(prazoDaFrase({ data: "2026-11-26", hora: "19:00" }), new Date(2026, 10, 26, 19, 0).toISOString());
    assert.equal(prazoDaFrase({ data: "2026-11-26", hora: null }), new Date(2026, 10, 26, 23, 59).toISOString());
    assert.equal(prazoDaFrase({ data: null, hora: "19:00" }), null);
  });
});
