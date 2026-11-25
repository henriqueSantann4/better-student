-- Better Student: cópia local dos e-mails da caixa de entrada (IMAP).
--
-- É uma CÓPIA, como um cache: o original fica no Gmail. Serve para a caixa
-- abrir rápido e funcionar sem internet. Tabela local, não sincronizada.
--
-- id = "<conta>|<uid_validity>|<uid>". O UID identifica a mensagem dentro da
-- caixa enquanto o UIDVALIDITY não muda; se mudar, o servidor renumerou tudo
-- e a cópia local daquela conta é refeita.
-- "lido" e "estrela" começam com o estado do Gmail e depois mudam só no app
-- (o app abre a caixa somente para leitura).

CREATE TABLE email (
  id           TEXT PRIMARY KEY,
  conta        TEXT NOT NULL,
  uid          INTEGER NOT NULL,
  uid_validity INTEGER NOT NULL,
  de_nome      TEXT NOT NULL DEFAULT '',
  de_email     TEXT NOT NULL DEFAULT '',
  assunto      TEXT NOT NULL DEFAULT '',
  trecho       TEXT NOT NULL DEFAULT '',
  corpo        TEXT NOT NULL DEFAULT '',
  data         TEXT NOT NULL,
  lido         INTEGER NOT NULL DEFAULT 0 CHECK (lido IN (0, 1)),
  estrela      INTEGER NOT NULL DEFAULT 0 CHECK (estrela IN (0, 1)),
  categoria    TEXT NOT NULL DEFAULT 'principal' CHECK (categoria IN ('principal', 'atualizacoes', 'divulgacao')),
  baixado_em   TEXT NOT NULL
);
CREATE INDEX idx_email_conta_data ON email(conta, data DESC);
CREATE INDEX idx_email_conta_uid ON email(conta, uid_validity, uid);
