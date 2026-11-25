import type { Email } from "../email/email.ts";
import { classificarEmail, trechoDe } from "../email/email.ts";
import { agora, paraBooleano, type Banco } from "./banco.ts";

/** Um e-mail como o núcleo Rust entrega (já decodificado). */
export interface EmailRecebido {
  uid: number;
  deNome: string;
  deEmail: string;
  assunto: string;
  data: string;
  corpo: string;
  lido: boolean;
  estrela: boolean;
}

export interface LoteRecebido {
  uidValidity: number;
  emails: EmailRecebido[];
}

interface LinhaEmail {
  id: string;
  de_nome: string;
  de_email: string;
  assunto: string;
  trecho: string;
  corpo: string;
  data: string;
  lido: number;
  estrela: number;
  categoria: Email["categoria"];
}

function lerEmail(l: LinhaEmail): Email {
  return {
    id: l.id,
    de: { nome: l.de_nome || l.de_email, email: l.de_email },
    assunto: l.assunto,
    trecho: l.trecho,
    corpo: l.corpo,
    data: l.data,
    lido: paraBooleano(l.lido),
    estrela: paraBooleano(l.estrela),
    categoria: l.categoria,
  };
}

/** Cópia local da caixa de entrada de uma conta (ver migration 0005). */
export const emails = {
  async listar(banco: Banco, conta: string): Promise<Email[]> {
    const linhas = await banco.selecionar<LinhaEmail>(
      "SELECT * FROM email WHERE conta = ? ORDER BY data DESC",
      [conta],
    );
    return linhas.map(lerEmail);
  },

  /** Onde a última busca parou: para pedir ao servidor só os e-mails novos. */
  async estado(banco: Banco, conta: string): Promise<{ uidValidity: number; maiorUid: number } | null> {
    const [linha] = await banco.selecionar<{ uid_validity: number; maior: number }>(
      `SELECT uid_validity, MAX(uid) AS maior FROM email WHERE conta = ?
       GROUP BY uid_validity ORDER BY MAX(baixado_em) DESC LIMIT 1`,
      [conta],
    );
    return linha ? { uidValidity: linha.uid_validity, maiorUid: linha.maior } : null;
  },

  /**
   * Grava um lote vindo do servidor. Se o UIDVALIDITY mudou, a caixa foi
   * renumerada: a cópia antiga da conta é apagada antes. E-mails que já
   * existem não são sobrescritos (mantém o lido/estrela marcado no app).
   */
  async gravarLote(banco: Banco, conta: string, lote: LoteRecebido): Promise<number> {
    const anterior = await emails.estado(banco, conta);
    if (anterior && anterior.uidValidity !== lote.uidValidity) {
      await banco.executar("DELETE FROM email WHERE conta = ?", [conta]);
    }
    const momento = agora();
    for (const e of lote.emails) {
      await banco.executar(
        `INSERT INTO email (id, conta, uid, uid_validity, de_nome, de_email, assunto, trecho, corpo, data,
           lido, estrela, categoria, baixado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [`${conta}|${lote.uidValidity}|${e.uid}`, conta, e.uid, lote.uidValidity, e.deNome, e.deEmail, e.assunto,
          trechoDe(e.corpo), e.corpo, e.data, e.lido ? 1 : 0, e.estrela ? 1 : 0,
          classificarEmail(e.deEmail, e.assunto), momento],
      );
    }
    return lote.emails.length;
  },

  async marcar(banco: Banco, id: string, campo: "lido" | "estrela", valor: boolean): Promise<void> {
    // O nome da coluna vem de uma lista fechada no próprio tipo, nunca do usuário.
    const coluna = campo === "lido" ? "lido" : "estrela";
    await banco.executar(`UPDATE email SET ${coluna} = ? WHERE id = ?`, [valor ? 1 : 0, id]);
  },

  /** Apaga a cópia local de uma conta (ao desconectar). */
  async limpar(banco: Banco, conta: string): Promise<void> {
    await banco.executar("DELETE FROM email WHERE conta = ?", [conta]);
  },
};
