/**
 * Interface mínima de acesso ao SQLite.
 *
 * Os repositórios dependem só disto, e não de uma biblioteca específica. Cada
 * ambiente entrega a sua implementação:
 *   - desktop: `@tauri-apps/plugin-sql` (apps/desktop/src/banco)
 *   - celular (fase 3): expo-sqlite
 *   - testes: `node:sqlite`, embutido no Node
 *
 * Os parâmetros usam `?` (posicional), que os três aceitam.
 */
export type ValorSql = string | number | null;

export interface Banco {
  selecionar<T>(sql: string, parametros?: ValorSql[]): Promise<T[]>;
  executar(sql: string, parametros?: ValorSql[]): Promise<void>;
}

/** UUID novo para um registro. */
export function novoId(): string {
  return crypto.randomUUID();
}

/** Data e hora atual em ISO 8601 (UTC). */
export function agora(): string {
  return new Date().toISOString();
}

/** Converte o INTEGER 0/1 do SQLite em booleano. */
export function paraBooleano(valor: number | null | undefined): boolean {
  return valor === 1;
}

/** Colunas comuns a todo registro sincronizável, como vêm do banco. */
export interface LinhaRegistro {
  id: string;
  criado_em: string;
  atualizado_em: string;
  excluido_em: string | null;
}

export function lerRegistro(linha: LinhaRegistro) {
  return {
    id: linha.id,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
    excluidoEm: linha.excluido_em,
  };
}
