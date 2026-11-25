import type { Disciplina } from "../tipos.ts";
import { agora, lerRegistro, novoId, type Banco, type LinhaRegistro } from "./banco.ts";

interface LinhaDisciplina extends LinhaRegistro {
  semestre_id: string;
  nome: string;
  sigla: string | null;
  professor: string | null;
  total_aulas: number;
  frequencia_minima: number | null;
  cor: string | null;
  nota_ifa: number | null;
}

function lerDisciplina(l: LinhaDisciplina): Disciplina {
  return {
    ...lerRegistro(l),
    semestreId: l.semestre_id,
    nome: l.nome,
    sigla: l.sigla,
    professor: l.professor,
    totalAulas: l.total_aulas,
    frequenciaMinima: l.frequencia_minima,
    cor: l.cor,
    notaIfa: l.nota_ifa,
  };
}

/** Campos que o usuário preenche. Os opcionais começam vazios. */
export interface DadosDisciplina {
  nome: string;
  totalAulas: number;
  sigla?: string | null;
  professor?: string | null;
  frequenciaMinima?: number | null;
  cor?: string | null;
}

export const disciplinas = {
  async listar(banco: Banco, semestreId: string): Promise<Disciplina[]> {
    const linhas = await banco.selecionar<LinhaDisciplina>(
      "SELECT * FROM disciplina WHERE semestre_id = ? AND excluido_em IS NULL ORDER BY nome",
      [semestreId],
    );
    return linhas.map(lerDisciplina);
  },

  async criar(banco: Banco, semestreId: string, dados: DadosDisciplina): Promise<string> {
    const id = novoId();
    const momento = agora();
    await banco.executar(
      `INSERT INTO disciplina (id, semestre_id, nome, sigla, professor, total_aulas,
         frequencia_minima, cor, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, semestreId, dados.nome, dados.sigla ?? null, dados.professor ?? null, dados.totalAulas,
        dados.frequenciaMinima ?? null, dados.cor ?? null, momento, momento],
    );
    return id;
  },

  async atualizar(banco: Banco, id: string, dados: DadosDisciplina): Promise<void> {
    await banco.executar(
      `UPDATE disciplina SET nome = ?, sigla = ?, professor = ?, total_aulas = ?,
         frequencia_minima = ?, cor = ?, atualizado_em = ?
       WHERE id = ?`,
      [dados.nome, dados.sigla ?? null, dados.professor ?? null, dados.totalAulas,
        dados.frequenciaMinima ?? null, dados.cor ?? null, agora(), id],
    );
  },

  /**
   * Exclusão lógica. Os horários e faltas da disciplina ficam no banco, mas
   * somem das telas, porque toda listagem parte das disciplinas ativas.
   */
  async excluir(banco: Banco, id: string): Promise<void> {
    const momento = agora();
    await banco.executar(
      "UPDATE disciplina SET excluido_em = ?, atualizado_em = ? WHERE id = ?",
      [momento, momento, id],
    );
  },
};
