/**
 * Textos dos avisos e das novidades, usados na tela Início e na caixa
 * "Enquanto você estava fora". A lógica (o que vira aviso, o que é novidade)
 * fica em `shared`; aqui é só como mostrar.
 */
import type { TFunction } from "i18next";
import { hojeIso, type Aviso, type Disciplina, type Novidade } from "@better-student/shared";
import { formatarData, formatarDataEmail, formatarNota } from "./formatos";

/** Telas para onde um aviso ou uma novidade leva ao ser clicado. */
export type Destino = "agenda" | "grade" | "faltas" | "notas" | "materiais" | "email";

export function textoDoAviso(t: TFunction, aviso: Aviso, agora: Date = new Date()): string {
  switch (aviso.motivo) {
    case "atrasadas":
      return t("inicio.aviso.atrasadas", { count: aviso.quantidade });
    case "evento": {
      const e = aviso.evento!;
      return t("inicio.aviso.evento", { quando: e.dataInicio <= hojeIso(agora) ? t("comum.hoje") : formatarData(e.dataInicio), titulo: e.titulo });
    }
    default:
      return t(`inicio.aviso.${aviso.motivo}`, { nome: aviso.disciplina?.nome ?? "" });
  }
}

/** Para onde leva cada aviso (o calendário agora mora na Agenda). */
export function destinoDoAviso(aviso: Aviso): Destino {
  return aviso.destino === "calendario" ? "agenda" : aviso.destino;
}

const DESTINO_NOVIDADE: Record<Novidade["tipo"], Destino> = {
  prova_suap: "agenda",
  prova_remarcada: "agenda",
  prova_removida: "agenda",
  nota: "notas",
  atividade_moodle: "agenda",
  arquivo_moodle: "materiais",
  email: "email",
};

export function destinoDaNovidade(n: Novidade): Destino {
  return DESTINO_NOVIDADE[n.tipo];
}

/** "Prova 2 marcada para 02/12" etc. O nome da disciplina vai à parte. */
export function textoDaNovidade(t: TFunction, n: Novidade): string {
  const d = n.detalhe;
  switch (n.tipo) {
    case "prova_suap":
      return t("novidades.tipos.prova_suap", { titulo: n.titulo, data: d ? formatarData(d) : "" });
    case "prova_remarcada":
      return t("novidades.tipos.prova_remarcada", { titulo: n.titulo, data: d ? formatarData(d) : "" });
    case "prova_removida":
      return t("novidades.tipos.prova_removida", { titulo: n.titulo });
    case "nota": {
      // "7.5" (SUAP) ou "5.67/7" (Moodle).
      const [nota, maxima] = (d ?? "").split("/").map(Number);
      const valor = maxima ? `${formatarNota(nota)} / ${formatarNota(maxima)}` : formatarNota(nota);
      return t("novidades.tipos.nota", { titulo: n.titulo, nota: valor });
    }
    case "atividade_moodle":
      return d
        ? t("novidades.tipos.atividade_moodle_prazo", { titulo: n.titulo, prazo: formatarDataEmail(d, true) })
        : t("novidades.tipos.atividade_moodle", { titulo: n.titulo });
    case "arquivo_moodle":
      return t("novidades.tipos.arquivo_moodle", { titulo: n.titulo });
    case "email":
      return t("novidades.tipos.email", { titulo: n.titulo, de: d ?? "" });
  }
}

export function nomeDaDisciplina(disciplinas: readonly Disciplina[], id: string | null): string | null {
  return id ? (disciplinas.find((x) => x.id === id)?.nome ?? null) : null;
}
