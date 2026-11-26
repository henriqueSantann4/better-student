import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { lerArquivosMoodle, nomeSeguro, pastaDaDisciplina, tamanhoLegivel } from "./materiais.ts";
import { ErroMoodle } from "../moodle/moodle.ts";

describe("nomes de pasta e arquivo", () => {
  it("mantém acentos e tira o que o Windows não aceita", () => {
    assert.equal(pastaDaDisciplina("Matemática Aplicada à Informática"), "Matemática Aplicada à Informática");
    assert.equal(nomeSeguro('Lista 1: "SQL" / joins?.pdf'), "Lista 1 SQL joins .pdf");
    assert.equal(nomeSeguro("Aula 3. "), "Aula 3");
  });

  it("nomes reservados, vazios e compridos", () => {
    assert.equal(nomeSeguro("CON"), "CON_");
    assert.equal(nomeSeguro("nul.txt"), "nul.txt_");
    assert.equal(nomeSeguro("..."), "Sem nome");
    const longo = nomeSeguro(`${"a".repeat(200)}.pdf`);
    assert.equal(longo.length, 120);
    assert.ok(longo.endsWith(".pdf"));
  });

  it("tamanho legível", () => {
    assert.equal(tamanhoLegivel(500), "500 B");
    assert.equal(tamanhoLegivel(1536 * 1024), "1,5 MB");
    assert.equal(tamanhoLegivel(25 * 1024 * 1024), "25 MB");
  });
});

describe("lerArquivosMoodle", () => {
  // Formato de core_course_get_contents (valores inventados).
  const resposta = [
    {
      name: "Semana 1",
      modules: [
        {
          name: "Slides da aula 1",
          modname: "resource",
          contents: [{ type: "file", filename: "aula.pdf", filesize: 2048, fileurl: "https://m.exemplo.edu.br/webservice/pluginfile.php/1/mod_resource/content/1/aula.pdf?forcedownload=1", timemodified: 1790000000 }],
        },
        { name: "Site da disciplina", modname: "url", contents: [{ type: "url", filename: "Site", fileurl: "https://exemplo.com" }] },
        { name: "Escondido", modname: "resource", uservisible: false, contents: [{ type: "file", filename: "x.pdf", fileurl: "https://m.exemplo.edu.br/x" }] },
      ],
    },
    {
      name: "Semana 2",
      modules: [
        {
          name: "Slides da aula 2",
          modname: "resource",
          contents: [{ type: "file", filename: "aula.pdf", filesize: 4096, fileurl: "https://m.exemplo.edu.br/webservice/pluginfile.php/2/aula.pdf" }],
        },
        {
          name: "Listas",
          modname: "folder",
          contents: [
            { type: "file", filename: "lista1.pdf", filesize: 10, fileurl: "https://m.exemplo.edu.br/webservice/pluginfile.php/3/lista1.pdf" },
            { type: "file", filename: "lista1.pdf", filesize: 12, fileurl: "https://m.exemplo.edu.br/webservice/pluginfile.php/3/sub/lista1.pdf" },
          ],
        },
      ],
    },
  ];
  const arquivos = lerArquivosMoodle(resposta);

  it("só arquivos visíveis (links e itens escondidos ficam de fora)", () => {
    assert.equal(arquivos.length, 4);
    assert.deepEqual(arquivos.map((a) => a.secao), ["Semana 1", "Semana 2", "Semana 2", "Semana 2"]);
  });

  it("nomes repetidos ganham o nome do recurso, e depois um número", () => {
    assert.deepEqual(arquivos.map((a) => a.nome), [
      "Slides da aula 1 - aula.pdf",
      "Slides da aula 2 - aula.pdf",
      "Listas - lista1.pdf",
      "lista1 (2).pdf",
    ]);
  });

  it("lê tamanho, endereço e data", () => {
    assert.equal(arquivos[0]?.tamanho, 2048);
    assert.equal(arquivos[0]?.modificado, new Date(1790000000 * 1000).toISOString());
    assert.match(arquivos[0]!.url, /pluginfile\.php/);
  });

  it("erro do Moodle vira ErroMoodle", () => {
    assert.throws(() => lerArquivosMoodle({ exception: "x", errorcode: "nopermissions", message: "não" }), ErroMoodle);
  });
});
