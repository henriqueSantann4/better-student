-- Better Student: marca semestres com datas estimadas.
--
-- O boletim do SUAP não traz o início nem o fim das aulas. Quem começa pela
-- importação recebe datas estimadas (ex.: 01/08 a 20/12 no 2º semestre), e o
-- app lembra de corrigi-las. Editar as datas desliga a marca.

ALTER TABLE semestre ADD COLUMN datas_estimadas INTEGER NOT NULL DEFAULT 0 CHECK (datas_estimadas IN (0, 1));
