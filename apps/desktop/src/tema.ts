/**
 * Tema da interface: igual ao do sistema, claro ou escuro.
 *
 * Fica no localStorage (deste computador), e não no banco, de propósito: o
 * tema precisa ser aplicado antes de o banco abrir, senão a tela pisca na cor
 * errada. E é uma preferência do aparelho, que não faz sentido sincronizar.
 */
export type Tema = "sistema" | "claro" | "escuro";

const CHAVE = "better-student:tema";

export function temaSalvo(): Tema {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === "claro" || valor === "escuro" ? valor : "sistema";
  } catch {
    return "sistema";
  }
}

/** Aplica no <html> (o CSS lê `data-tema`) e salva. */
export function aplicarTema(tema: Tema, salvar = true): void {
  if (tema === "sistema") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
  if (!salvar) return;
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem armazenamento (ex.: navegador privado): vale só até fechar.
  }
}
