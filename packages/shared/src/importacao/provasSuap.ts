/**
 * Provas e trabalhos com data no "Detalhar" do SUAP viram tarefas da Agenda.
 *
 * - Avaliação com data → tarefa (origem "suap"), no horário da aula daquele
 *   dia; sem aula no dia, vale até o fim do dia. O que não é "Prova" vira
 *   "Trabalho".
 * - Se o aluno já tinha anotado a mesma coisa (mesma disciplina, tipo e dia),
 *   a anotação dele ganha a marca do SUAP em vez de duplicar.
 * - Data que já passou entra como concluída (aparece apagada na Agenda).
 * - O SUAP mudou a data → o prazo muda junto. Se só o aluno mexeu no prazo,
 *   fica o que ele fez.
 * - A avaliação sumiu do SUAP ou perdeu a data → a tarefa criada pelo SUAP é
 *   apagada; a anotação do aluno fica, só sem a marca.
 * Só disciplinas que têm o "Detalhar" gravado são conferidas: sem o
 * detalhamento, o app não sabe o que sumiu e não apaga nada.
 */
import type { DataIso, Disciplina, EventoCalendario, HorarioAula, TipoTarefa } from "../tipos.ts";
import type { Banco } from "../banco/banco.ts";
import { agora as agoraIso, novoId } from "../banco/banco.ts";
import { tarefas } from "../banco/tarefas.ts";
import { paraDataIso } from "../datas.ts";
import { aulasDoDia } from "../regras/calendario.ts";
import { prazoDaFrase } from "../regras/frase.ts";
import { normalizar } from "./boletimSuap.ts";

export interface AvaliacaoAgendada {
  /** Disciplina, etapa e sigla: identifica a avaliação entre uma importação e outra. */
  chave: string;
  disciplinaId: string;
  tipo: Extract<TipoTarefa, "prova" | "trabalho">;
  titulo: string;
  data: DataIso;
}

/** As avaliações com data de todas as disciplinas que têm o "Detalhar". */
export function avaliacoesComData(disciplinas: readonly Disciplina[]): AvaliacaoAgendada[] {
  const lista: AvaliacaoAgendada[] = [];
  for (const d of disciplinas) {
    for (const etapa of d.suap?.detalhe?.etapas ?? []) {
      for (const a of etapa.avaliacoes) {
        if (!a.data) continue;
        lista.push({
          chave: `${d.id}:${etapa.numero ?? "F"}:${a.sigla}`,
          disciplinaId: d.id,
          tipo: a.tipo && normalizar(a.tipo).startsWith("PROVA") ? "prova" : "trabalho",
          titulo: a.descricao ?? a.tipo ?? a.sigla,
          data: a.data,
        });
      }
    }
  }
  return lista;
}

export interface ResultadoProvasSuap {
  /** Criadas agora (de hoje em diante; as antigas entram, mas não contam como novidade). */
  novas: AvaliacaoAgendada[];
  /** Anotações do aluno que ganharam a marca do SUAP. */
  juntadas: number;
  /** O SUAP mudou a data. */
  remarcadas: AvaliacaoAgendada[];
  /** Títulos das que sumiram do SUAP (ou perderam a data). */
  removidas: string[];
}

export async function importarProvasSuap(
  banco: Banco,
  disciplinas: readonly Disciplina[],
  horarios: readonly HorarioAula[],
  eventos: readonly EventoCalendario[],
  agora: Date = new Date(),
): Promise<ResultadoProvasSuap> {
  const resultado: ResultadoProvasSuap = { novas: [], juntadas: 0, remarcadas: [], removidas: [] };
  const hoje = paraDataIso(agora);
  const momento = agoraIso();
  const avaliacoes = avaliacoesComData(disciplinas);
  const lista = await tarefas.listar(banco);
  const ligadas = new Map(lista.filter((t) => t.suapChave).map((t) => [t.suapChave!, t]));
  const usadas = new Set<string>();

  // No horário da aula da disciplina naquele dia; sem aula, até o fim do dia.
  const prazoDe = (a: AvaliacaoAgendada) => {
    const aula = aulasDoDia(a.data, horarios, eventos).aulas.find((h) => h.disciplinaId === a.disciplinaId);
    return prazoDaFrase({ data: a.data, hora: aula?.inicio ?? null })!;
  };
  const diaDe = (prazo: string | null) => (prazo ? paraDataIso(new Date(prazo)) : null);

  for (const a of avaliacoes) {
    const ja = ligadas.get(a.chave);
    if (ja) {
      usadas.add(ja.id);
      if (ja.suapData !== a.data) {
        // Remarcada no SUAP. Se foi para hoje ou depois, volta a ficar pendente.
        await banco.executar(
          "UPDATE tarefa SET prazo = ?, suap_data = ?, concluida_em = ?, atualizado_em = ? WHERE id = ?",
          [prazoDe(a), a.data, a.data < hoje ? (ja.concluidaEm ?? momento) : null, momento, ja.id],
        );
        resultado.remarcadas.push(a);
      }
      continue;
    }

    const anotada = lista.find(
      (t) => !t.suapChave && !usadas.has(t.id) && t.disciplinaId === a.disciplinaId && t.tipo === a.tipo && diaDe(t.prazo) === a.data,
    );
    if (anotada) {
      usadas.add(anotada.id);
      await banco.executar("UPDATE tarefa SET suap_chave = ?, suap_data = ?, atualizado_em = ? WHERE id = ?", [
        a.chave, a.data, momento, anotada.id,
      ]);
      resultado.juntadas++;
      continue;
    }

    await banco.executar(
      `INSERT INTO tarefa (id, disciplina_id, tipo, titulo, prazo, prioridade, concluida_em, origem, origem_id,
         suap_chave, suap_data, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, 'media', ?, 'suap', ?, ?, ?, ?, ?)`,
      [novoId(), a.disciplinaId, a.tipo, a.titulo, prazoDe(a), a.data < hoje ? momento : null, a.chave, a.chave, a.data,
        momento, momento],
    );
    if (a.data >= hoje) resultado.novas.push(a);
  }

  // Sumiu do SUAP (ou perdeu a data), nas disciplinas que têm o "Detalhar".
  const conferidas = new Set(disciplinas.filter((d) => d.suap?.detalhe).map((d) => d.id));
  const atuais = new Set(avaliacoes.map((a) => a.chave));
  for (const t of lista) {
    if (!t.suapChave || atuais.has(t.suapChave) || !t.disciplinaId || !conferidas.has(t.disciplinaId)) continue;
    if (t.origem === "suap") await tarefas.excluir(banco, t.id);
    else {
      await banco.executar("UPDATE tarefa SET suap_chave = NULL, suap_data = NULL, atualizado_em = ? WHERE id = ?", [momento, t.id]);
    }
    resultado.removidas.push(t.titulo);
  }
  return resultado;
}
