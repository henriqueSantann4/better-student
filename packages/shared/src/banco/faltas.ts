import type { Falta } from "../tipos.ts";
import { agora, lerRegistro, novoId, type Banco, type LinhaRegistro } from "./banco.ts";

interface LinhaFalta extends LinhaRegistro {
  disciplina_id: string;
  data: string;
  horario_aula_id: string | null;
  quantidade_aulas: number;
  observacao: string | null;
}

function lerFalta(l: LinhaFalta): Falta {
  return {
    ...lerRegistro(l),
    disciplinaId: l.disciplina_id,
    data: l.data,
    horarioAulaId: l.horario_aula_id,
    quantidadeAulas: l.quantidade_aulas,
    observacao: l.observacao,
  };
}

export interface DadosFalta {
  disciplinaId: string;
  data: string;
  /** Encontro da grade em que faltou. `null` para uma falta avulsa (ex.: aula de reposição). */
  horarioAulaId: string | null;
  /** Normalmente copiada do horário; pode ser menor numa falta parcial. */
  quantidadeAulas: number;
  observacao?: string | null;
}

export const faltas = {
  /** Faltas das disciplinas ativas do semestre, da mais recente para a mais antiga. */
  async listarDoSemestre(banco: Banco, semestreId: string): Promise<Falta[]> {
    const linhas = await banco.selecionar<LinhaFalta>(
      `SELECT f.* FROM falta f
       JOIN disciplina d ON d.id = f.disciplina_id
       WHERE d.semestre_id = ? AND d.excluido_em IS NULL AND f.excluido_em IS NULL
       ORDER BY f.data DESC, f.criado_em DESC`,
      [semestreId],
    );
    return linhas.map(lerFalta);
  },

  /**
   * Registra a falta. Se a mesma falta (disciplina, dia e encontro) já
   * existir, o banco recusa pelo índice `uq_falta_encontro`.
   */
  async registrar(banco: Banco, dados: DadosFalta): Promise<string> {
    const id = novoId();
    const momento = agora();
    await banco.executar(
      `INSERT INTO falta (id, disciplina_id, data, horario_aula_id, quantidade_aulas,
         observacao, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dados.disciplinaId, dados.data, dados.horarioAulaId, dados.quantidadeAulas,
        dados.observacao ?? null, momento, momento],
    );
    return id;
  },

  async excluir(banco: Banco, id: string): Promise<void> {
    const momento = agora();
    await banco.executar(
      "UPDATE falta SET excluido_em = ?, atualizado_em = ? WHERE id = ?",
      [momento, momento, id],
    );
  },
};
