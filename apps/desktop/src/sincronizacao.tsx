/**
 * Atualização de tudo (SUAP, Moodle e e-mail) ao abrir o app e no botão
 * Atualizar. Cada fonte roda por conta própria: uma que falhar não segura as
 * outras. O que vier de novo vira "novidade" no banco, para a caixa
 * "Enquanto você estava fora".
 *
 * Princípio do app: nada roda em segundo plano com o app fechado. Isto só
 * acontece enquanto a janela está aberta.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  calendario as repoCalendario,
  casarDisciplinaMoodle,
  configuracao,
  horarios as repoHorarios,
  precisaBuscaCompleta,
  ErroBoletim,
  novidades,
  periodoConfere,
  semestres,
  sincronizarSuap,
  tarefas as repoTarefas,
  disciplinas as repoDisciplinas,
  type NovaNovidade,
} from "@better-student/shared";
import { useApp } from "./contexto";
import { CORES } from "./cores";
import { sincronizar as sincronizarEmail, estaConectado as emailConectado } from "./email/conexao";
import { estaConectado as moodleConectado, lerSiteMoodle } from "./moodle/api";
import { buscarMoodle, gravarCacheMoodle, lerCacheMoodle, type CacheMoodle } from "./moodle/cache";
import { buscarBoletimNoSuap, buscarSuapEscondido, lerPacoteSuap, lerServidorSuap, type PacoteSuap } from "./suap";

export type Fonte = "suap" | "moodle" | "email";

export type EstadoFonte =
  /** Não configurado (ou modo navegador): não aparece. */
  | { estado: "inativo" }
  | { estado: "buscando" }
  | { estado: "ok"; em: Date }
  /** SUAP: a sessão expirou; o aluno precisa entrar de novo (a janela aparece). */
  | { estado: "entrar" }
  | { estado: "erro"; mensagem: string };

interface Sincronizacao {
  fontes: Record<Fonte, EstadoFonte>;
  buscando: boolean;
  /** Muda a cada atualização gravada: telas com listas próprias leem de novo. */
  versao: number;
  /** A primeira atualização desde que o app abriu já terminou. */
  primeiraFeita: boolean;
  atualizar: () => Promise<void>;
  /** Abre a janela do SUAP visível para o aluno entrar; ao terminar, grava tudo. */
  entrarNoSuap: () => Promise<void>;
  /** Busca de novo TUDO do SUAP (horários, calendário, critérios), não só o que muda. */
  buscarTudoDoSuap: () => Promise<void>;
}

const ContextoSincronizacao = createContext<Sincronizacao | null>(null);

const INATIVO: EstadoFonte = { estado: "inativo" };

