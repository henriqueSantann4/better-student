import { REGRAS_PADRAO_IFSP, type RegrasAcademicas, type Semestre } from "../tipos.ts";
import { agora, lerRegistro, novoId, paraBooleano, type Banco, type LinhaRegistro } from "./banco.ts";
import { configuracao } from "./configuracao.ts";

interface LinhaSemestre extends LinhaRegistro {
  nome: string;
  inicio: string;
  fim: string;
  frequencia_minima: number;
  media_aprovacao: number;
  media_minima_ifa: number;
  nota_minima_ifa: number;
  teto_apos_ifa: number;
  datas_estimadas: number;
}

function lerSemestre(l: LinhaSemestre): Semestre {
  return {
    ...lerRegistro(l),
    nome: l.nome,
    inicio: l.inicio,
    fim: l.fim,
    frequenciaMinima: l.frequencia_minima,
    mediaAprovacao: l.media_aprovacao,
    mediaMinimaIfa: l.media_minima_ifa,
    notaMinimaIfa: l.nota_minima_ifa,
    tetoAposIfa: l.teto_apos_ifa,
    datasEstimadas: paraBooleano(l.datas_estimadas),
  };
}

export interface NovoSemestre {
  nome: string;
  inicio: string;
  fim: string;
  /** Se omitidas, usa as regras padrão do IFSP. */
  regras?: Partial<RegrasAcademicas>;
  /** Datas sugeridas pelo app, a confirmar com o calendário do campus. */
  datasEstimadas?: boolean;
}

export const semestres = {
  async listar(banco: Banco): Promise<Semestre[]> {
    const linhas = await banco.selecionar<LinhaSemestre>(
      "SELECT * FROM semestre WHERE excluido_em IS NULL ORDER BY inicio DESC",
    );
    return linhas.map(lerSemestre);
  },

  async obter(banco: Banco, id: string): Promise<Semestre | null> {
    const [linha] = await banco.selecionar<LinhaSemestre>(
      "SELECT * FROM semestre WHERE id = ? AND excluido_em IS NULL",
      [id],
    );
    return linha ? lerSemestre(linha) : null;
  },

  /** O semestre marcado como atual na configuração, ou `null` se não houver. */
  async atual(banco: Banco): Promise<Semestre | null> {
    const id = await configuracao.ler<string>(banco, "semestreAtualId");
    return id ? semestres.obter(banco, id) : null;
  },

  async definirAtual(banco: Banco, id: string): Promise<void> {
    await configuracao.gravar(banco, "semestreAtualId", id);
  },

  /** Cria o semestre e já o marca como atual. */
  async criar(banco: Banco, dados: NovoSemestre): Promise<Semestre> {
    const id = novoId();
    const momento = agora();
    const r = { ...REGRAS_PADRAO_IFSP, ...dados.regras };
    await banco.executar(
      `INSERT INTO semestre (id, nome, inicio, fim, frequencia_minima, media_aprovacao,
         media_minima_ifa, nota_minima_ifa, teto_apos_ifa, datas_estimadas, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dados.nome, dados.inicio, dados.fim, r.frequenciaMinima, r.mediaAprovacao,
        r.mediaMinimaIfa, r.notaMinimaIfa, r.tetoAposIfa, dados.datasEstimadas ? 1 : 0, momento, momento],
    );
    await semestres.definirAtual(banco, id);
    return (await semestres.obter(banco, id))!;
  },

  /** Edita nome e datas. Datas informadas pelo usuário deixam de ser estimadas. */
  async atualizar(banco: Banco, id: string, dados: { nome: string; inicio: string; fim: string }): Promise<void> {
    await banco.executar(
      "UPDATE semestre SET nome = ?, inicio = ?, fim = ?, datas_estimadas = 0, atualizado_em = ? WHERE id = ?",
      [dados.nome, dados.inicio, dados.fim, agora(), id],
    );
  },

  /** Troca as regras acadêmicas do semestre (frequência, médias, IFA). */
  async atualizarRegras(banco: Banco, id: string, regras: RegrasAcademicas): Promise<void> {
    await banco.executar(
      `UPDATE semestre SET frequencia_minima = ?, media_aprovacao = ?, media_minima_ifa = ?, nota_minima_ifa = ?,
         teto_apos_ifa = ?, atualizado_em = ?
       WHERE id = ?`,
      [regras.frequenciaMinima, regras.mediaAprovacao, regras.mediaMinimaIfa, regras.notaMinimaIfa,
        regras.tetoAposIfa, agora(), id],
    );
  },
};
