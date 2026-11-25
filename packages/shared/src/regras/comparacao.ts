/**
 * Números de ponto flutuante não são exatos: 0.1 + 0.2 dá 0.30000000000000004,
 * e (1 - 0.8) * 100 dá 19.999999999999996. Uma média de 6 calculada com pesos
 * pode virar 5.999999999 e reprovar alguém que passou. Por isso toda
 * comparação de nota e limite passa por uma pequena tolerância.
 */
const TOLERANCIA = 1e-9;

/** `a >= b`, tolerando erro de arredondamento. */
export function aoMenos(a: number, b: number): boolean {
  return a >= b - TOLERANCIA;
}

/** Arredonda para baixo, tolerando erro de arredondamento (19.999999999999996 → 20). */
export function pisoSeguro(x: number): number {
  return Math.floor(x + TOLERANCIA);
}