export function ProvedorSincronizacao({ children }: { children: ReactNode }) {
  const { banco, dados, instituicao, recarregar } = useApp();
  const [fontes, setFontes] = useState<Record<Fonte, EstadoFonte>>({ suap: INATIVO, moodle: INATIVO, email: INATIVO });
  const [versao, setVersao] = useState(0);
  const [primeiraFeita, setPrimeiraFeita] = useState(false);
  const rodando = useRef(false);
  const pararEspera = useRef<(() => void) | null>(null);

  const marcar = useCallback((fonte: Fonte, estado: EstadoFonte) => setFontes((f) => ({ ...f, [fonte]: estado })), []);

  /** Depois de gravar: as telas leem o banco de novo. */
  const avisarTelas = useCallback(async () => {
    await recarregar().catch(() => undefined);
    setVersao((v) => v + 1);
  }, [recarregar]);

  const aplicarPacote = useCallback(
    async (pacote: PacoteSuap) => {
      const semestre = await semestres.atual(banco);
      if (!semestre) return;
      const { boletim, extras } = lerPacoteSuap(pacote);
      // Boletim de outro período (ex.: o semestre virou): não mistura sozinho.
      if (periodoConfere(boletim, semestre) === false) throw new Error("periodoDiferente");
      const r = await sincronizarSuap(banco, semestre, boletim, extras, { cores: CORES });
      await novidades.registrar(banco, novidadesDoSuap(r));
      await avisarTelas();
    },
    [banco, avisarTelas],
  );

  /**
   * Na primeira vez (ou se falta algo), a busca é completa; depois, só o que
   * muda ao longo do semestre (boletim, notas, datas de prova).
   */
  const buscaCompleta = useCallback(async (forcar: boolean) => {
    if (forcar) return true;
    const semestre = await semestres.atual(banco);
    if (!semestre) return true;
    const [lista, grade, eventos] = await Promise.all([
      repoDisciplinas.listar(banco, semestre.id),
      repoHorarios.listarDoSemestre(banco, semestre.id),
      repoCalendario.listar(banco, semestre.id),
    ]);
    return precisaBuscaCompleta(lista, grade.length > 0, eventos.length > 0);
  }, [banco]);

  const atualizarSuap = useCallback(async (forcarCompleta = false) => {
    const servidor = isTauri() ? await lerServidorSuap(banco) : null;
    if (!servidor) return marcar("suap", INATIVO);
    marcar("suap", { estado: "buscando" });
    try {
      const resposta = await buscarSuapEscondido(servidor, await buscaCompleta(forcarCompleta));
      if ("semSessao" in resposta) return marcar("suap", { estado: "entrar" });
      await aplicarPacote(resposta.pacote);
      marcar("suap", { estado: "ok", em: new Date() });
    } catch (erro) {
      marcar("suap", { estado: "erro", mensagem: mensagemDe(erro) });
    }
  }, [banco, marcar, aplicarPacote, buscaCompleta]);

  const atualizarMoodle = useCallback(async () => {
    const site = isTauri() ? await lerSiteMoodle(banco) : null;
    if (!site || !(await moodleConectado(site).catch(() => false))) return marcar("moodle", INATIVO);
    marcar("moodle", { estado: "buscando" });
    try {
      const anterior = await lerCacheMoodle(banco);
      const { cache, atividades } = await buscarMoodle(site, anterior);
      const semestre = await semestres.atual(banco);
      const lista = semestre ? await repoDisciplinas.listar(banco, semestre.id) : [];
      const disciplinaDaSala = (salaId: number | null) => {
        const sala = cache.salas.find((s) => s.id === salaId);
        return sala ? (casarDisciplinaMoodle(sala, lista)?.id ?? null) : null;
      };

      const antes = new Set((await repoTarefas.listar(banco)).filter((t) => t.origem === "moodle").map((t) => t.origemId));
      await repoTarefas.importarMoodle(banco, atividades, (a) => disciplinaDaSala(a.disciplinaId));
      await gravarCacheMoodle(banco, cache);

      // Na primeira busca, tudo seria "novo": só vira novidade a partir da segunda.
      if (anterior) {
        const lista: NovaNovidade[] = [
          ...atividades
            .filter((a) => !antes.has(String(a.id)))
            .map((a): NovaNovidade => ({ tipo: "atividade_moodle", titulo: a.nome, detalhe: a.prazo, disciplinaId: disciplinaDaSala(a.disciplinaId) })),
          ...novidadesDoCache(anterior, cache, disciplinaDaSala),
        ];
        await novidades.registrar(banco, lista);
      }
      await avisarTelas();
      marcar("moodle", { estado: "ok", em: new Date() });
    } catch (erro) {
      marcar("moodle", { estado: "erro", mensagem: mensagemDe(erro) });
    }
  }, [banco, marcar, avisarTelas]);

  const atualizarEmail = useCallback(async () => {
    const endereco = isTauri() ? await configuracao.ler<string>(banco, "emailInstitucional") : null;
    if (!endereco || !(await emailConectado(endereco).catch(() => false))) return marcar("email", INATIVO);
    marcar("email", { estado: "buscando" });
    try {
      const { importantes } = await sincronizarEmail(banco, endereco);
      await novidades.registrar(
        banco,
        importantes.map((e) => ({ tipo: "email", titulo: e.assunto || "(sem assunto)", detalhe: e.deNome || e.deEmail })),
      );
      await avisarTelas();
      marcar("email", { estado: "ok", em: new Date() });
    } catch (erro) {
      marcar("email", { estado: "erro", mensagem: mensagemDe(erro) });
    }
  }, [banco, marcar, avisarTelas]);

  const atualizar = useCallback(async () => {
    if (rodando.current) return;
    rodando.current = true;
    try {
      await Promise.all([atualizarSuap(false), atualizarMoodle(), atualizarEmail()]);
    } finally {
      rodando.current = false;
      setPrimeiraFeita(true);
    }
  }, [atualizarSuap, atualizarMoodle, atualizarEmail]);

  const entrarNoSuap = useCallback(async () => {
    const servidor = await lerServidorSuap(banco);
    if (!servidor) return;
    pararEspera.current?.();
    marcar("suap", { estado: "buscando" });
    try {
      pararEspera.current = await buscarBoletimNoSuap(
        servidor,
        (pacote) => {
          pararEspera.current = null;
          aplicarPacote(pacote)
            .then(() => marcar("suap", { estado: "ok", em: new Date() }))
            .catch((erro) => marcar("suap", { estado: "erro", mensagem: mensagemDe(erro) }));
        },
        await buscaCompleta(false),
      );
    } catch (erro) {
      marcar("suap", { estado: "erro", mensagem: mensagemDe(erro) });
    }
  }, [banco, marcar, aplicarPacote, buscaCompleta]);

  const buscarTudoDoSuap = useCallback(async () => {
    if (rodando.current) return;
    rodando.current = true;
    try {
      await atualizarSuap(true);
    } finally {
      rodando.current = false;
    }
  }, [atualizarSuap]);

  // Uma vez ao abrir o app, quando já existe semestre e faculdade escolhida.
  const comecou = useRef(false);
  const pronto = !!dados && !!instituicao;
  useEffect(() => {
    if (!pronto || comecou.current) return;
    comecou.current = true;
    void atualizar();
  }, [pronto, atualizar]);

  useEffect(() => () => pararEspera.current?.(), []);

  const buscando = Object.values(fontes).some((f) => f.estado === "buscando");
  return (
    <ContextoSincronizacao.Provider value={{ fontes, buscando, versao, primeiraFeita, atualizar, entrarNoSuap, buscarTudoDoSuap }}>
      {children}
    </ContextoSincronizacao.Provider>
  );
}

