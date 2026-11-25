import type { DadosSuap, Disciplina } from "../tipos.ts";
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
  suap_codigo: string | null;
  suap_diario: string | null;
  suap_aulas_cumpridas: number | null;
  suap_faltas: number | null;
  suap_frequencia: number | null;
  suap_situacao: string | null;
  suap_etapas: string | null;
  suap_media: number | null;
  suap_naf: number | null;
  suap_mfd: number | null;
  suap_atualizado_em: string | null;
  suap_importado_em: string | null;
  suap_detalhe: string | null;
}

function lerSuap(l: LinhaDisciplina): DadosSuap | null {
  if (!l.suap_importado_em) return null;
  return {
    codigo: l.suap_codigo,
    diario: l.suap_diario,
    aulasCumpridas: l.suap_aulas_cumpridas,
    faltas: l.suap_faltas,
    frequencia: l.suap_frequencia,
    situacao: l.suap_situacao,
    etapas: l.suap_etapas ? (JSON.parse(l.suap_etapas) as DadosSuap["etapas"]) : [],
    media: l.suap_media,
    naf: l.suap_naf,
    mfd: l.suap_mfd,
    atualizadoEm: l.suap_atualizado_em,
    importadoEm: l.suap_importado_em,
    detalhe: l.suap_detalhe ? (JSON.parse(l.suap_detalhe) as DadosSuap["detalhe"]) : null,
  };
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
    suap: lerSuap(l),
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

  /** Grava o "Detalhar" do SUAP da disciplina (substitui o anterior). */
  async gravarDetalheSuap(banco: Banco, id: string, detalhe: DadosSuap["detalhe"]): Promise<void> {
    await banco.executar("UPDATE disciplina SET suap_detalhe = ?, atualizado_em = ? WHERE id = ?", [
      detalhe ? JSON.stringify(detalhe) : null,
      agora(),
      id,
    ]);
  },

  /** Nota tirada no IFA (`null` = não fez). */
  async gravarNotaIfa(banco: Banco, id: string, nota: number | null): Promise<void> {
    await banco.executar("UPDATE disciplina SET nota_ifa = ?, atualizado_em = ? WHERE id = ?", [nota, agora(), id]);
  },

  /** Grava o retrato do SUAP (última importação) na disciplina. */
  async gravarSuap(banco: Banco, id: string, dados: Omit<DadosSuap, "importadoEm" | "detalhe">): Promise<void> {
    const momento = agora();
    await banco.executar(
      `UPDATE disciplina SET suap_codigo = ?, suap_diario = ?, suap_aulas_cumpridas = ?, suap_faltas = ?,
         suap_frequencia = ?, suap_situacao = ?, suap_etapas = ?, suap_media = ?, suap_naf = ?, suap_mfd = ?,
         suap_atualizado_em = ?, suap_importado_em = ?, atualizado_em = ?
       WHERE id = ?`,
      [dados.codigo, dados.diario, dados.aulasCumpridas, dados.faltas, dados.frequencia, dados.situacao,
        JSON.stringify(dados.etapas), dados.media, dados.naf, dados.mfd, dados.atualizadoEm, momento, momento, id],
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
