import type { Avaliacao } from "../tipos.ts";
import { agora, lerRegistro, novoId, type Banco, type LinhaRegistro } from "./banco.ts";

interface LinhaAvaliacao extends LinhaRegistro {
  disciplina_id: string;
  nome: string;
  peso: number;
  nota: number | null;
  nota_maxima: number;
  data: string | null;
  tarefa_id: string | null;
}

function lerAvaliacao(l: LinhaAvaliacao): Avaliacao {
  return {
    ...lerRegistro(l),
    disciplinaId: l.disciplina_id,
    nome: l.nome,
    peso: l.peso,
    nota: l.nota,
    notaMaxima: l.nota_maxima,
    data: l.data,
    tarefaId: l.tarefa_id,
  };
}

export interface DadosAvaliacao {
  disciplinaId: string;
  nome: string;
  peso?: number;
  nota?: number | null;
  notaMaxima?: number;
  data?: string | null;
  /** Tarefa da agenda de onde a avaliação veio (a prova marcada na Agenda). */
  tarefaId?: string | null;
}

export const avaliacoes = {
  /** Avaliações das disciplinas ativas do semestre, por data (sem data por último). */
  async listarDoSemestre(banco: Banco, semestreId: string): Promise<Avaliacao[]> {
    const linhas = await banco.selecionar<LinhaAvaliacao>(
      `SELECT a.* FROM avaliacao a
       JOIN disciplina d ON d.id = a.disciplina_id
       WHERE d.semestre_id = ? AND d.excluido_em IS NULL AND a.excluido_em IS NULL
       ORDER BY a.data IS NULL, a.data, a.criado_em`,
      [semestreId],
    );
    return linhas.map(lerAvaliacao);
  },

  async criar(banco: Banco, dados: DadosAvaliacao): Promise<string> {
    const id = novoId();
    const momento = agora();
    await banco.executar(
      `INSERT INTO avaliacao (id, disciplina_id, nome, peso, nota, nota_maxima, data, tarefa_id, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dados.disciplinaId, dados.nome, dados.peso ?? 1, dados.nota ?? null, dados.notaMaxima ?? 10,
        dados.data ?? null, dados.tarefaId ?? null, momento, momento],
    );
    return id;
  },

  async atualizar(banco: Banco, id: string, dados: DadosAvaliacao): Promise<void> {
    await banco.executar(
      `UPDATE avaliacao SET disciplina_id = ?, nome = ?, peso = ?, nota = ?, nota_maxima = ?, data = ?, tarefa_id = ?,
         atualizado_em = ?
       WHERE id = ?`,
      [dados.disciplinaId, dados.nome, dados.peso ?? 1, dados.nota ?? null, dados.notaMaxima ?? 10,
        dados.data ?? null, dados.tarefaId ?? null, agora(), id],
    );
  },

  /** Lança (ou apaga, com `null`) só a nota. */
  async lancarNota(banco: Banco, id: string, nota: number | null): Promise<void> {
    await banco.executar("UPDATE avaliacao SET nota = ?, atualizado_em = ? WHERE id = ?", [nota, agora(), id]);
  },

  async excluir(banco: Banco, id: string): Promise<void> {
    const momento = agora();
    await banco.executar("UPDATE avaliacao SET excluido_em = ?, atualizado_em = ? WHERE id = ?", [momento, momento, id]);
  },
};
