import type { DiaSemana, EventoCalendario, Semestre, TipoEventoCalendario } from "../tipos.ts";
import type { SemestrePacote } from "../calendario/pacote.ts";
import { agora, lerRegistro, novoId, paraBooleano, type Banco, type LinhaRegistro } from "./banco.ts";
import { semestres } from "./semestres.ts";

interface LinhaEvento extends LinhaRegistro {
  semestre_id: string;
  tipo: TipoEventoCalendario;
  titulo: string;
  data_inicio: string;
  data_fim: string;
  suspende_aulas: number;
  segue_dia_semana: number | null;
  origem: string | null;
}

function lerEvento(l: LinhaEvento): EventoCalendario {
  return {
    ...lerRegistro(l),
    semestreId: l.semestre_id,
    tipo: l.tipo,
    titulo: l.titulo,
    dataInicio: l.data_inicio,
    dataFim: l.data_fim,
    suspendeAulas: paraBooleano(l.suspende_aulas),
    segueDiaSemana: l.segue_dia_semana as DiaSemana | null,
    origem: l.origem,
  };
}

/** Feriados e recessos suspendem as aulas; os outros tipos não. */
export function tipoSuspendeAulas(tipo: TipoEventoCalendario): boolean {
  return tipo === "feriado" || tipo === "recesso";
}

export const calendario = {
  async listar(banco: Banco, semestreId: string): Promise<EventoCalendario[]> {
    const linhas = await banco.selecionar<LinhaEvento>(
      "SELECT * FROM evento_calendario WHERE semestre_id = ? AND excluido_em IS NULL ORDER BY data_inicio, tipo",
      [semestreId],
    );
    return linhas.map(lerEvento);
  },

  /**
   * Aplica um semestre de um pacote de calendário: troca os eventos que
   * vieram de QUALQUER importação anterior (reimportar, ou trocar o pacote
   * embutido pelo do SUAP, não duplica) e acerta as datas do semestre, que
   * deixam de ser estimadas. Eventos criados pelo usuário (origem NULL) não
   * são tocados.
   */
  async aplicarPacote(banco: Banco, semestre: Semestre, origem: string, dados: SemestrePacote): Promise<number> {
    const momento = agora();
    await banco.executar(
      "UPDATE evento_calendario SET excluido_em = ?, atualizado_em = ? WHERE semestre_id = ? AND origem IS NOT NULL AND excluido_em IS NULL",
      [momento, momento, semestre.id],
    );
    for (const e of dados.eventos) {
      await banco.executar(
        `INSERT INTO evento_calendario (id, semestre_id, tipo, titulo, data_inicio, data_fim, suspende_aulas,
           segue_dia_semana, origem, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [novoId(), semestre.id, e.tipo, e.titulo, e.inicio, e.fim ?? e.inicio, tipoSuspendeAulas(e.tipo) ? 1 : 0,
          e.segueDiaSemana ?? null, origem, momento, momento],
      );
    }
    await semestres.atualizar(banco, semestre.id, { nome: semestre.nome, inicio: dados.inicio, fim: dados.fim });
    return dados.eventos.length;
  },
};
