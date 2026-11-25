import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  avaliacoes,
  calendario,
  disciplinas,
  faltas,
  horarios,
  semestres,
  type Avaliacao,
  type Banco,
  type Disciplina,
  type EventoCalendario,
  type Falta,
  type HorarioAula,
  type Semestre,
} from "@better-student/shared";

/** Tudo o que as telas do semestre atual precisam, carregado de uma vez. */
export interface DadosSemestre {
  semestre: Semestre;
  disciplinas: Disciplina[];
  horarios: HorarioAula[];
  faltas: Falta[];
  eventos: EventoCalendario[];
  avaliacoes: Avaliacao[];
}

interface Contexto {
  banco: Banco;
  /** `undefined` = carregando; `null` = ainda não existe semestre. */
  dados: DadosSemestre | null | undefined;
  /**
   * Roda uma alteração no banco e recarrega os dados. Se der erro, mostra a
   * mensagem no topo da tela e devolve `false`.
   */
  acao: (alteracao: () => Promise<unknown>) => Promise<boolean>;
  erro: unknown;
  limparErro: () => void;
}

const ContextoApp = createContext<Contexto | null>(null);

/**
 * Por que recarregar tudo depois de cada alteração? Com SQLite local, ler o
 * semestre inteiro leva poucos milissegundos, e assim a tela nunca mostra
 * algo diferente do que está no banco. Se um dia pesar, dá para otimizar.
 */
export function ProvedorApp({ banco, children }: { banco: Banco; children: ReactNode }) {
  const [dados, setDados] = useState<DadosSemestre | null | undefined>(undefined);
  const [erro, setErro] = useState<unknown>(null);

  const recarregar = useCallback(async () => {
    const semestre = await semestres.atual(banco);
    if (!semestre) {
      setDados(null);
      return;
    }
    const [d, h, f, e, a] = await Promise.all([
      disciplinas.listar(banco, semestre.id),
      horarios.listarDoSemestre(banco, semestre.id),
      faltas.listarDoSemestre(banco, semestre.id),
      calendario.listar(banco, semestre.id),
      avaliacoes.listarDoSemestre(banco, semestre.id),
    ]);
    setDados({ semestre, disciplinas: d, horarios: h, faltas: f, eventos: e, avaliacoes: a });
  }, [banco]);

  useEffect(() => {
    recarregar().catch(setErro);
  }, [recarregar]);

  const acao = useCallback(
    async (alteracao: () => Promise<unknown>) => {
      try {
        await alteracao();
        setErro(null);
        return true;
      } catch (e) {
        setErro(e);
        return false;
      } finally {
        await recarregar().catch(setErro);
      }
    },
    [recarregar],
  );

  return (
    <ContextoApp.Provider value={{ banco, dados, acao, erro, limparErro: () => setErro(null) }}>
      {children}
    </ContextoApp.Provider>
  );
}

export function useApp(): Contexto {
  const contexto = useContext(ContextoApp);
  if (!contexto) throw new Error("useApp precisa estar dentro de <ProvedorApp>");
  return contexto;
}

/** Atalho para telas que só aparecem quando já existe semestre. */
export function useSemestre(): DadosSemestre & Omit<Contexto, "dados"> {
  const { dados, ...resto } = useApp();
  if (!dados) throw new Error("useSemestre usado sem semestre carregado");
  return { ...dados, ...resto };
}
