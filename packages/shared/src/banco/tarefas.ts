import type { Prioridade, RegraLembrete, Subtarefa, Tarefa, TipoTarefa } from "../tipos.ts";
import type { AtividadeMoodle } from "../moodle/moodle.ts";
import { agora, lerRegistro, novoId, paraBooleano, type Banco, type LinhaRegistro } from "./banco.ts";

interface LinhaTarefa extends LinhaRegistro {
  disciplina_id: string | null;
  tipo: TipoTarefa;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
  prioridade: Prioridade;
  concluida_em: string | null;
  lembretes: string | null;
  origem: string | null;
  origem_id: string | null;
  url: string | null;
}

function lerTarefa(l: LinhaTarefa): Tarefa {
  return {
    ...lerRegistro(l),
    disciplinaId: l.disciplina_id,
    tipo: l.tipo,
    titulo: l.titulo,
    descricao: l.descricao,
    prazo: l.prazo,
    prioridade: l.prioridade,
    concluidaEm: l.concluida_em,
    lembretes: l.lembretes ? (JSON.parse(l.lembretes) as RegraLembrete) : null,
    origem: l.origem,
    origemId: l.origem_id,
    url: l.url,
  };
}

interface LinhaSubtarefa extends LinhaRegistro {
  tarefa_id: string;
  titulo: string;
  ordem: number;
  concluida: number;
}

function lerSubtarefa(l: LinhaSubtarefa): Subtarefa {
  return { ...lerRegistro(l), tarefaId: l.tarefa_id, titulo: l.titulo, ordem: l.ordem, concluida: paraBooleano(l.concluida) };
}

/** Campos que o usuário preenche numa tarefa. */
export interface DadosTarefa {
  titulo: string;
  tipo: TipoTarefa;
  disciplinaId?: string | null;
  descricao?: string | null;
  prazo?: string | null;
  prioridade?: Prioridade;
}

export interface ResultadoImportacaoMoodle {
  novas: number;
  atualizadas: number;
  /** Sumiram da linha do tempo antes do prazo: o Moodle tira as já entregues. */
  concluidas: number;
}

