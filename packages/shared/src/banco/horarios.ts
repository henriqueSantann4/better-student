import type { DiaSemana, HorarioAula } from "../tipos.ts";
import { agora, lerRegistro, novoId, type Banco, type LinhaRegistro } from "./banco.ts";

interface LinhaHorario extends LinhaRegistro {
  disciplina_id: string;
  dia_semana: number;
  inicio: string;
  fim: string;
  quantidade_aulas: number;
  sala: string | null;
}

function lerHorario(l: LinhaHorario): HorarioAula {
  return {
    ...lerRegistro(l),
    disciplinaId: l.disciplina_id,
    diaSemana: l.dia_semana as DiaSemana,
    inicio: l.inicio,
    fim: l.fim,
    quantidadeAulas: l.quantidade_aulas,
    sala: l.sala,
  };
}

export interface DadosHorario {
  disciplinaId: string;
  diaSemana: DiaSemana;
  inicio: string;
  fim: string;
  quantidadeAulas: number;
  sala?: string | null;
}

export const horarios = {
  /** Todos os horários das disciplinas ativas do semestre, em ordem de dia e hora. */
  async listarDoSemestre(banco: Banco, semestreId: string): Promise<HorarioAula[]> {
    const linhas = await banco.selecionar<LinhaHorario>(
      `SELECT h.* FROM horario_aula h
       JOIN disciplina d ON d.id = h.disciplina_id
       WHERE d.semestre_id = ? AND d.excluido_em IS NULL AND h.excluido_em IS NULL
       ORDER BY h.dia_semana, h.inicio`,
      [semestreId],
    );
    return linhas.map(lerHorario);
  },

  async criar(banco: Banco, dados: DadosHorario): Promise<string> {
    const id = novoId();
    const momento = agora();
    await banco.executar(
      `INSERT INTO horario_aula (id, disciplina_id, dia_semana, inicio, fim, quantidade_aulas,
         sala, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dados.disciplinaId, dados.diaSemana, dados.inicio, dados.fim, dados.quantidadeAulas,
        dados.sala ?? null, momento, momento],
    );
    return id;
  },

  /** Muda quanto um encontro vale (ex.: ajustar pela contagem do calendário). */
  async atualizarQuantidade(banco: Banco, id: string, quantidadeAulas: number): Promise<void> {
    await banco.executar(
      "UPDATE horario_aula SET quantidade_aulas = ?, atualizado_em = ? WHERE id = ?",
      [quantidadeAulas, agora(), id],
    );
  },

  async excluir(banco: Banco, id: string): Promise<void> {
    const momento = agora();
    await banco.executar(
      "UPDATE horario_aula SET excluido_em = ?, atualizado_em = ? WHERE id = ?",
      [momento, momento, id],
    );
  },
};
