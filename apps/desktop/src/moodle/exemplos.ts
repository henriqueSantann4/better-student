/**
 * Notas do Moodle de EXEMPLO, todas inventadas, para ver a tela de Notas no
 * modo navegador (`pnpm dev:web`), onde não há conexão com o Moodle.
 * Só é importado em desenvolvimento: não entra no instalador.
 */
import type { DisciplinaMoodle, NotaMoodle } from "@better-student/shared";

export function notasDeExemplo(): { sala: DisciplinaMoodle; notas: NotaMoodle[] }[] {
  const sala = (id: number, nome: string) => ({ id, nome, sigla: "", progresso: null });
  return [
    {
      sala: sala(1, "Banco de Dados I"),
      notas: [
        { id: 1, nome: "Questionário 1: modelo relacional", modulo: "quiz", nota: 5.67, maxima: 7, corrigidaEm: "2026-11-20T10:00:00Z", url: null },
        { id: 2, nome: "Lista de exercícios de SQL", modulo: "assign", nota: 2.5, maxima: 3, corrigidaEm: "2026-11-10T10:00:00Z", url: null },
        { id: 3, nome: "Projeto do banco", modulo: "assign", nota: null, maxima: 10, corrigidaEm: null, url: null },
        { id: 4, nome: "Fórum de dúvidas", modulo: "forum", nota: null, maxima: 1, corrigidaEm: null, url: null },
      ],
    },
    {
      sala: sala(2, "Inglês Instrumental para a Computação"),
      notas: [{ id: 5, nome: "Questionário de vocabulário", modulo: "quiz", nota: null, maxima: 10, corrigidaEm: null, url: null }],
    },
  ];
}
