-- Better Student: versão HTML dos e-mails (para mostrar imagens e formatação).
--
-- A cópia local é apagada para ser baixada de novo na próxima atualização,
-- já com o HTML: é só uma cópia, o Gmail continua com tudo (e o lido/estrela
-- vem de lá).

ALTER TABLE email ADD COLUMN corpo_html TEXT;
DELETE FROM email;
