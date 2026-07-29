-- Padroniza nomenclatura: o restante do schema/código já usa "rajada" em
-- português (alerta_rajada_kmh, vento_hist.rajada_max_kmh, rajada_prevista,
-- rajada_tempestade). As colunas de rajada prevista introduzidas na sessão
-- anterior tinham ficado em inglês ("gust"), criando duas convenções para o
-- mesmo conceito. RENAME COLUMN preserva os dados existentes.

ALTER TABLE condicoes RENAME COLUMN gust_max_kmh TO rajada_max_kmh;
ALTER TABLE condicoes RENAME COLUMN gust_12h TO rajada_12h;
ALTER TABLE condicoes RENAME COLUMN fds_d1_gust TO fds_d1_rajada;
ALTER TABLE condicoes RENAME COLUMN fds_d2_gust TO fds_d2_rajada;
ALTER TABLE condicoes RENAME COLUMN fds_d3_gust TO fds_d3_rajada;
ALTER TABLE previsao_blocos RENAME COLUMN gust_max TO rajada_max;
