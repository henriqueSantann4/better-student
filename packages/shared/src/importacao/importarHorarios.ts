import type { Disciplina } from "../tipos.ts";
import type { Banco } from "../banco/banco.ts";
import { disciplinas as repoDisciplinas } from "../banco/disciplinas.ts";
import { horarios as repoHorarios } from "../banco/horarios.ts";
import { normalizar } from "./boletimSuap.ts";
import type { EncontroSuap, HorariosSuap } from "./horariosSuap.ts";

/** Disciplina do app de um encontro: pelo código ou diário do SUAP, pela sigla ou pelo nome. */
export function disciplinaDoEncontro(encontro: EncontroSuap, disciplinas: readonly Disciplina[]): Disciplina | null {
  const codigo = encontro.codigo ? normalizar(encontro.codigo) : null;
  return (
    (codigo && disciplinas.find((d) => d.suap?.codigo && normalizar(d.suap.codigo) === codigo)) ||
    (encontro.diario && disciplinas.find((d) => d.suap?.diario === encontro.diario)) ||
    (codigo && disciplinas.find((d) => d.sigla && normalizar(d.sigla) === codigo)) ||
    disciplinas.find((d) => normalizar(d.nome) === normalizar(encontro.nome)) ||
    null
  );
}

export interface ResultadoHorarios {
  /** Encontros gravados. */
  gravados: number;
  /** Disciplinas do quadro que não existem no semestre (nomes do SUAP). */
  semDisciplina: string[];
}

/**
 * Grava a grade do SUAP no semestre. O SUAP é a fonte oficial: os horários
 * das disciplinas que aparecem no quadro são SUBSTITUÍDOS pelos de lá
 * (reimportar não duplica nada). Disciplinas fora do quadro ficam como estão.
 * Também preenche o professor, se a disciplina ainda não tiver um.
 */
export async function importarHorarios(banco: Banco, semestreId: string, grade: HorariosSuap): Promise<ResultadoHorarios> {
  const disciplinas = await repoDisciplinas.listar(banco, semestreId);
  const resultado: ResultadoHorarios = { gravados: 0, semDisciplina: [] };

  const porDisciplina = new Map<Disciplina, EncontroSuap[]>();
  for (const encontro of grade.encontros) {
    const disciplina = disciplinaDoEncontro(encontro, disciplinas);
    if (!disciplina) {
      if (!resultado.semDisciplina.includes(encontro.nome)) resultado.semDisciplina.push(encontro.nome);
      continue;
    }
    porDisciplina.set(disciplina, [...(porDisciplina.get(disciplina) ?? []), encontro]);
  }

  const atuais = await repoHorarios.listarDoSemestre(banco, semestreId);
  for (const [disciplina, encontros] of porDisciplina) {
    for (const antigo of atuais.filter((h) => h.disciplinaId === disciplina.id)) {
      await repoHorarios.excluir(banco, antigo.id);
    }
    for (const e of encontros) {
      await repoHorarios.criar(banco, {
        disciplinaId: disciplina.id,
        diaSemana: e.diaSemana,
        inicio: e.inicio,
        fim: e.fim,
        quantidadeAulas: e.quantidadeAulas,
        sala: e.sala,
      });
      resultado.gravados++;
    }
    const professor = encontros.find((e) => e.professor)?.professor;
    if (professor && !disciplina.professor) {
      await repoDisciplinas.atualizar(banco, disciplina.id, { ...disciplina, professor });
    }
  }
  return resultado;
}
