-- Better Student: novidades para a caixa "Enquanto você estava fora".
--
-- Cada busca (SUAP, Moodle, e-mail) registra aqui o que trouxe de novo:
-- prova marcada, nota lançada, arquivo postado, e-mail de professor...
-- A caixa mostra as que ainda não foram vistas; ao fechar, ficam vistas.
-- Nada daqui é "dado oficial": é só um registro do que mudou.

CREATE TABLE novidade (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL,   -- 'prova_suap', 'prova_remarcada', 'prova_removida', 'nota',
                                 -- 'atividade_moodle', 'arquivo_moodle', 'email'
  titulo        TEXT NOT NULL,
  detalhe       TEXT,
  disciplina_id TEXT,
  criado_em     TEXT NOT NULL,
  vista_em      TEXT
);

CREATE INDEX ix_novidade_vista ON novidade(vista_em);
