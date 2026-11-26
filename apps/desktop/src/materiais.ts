/**
 * Ponte com o núcleo para a aba Materiais. Mexer em arquivos é do Rust
 * (src-tauri/src/materiais.rs), que só trabalha dentro da pasta de materiais.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { configuracao, type Banco } from "@better-student/shared";

export const materiaisDisponivel = isTauri;

export interface ArquivoMaterial {
  nome: string;
  tamanho: number;
  /** Milissegundos desde 1970. */
  modificado: number;
}

export interface PastaMaterial {
  pasta: string;
  arquivos: ArquivoMaterial[];
}

/** "C:\..." ou "\\servidor\..." (Windows) ou "/..." (Linux e macOS). */
function caminhoCompleto(caminho: string): boolean {
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(caminho.trim());
}

/** A pasta escolhida em Configurações, ou a padrão (Documentos\Better Student\Materiais). */
export async function lerPastaMateriais(banco: Banco): Promise<string> {
  const salva = await configuracao.ler<string>(banco, "pastaMateriais");
  if (salva && caminhoCompleto(salva)) return salva;
  return pastaPadrao();
}

export function pastaPadrao(): Promise<string> {
  return invoke<string>("materiais_pasta_padrao");
}

export { caminhoCompleto };

/** Cria as pastas que faltarem e lista os arquivos de cada uma. */
export function listar(raiz: string, pastas: string[]): Promise<PastaMaterial[]> {
  return invoke<PastaMaterial[]>("materiais_listar", { raiz, pastas });
}

/** Copia arquivos para a pasta da disciplina; devolve os nomes finais. */
export function copiar(raiz: string, pasta: string, origens: string[]): Promise<string[]> {
  return invoke<string[]>("materiais_copiar", { raiz, pasta, origens });
}

/** Abre o arquivo no programa padrão, ou a pasta no Explorer. */
export function abrir(raiz: string, pasta: string | null, arquivo: string | null = null): Promise<void> {
  return invoke("materiais_abrir", { raiz, pasta, arquivo });
}

/** Baixa um arquivo do Moodle para a pasta (a chave fica no núcleo). */
export function baixarDoMoodle(raiz: string, pasta: string, nome: string, url: string, site: string): Promise<number> {
  return invoke<number>("materiais_baixar_moodle", { raiz, pasta, nome, url, site });
}

/**
 * Avisa quando arquivos são arrastados para a janela (o Tauri entrega os
 * caminhos). `aoPassar(true)` enquanto há algo sendo arrastado por cima.
 */
export async function ouvirArrastar(aoSoltar: (caminhos: string[]) => void, aoPassar: (passando: boolean) => void) {
  return getCurrentWebview().onDragDropEvent((evento) => {
    const p = evento.payload;
    if (p.type === "enter" || p.type === "over") aoPassar(true);
    else if (p.type === "leave") aoPassar(false);
    else if (p.type === "drop") {
      aoPassar(false);
      if (p.paths.length > 0) aoSoltar(p.paths);
    }
  });
}
