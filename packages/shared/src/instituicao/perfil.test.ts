import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import {
  ErroPerfilInstituicao,
  campusPeloMoodle,
  gravarEscolhaInstituicao,
  lerEscolhaInstituicao,
  lerPerfilInstituicao,
  resolverEscolha,
} from "./perfil.ts";
import { lerPacoteCalendario } from "../calendario/pacote.ts";
import { bancoEmMemoria } from "../banco/memoria.ts";
import { configuracao } from "../banco/configuracao.ts";

const pasta = new URL("../../instituicoes/", import.meta.url);
const perfis = readdirSync(pasta)
  .filter((f) => f.endsWith(".json"))
  .map((f) => lerPerfilInstituicao(JSON.parse(readFileSync(new URL(f, pasta), "utf8"))));
const ifsp = perfis.find((p) => p.id === "ifsp")!;

describe("perfis de instituição embutidos", () => {
  it("todos os arquivos da pasta são válidos e têm id único", () => {
    assert.ok(perfis.length > 0);
    assert.equal(new Set(perfis.map((p) => p.id)).size, perfis.length);
  });

  it("os calendários citados pelos campi existem", () => {
    const calendarios = new URL("../../calendarios/", import.meta.url);
    const ids = new Set(
      readdirSync(calendarios).map((f) => lerPacoteCalendario(JSON.parse(readFileSync(new URL(f, calendarios), "utf8"))).id),
    );
    for (const p of perfis) for (const c of p.campi) for (const id of c.calendarios ?? []) assert.ok(ids.has(id), id);
  });

  it("IFSP: regras padrão, SUAP para todos e Moodle próprio em Votuporanga", () => {
    assert.equal(ifsp.regras.mediaAprovacao, 6);
    assert.equal(ifsp.recuperacao, "IFA");
    const vtp = resolverEscolha(perfis, { instituicaoId: "ifsp", campusId: "vtp" });
    assert.equal(vtp.campus?.nome, "Votuporanga");
    assert.equal(vtp.sistemas.suap, "https://suap.ifsp.edu.br/");
    assert.equal(vtp.sistemas.moodle, "https://ead.vtp.ifsp.edu.br");
    const spo = resolverEscolha(perfis, { instituicaoId: "ifsp", campusId: "spo" });
    assert.equal(spo.sistemas.moodle, null, "Moodle de outro campus não é inventado");
  });

  it("campi em ordem alfabética", () => {
    const nomes = ifsp.campi.map((c) => c.nome);
    assert.deepEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
});

describe("escolha da instituição", () => {
  it("instituição desconhecida cai no perfil genérico, sem sistemas", () => {
    const r = resolverEscolha(perfis, { instituicaoId: "nao-existe", campusId: null });
    assert.equal(r.perfil.id, "outra");
    assert.equal(r.sistemas.suap, null);
  });

  it("acha o campus pelo endereço do Moodle salvo", () => {
    assert.equal(campusPeloMoodle(ifsp, "https://ead.vtp.ifsp.edu.br/")?.id, "vtp");
    assert.equal(campusPeloMoodle(ifsp, null), null);
  });

  it("gravar preenche SUAP e Moodle na configuração", async () => {
    const banco = bancoEmMemoria();
    assert.equal(await lerEscolhaInstituicao(banco), null);
    await gravarEscolhaInstituicao(banco, perfis, { instituicaoId: "ifsp", campusId: "vtp" });
    assert.deepEqual(await lerEscolhaInstituicao(banco), { instituicaoId: "ifsp", campusId: "vtp" });
    assert.equal(await configuracao.ler(banco, "suapServidor"), "https://suap.ifsp.edu.br/");
    assert.equal(await configuracao.ler(banco, "moodleSite"), "https://ead.vtp.ifsp.edu.br");
  });

  it("recusa perfil com regra faltando", () => {
    assert.throws(() => lerPerfilInstituicao({ ...ifsp, regras: { mediaAprovacao: 6 } }), ErroPerfilInstituicao);
  });
});
