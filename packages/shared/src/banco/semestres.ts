import { REGRAS_PADRAO_IFSP, type RegrasAcademicas, type Semestre } from "../tipos.ts";
import { agora, lerRegistro, novoId, type Banco, type LinhaRegistro } from "./banco.ts";
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
  };
}

export interface NovoSemestre {
  nome: string;
  inicio: string;
  fim: string;
  /** Se omitidas, usa as regras padrão do IFSP. */
  regras?: Partial<RegrasAcademicas>;
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
         media_minima_ifa, nota_minima_ifa, teto_apos_ifa, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dados.nome, dados.inicio, dados.fim, r.frequenciaMinima, r.mediaAprovacao,
        r.mediaMinimaIfa, r.notaMinimaIfa, r.tetoAposIfa, momento, momento],
    );
    await semestres.definirAtual(banco, id);
    return (await semestres.obter(banco, id))!;
  },
};
