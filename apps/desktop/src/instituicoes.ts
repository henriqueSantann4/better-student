import { lerPerfilInstituicao, PERFIL_GENERICO, type PerfilInstituicao } from "@better-student/shared";

/**
 * Perfis de instituição que vêm com o app: os arquivos JSON da pasta
 * packages/shared/instituicoes/. O Vite junta todos no build; para incluir
 * outra faculdade, basta adicionar um arquivo lá. "Outra instituição" fica
 * sempre por último, para quem não achar a sua.
 */
export const PERFIS: PerfilInstituicao[] = [
  ...Object.values(
    import.meta.glob<unknown>("../../../packages/shared/instituicoes/*.json", { eager: true, import: "default" }),
  )
    .map((dados) => lerPerfilInstituicao(dados))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  PERFIL_GENERICO,
];

/** Instituição sugerida no primeiro acesso. */
export const INSTITUICAO_PADRAO = "ifsp";