export const tarefas = {
  /** Todas as tarefas ativas (não excluídas), sem prazo primeiro e depois por prazo. */
  async listar(banco: Banco): Promise<Tarefa[]> {
    const linhas = await banco.selecionar<LinhaTarefa>(
      "SELECT * FROM tarefa WHERE excluido_em IS NULL ORDER BY prazo IS NOT NULL, prazo, criado_em",
    );
    return linhas.map(lerTarefa);
  },

  async criar(banco: Banco, dados: DadosTarefa): Promise<string> {
    const id = novoId();
    const momento = agora();
    await banco.executar(
      `INSERT INTO tarefa (id, disciplina_id, tipo, titulo, descricao, prazo, prioridade, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dados.disciplinaId ?? null, dados.tipo, dados.titulo, dados.descricao ?? null, dados.prazo ?? null,
        dados.prioridade ?? "media", momento, momento],
    );
    return id;
  },

  async atualizar(banco: Banco, id: string, dados: DadosTarefa): Promise<void> {
    await banco.executar(
      `UPDATE tarefa SET disciplina_id = ?, tipo = ?, titulo = ?, descricao = ?, prazo = ?, prioridade = ?, atualizado_em = ?
       WHERE id = ?`,
      [dados.disciplinaId ?? null, dados.tipo, dados.titulo, dados.descricao ?? null, dados.prazo ?? null,
        dados.prioridade ?? "media", agora(), id],
    );
  },

  async concluir(banco: Banco, id: string, concluida: boolean): Promise<void> {
    const momento = agora();
    await banco.executar("UPDATE tarefa SET concluida_em = ?, atualizado_em = ? WHERE id = ?", [
      concluida ? momento : null,
      momento,
      id,
    ]);
  },

  async excluir(banco: Banco, id: string): Promise<void> {
    const momento = agora();
    await banco.executar("UPDATE tarefa SET excluido_em = ?, atualizado_em = ? WHERE id = ?", [momento, momento, id]);
  },

  /**
   * Traz as atividades do Moodle como tarefas:
   * - nova atividade → nova tarefa (tipo "atividade_moodle");
   * - já importada → atualiza título, prazo, link e disciplina (mantém o que
   *   o usuário fez: concluída, descrição, prioridade, subtarefas);
   * - importada que SUMIU da linha do tempo antes do prazo → concluída, porque
   *   o Moodle tira da linha do tempo o que já foi entregue.
   * `disciplinaDe` diz a disciplina do app de cada atividade (ou null).
   */
  async importarMoodle(
    banco: Banco,
    atividades: readonly AtividadeMoodle[],
    disciplinaDe: (atividade: AtividadeMoodle) => string | null,
    agoraIso: string = new Date().toISOString(),
  ): Promise<ResultadoImportacaoMoodle> {
    const resultado: ResultadoImportacaoMoodle = { novas: 0, atualizadas: 0, concluidas: 0 };
    const existentes = (await tarefas.listar(banco)).filter((t) => t.origem === "moodle");
    const porId = new Map(existentes.map((t) => [t.origemId, t]));
    const momento = agora();

    for (const a of atividades) {
      const disciplinaId = disciplinaDe(a);
      const ja = porId.get(String(a.id));
      if (ja) {
        await banco.executar(
          "UPDATE tarefa SET titulo = ?, prazo = ?, url = ?, disciplina_id = COALESCE(?, disciplina_id), atualizado_em = ? WHERE id = ?",
          [a.nome, a.prazo, a.url || null, disciplinaId, momento, ja.id],
        );
        resultado.atualizadas++;
      } else {
        await banco.executar(
          `INSERT INTO tarefa (id, disciplina_id, tipo, titulo, descricao, prazo, prioridade, origem, origem_id, url,
             criado_em, atualizado_em)
           VALUES (?, ?, 'atividade_moodle', ?, ?, ?, 'media', 'moodle', ?, ?, ?, ?)`,
          [novoId(), disciplinaId, a.nome, a.acao, a.prazo, String(a.id), a.url || null, momento, momento],
        );
        resultado.novas++;
      }
    }

    const vistos = new Set(atividades.map((a) => String(a.id)));
    for (const t of existentes) {
      const sumiuAntesDoPrazo = !vistos.has(t.origemId ?? "") && t.prazo !== null && t.prazo > agoraIso;
      if (sumiuAntesDoPrazo && !t.concluidaEm) {
        await tarefas.concluir(banco, t.id, true);
        resultado.concluidas++;
      }
    }
    return resultado;
  },
};

export const subtarefas = {
  async listar(banco: Banco): Promise<Subtarefa[]> {
    const linhas = await banco.selecionar<LinhaSubtarefa>(
      "SELECT * FROM subtarefa WHERE excluido_em IS NULL ORDER BY tarefa_id, ordem",
    );
    return linhas.map(lerSubtarefa);
  },

  async criar(banco: Banco, tarefaId: string, titulo: string): Promise<string> {
    const [linha] = await banco.selecionar<{ proxima: number }>(
      "SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM subtarefa WHERE tarefa_id = ?",
      [tarefaId],
    );
    const id = novoId();
    const momento = agora();
    await banco.executar(
      "INSERT INTO subtarefa (id, tarefa_id, titulo, ordem, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)",
      [id, tarefaId, titulo, linha?.proxima ?? 0, momento, momento],
    );
    return id;
  },

  async marcar(banco: Banco, id: string, concluida: boolean): Promise<void> {
    await banco.executar("UPDATE subtarefa SET concluida = ?, atualizado_em = ? WHERE id = ?", [concluida ? 1 : 0, agora(), id]);
  },

  async excluir(banco: Banco, id: string): Promise<void> {
    const momento = agora();
    await banco.executar("UPDATE subtarefa SET excluido_em = ?, atualizado_em = ? WHERE id = ?", [momento, momento, id]);
  },
};
