import type { DataHoraIso } from "../tipos.ts";
import { agora, novoId, type Banco } from "./banco.ts";

export type TipoNovidade =
  | "prova_suap"
  | "prova_remarcada"
  | "prova_removida"
  | "nota"
  | "atividade_moodle"
  | "arquivo_moodle"
  | "email";

export interface Novidade {
  id: string;
  tipo: TipoNovidade;
  /** O que aconteceu, já pronto para mostrar ("Prova 2", "Lista 3.pdf"). */
  titulo: string;
  /** Complemento curto: data da prova, nota, remetente... */
  detalhe: string | null;
  disciplinaId: string | null;
  criadoEm: DataHoraIso;
  vistaEm: DataHoraIso | null;
}

export type NovaNovidade = Pick<Novidade, "tipo" | "titulo"> & Partial<Pick<Novidade, "detalhe" | "disciplinaId">>;

interface LinhaNovidade {
  id: string;
  tipo: TipoNovidade;
  titulo: string;
  detalhe: string | null;
  disciplina_id: string | null;
  criado_em: string;
  vista_em: string | null;
}

const ler = (l: LinhaNovidade): Novidade => ({
  id: l.id,
  tipo: l.tipo,
  titulo: l.titulo,
  detalhe: l.detalhe,
  disciplinaId: l.disciplina_id,
  criadoEm: l.criado_em,
  vistaEm: l.vista_em,
});

/** Vistas há mais que isso são apagadas: é só um registro do que mudou. */
const DIAS_GUARDADAS = 30;

export const novidades = {
  async registrar(banco: Banco, lista: readonly NovaNovidade[]): Promise<void> {
    const momento = agora();
    for (const n of lista) {
      await banco.executar(
        "INSERT INTO novidade (id, tipo, titulo, detalhe, disciplina_id, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
        [novoId(), n.tipo, n.titulo, n.detalhe ?? null, n.disciplinaId ?? null, momento],
      );
    }
  },

  /** As que ainda não foram vistas, mais antigas primeiro. */
  async naoVistas(banco: Banco): Promise<Novidade[]> {
    const linhas = await banco.selecionar<LinhaNovidade>(
      "SELECT * FROM novidade WHERE vista_em IS NULL ORDER BY criado_em, rowid",
    );
    return linhas.map(ler);
  },

  /** Das últimas semanas, vistas ou não, mais novas primeiro (para a tela Início). */
  async recentes(banco: Banco, limite = 30): Promise<Novidade[]> {
    const linhas = await banco.selecionar<LinhaNovidade>(
      "SELECT * FROM novidade ORDER BY criado_em DESC, rowid DESC LIMIT ?",
      [limite],
    );
    return linhas.map(ler);
  },

  async marcarVistas(banco: Banco, ids: readonly string[]): Promise<void> {
    const momento = agora();
    for (const id of ids) await banco.executar("UPDATE novidade SET vista_em = ? WHERE id = ?", [momento, id]);
    const limite = new Date(Date.now() - DIAS_GUARDADAS * 86_400_000).toISOString();
    await banco.executar("DELETE FROM novidade WHERE vista_em IS NOT NULL AND vista_em < ?", [limite]);
  },
};
