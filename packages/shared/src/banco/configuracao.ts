import { agora, type Banco } from "./banco.ts";

/** Chaves conhecidas da tabela `configuracao`. */
export type ChaveConfiguracao =
  | "semestreAtualId"
  | "instituicao"
  | "pastaMateriais"
  | "lembretesPadrao"
  | "suapServidor"
  | "emailInstitucional"
  | "moodleSite"
  /** Avisos que o aluno marcou como vistos, com o nível de cada um (ver regras/avisos). */
  | "avisosDispensados"
  /** Última lista de salas, notas e arquivos do Moodle (para abrir as telas sem esperar). */
  | "cacheMoodle"
  /** Quando a caixa "Enquanto você estava fora" foi fechada pela última vez. */
  | "ultimaVisita";

/** Configurações gerais, guardadas como JSON numa tabela chave/valor. */
export const configuracao = {
  async ler<T>(banco: Banco, chave: ChaveConfiguracao): Promise<T | null> {
    const [linha] = await banco.selecionar<{ valor: string }>(
      "SELECT valor FROM configuracao WHERE chave = ?",
      [chave],
    );
    return linha ? (JSON.parse(linha.valor) as T) : null;
  },

  async gravar(banco: Banco, chave: ChaveConfiguracao, valor: unknown): Promise<void> {
    // "UPSERT": insere, ou atualiza se a chave já existe.
    await banco.executar(
      `INSERT INTO configuracao (chave, valor, atualizado_em) VALUES (?, ?, ?)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
      [chave, JSON.stringify(valor), agora()],
    );
  },
};
