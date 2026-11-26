/**
 * Atualização obrigatória ao abrir o app.
 *
 * Antes de mostrar qualquer tela, o app pergunta ao GitHub (latest.json da
 * última Release) se existe versão mais nova. Se existir, mostra só a tela
 * "Atualizando…", baixa o instalador, confere a ASSINATURA (o plugin só aceita
 * instalador assinado com a chave do projeto; um arquivo trocado no caminho é
 * recusado), instala e reabre o app.
 *
 * Sem internet, ou se o GitHub demorar, o app abre normalmente: o princípio
 * "local-first" vale mais do que estar na última versão.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Tempo máximo esperando o GitHub responder antes de abrir o app assim mesmo. */
const ESPERA_MS = 8_000;

type Estado =
  | { fase: "conferindo" }
  | { fase: "baixando"; versao: string; baixado: number; total: number | null }
  | { fase: "instalando"; versao: string }
  | { fase: "falhou"; versao: string; mensagem: string }
  | { fase: "pronto" };

/** `null` se não há versão nova, não deu para saber a tempo, ou a conferência falhou. */
async function conferir(): Promise<Update | null> {
  const tempo = new Promise<null>((resolver) => window.setTimeout(() => resolver(null), ESPERA_MS));
  try {
    return await Promise.race([check(), tempo]);
  } catch {
    // Sem internet, GitHub fora do ar, chave pública ainda não configurada...
    return null;
  }
}

export function Atualizador({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // No modo navegador e no `pnpm dev` não há o que atualizar.
  const ativo = isTauri() && !import.meta.env.DEV;
  const [estado, setEstado] = useState<Estado>(ativo ? { fase: "conferindo" } : { fase: "pronto" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    void (async () => {
      const atualizacao = await conferir();
      if (cancelado) return;
      if (!atualizacao) return setEstado({ fase: "pronto" });
      const versao = atualizacao.version;
      try {
        let baixado = 0;
        let total: number | null = null;
        setEstado({ fase: "baixando", versao, baixado, total });
        await atualizacao.downloadAndInstall((evento) => {
          if (evento.event === "Started") total = evento.data.contentLength ?? null;
          else if (evento.event === "Progress") baixado += evento.data.chunkLength;
          else if (evento.event === "Finished") return setEstado({ fase: "instalando", versao });
          setEstado({ fase: "baixando", versao, baixado, total });
        });
        // No Windows o instalador já fecha o app; nos outros sistemas, reabre aqui.
        await relaunch();
      } catch (erro) {
        if (!cancelado) setEstado({ fase: "falhou", versao, mensagem: String(erro) });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [ativo, tentativa]);

  if (estado.fase === "pronto") return <>{children}</>;
  if (estado.fase === "conferindo") return <main className="conteudo suave">{t("app.carregando")}</main>;

  const porcento =
    estado.fase === "baixando" && estado.total ? Math.min(100, Math.round((estado.baixado / estado.total) * 100)) : null;

  return (
    <main className="atualizando">
      <section className="cartao atualizando-caixa">
        <h1>{t("atualizacao.titulo", { versao: estado.versao })}</h1>
        {estado.fase === "falhou" ? (
          <>
            <p className="aviso">{t("atualizacao.falhou", { mensagem: estado.mensagem })}</p>
            <div className="acoes">
              <button type="button" className="botao primario" onClick={() => (setEstado({ fase: "conferindo" }), setTentativa((n) => n + 1))}>
                {t("atualizacao.tentarDeNovo")}
              </button>
              {/* Sem saída o aluno ficaria sem o app (e sem os dados dele) por um erro de rede. */}
              <button type="button" className="botao" onClick={() => setEstado({ fase: "pronto" })}>
                {t("atualizacao.continuar")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="suave">{estado.fase === "instalando" ? t("atualizacao.instalando") : t("atualizacao.baixando")}</p>
            <div className="barra-atualizacao" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcento ?? undefined}>
              <div style={{ width: `${estado.fase === "instalando" ? 100 : (porcento ?? 10)}%` }} />
            </div>
            <p className="pequeno suave">{t("atualizacao.dados")}</p>
          </>
        )}
      </section>
    </main>
  );
}