export function useSincronizacao(): Sincronizacao {
  const contexto = useContext(ContextoSincronizacao);
  if (!contexto) throw new Error("useSincronizacao precisa estar dentro de <ProvedorSincronizacao>");
  return contexto;
}

/** Erros conhecidos viram uma chave de texto ("periodoDiferente"); o resto, a mensagem. */
function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroBoletim) return `boletim.${erro.motivo}`;
  return erro instanceof Error ? erro.message : String(erro);
}

function novidadesDoSuap(r: Awaited<ReturnType<typeof sincronizarSuap>>): NovaNovidade[] {
  return [
    ...r.provas.novas.map((a): NovaNovidade => ({ tipo: "prova_suap", titulo: a.titulo, detalhe: a.data, disciplinaId: a.disciplinaId })),
    ...r.provas.remarcadas.map((a): NovaNovidade => ({ tipo: "prova_remarcada", titulo: a.titulo, detalhe: a.data, disciplinaId: a.disciplinaId })),
    ...r.provas.removidas.map((titulo): NovaNovidade => ({ tipo: "prova_removida", titulo })),
    ...r.notasNovas.map((n): NovaNovidade => ({ tipo: "nota", titulo: n.descricao, detalhe: String(n.nota), disciplinaId: n.disciplinaId })),
  ];
}

/** Arquivos postados e notas lançadas no Moodle desde a busca anterior. */
function novidadesDoCache(
  anterior: CacheMoodle,
  atual: CacheMoodle,
  disciplinaDaSala: (salaId: number) => string | null,
): NovaNovidade[] {
  const lista: NovaNovidade[] = [];
  for (const sala of atual.salas) {
    const disciplinaId = disciplinaDaSala(sala.id);
    // Sala que não existia antes (ex.: inscrição nova): não inunda a caixa.
    const arquivosAntes = anterior.arquivos[sala.id];
    if (arquivosAntes) {
      const vistos = new Set(arquivosAntes.map((a) => a.url));
      for (const a of atual.arquivos[sala.id] ?? []) {
        if (!vistos.has(a.url)) lista.push({ tipo: "arquivo_moodle", titulo: a.nome, detalhe: a.recurso, disciplinaId });
      }
    }
    const notasAntes = anterior.notas[sala.id];
    if (notasAntes) {
      const antes = new Map(notasAntes.map((n) => [n.id, n.nota]));
      for (const n of atual.notas[sala.id] ?? []) {
        if (n.nota !== null && antes.get(n.id) !== n.nota) {
          lista.push({ tipo: "nota", titulo: n.nome, detalhe: n.maxima !== null ? `${n.nota}/${n.maxima}` : String(n.nota), disciplinaId });
        }
      }
    }
  }
  return lista;
}

