ALTER TABLE biomas RENAME COLUMN chuva_pct TO chuva_penetracao;
ALTER TABLE biomas RENAME COLUMN vento_pct TO vento_penetracao;
ALTER TABLE biomas RENAME COLUMN sol_pct TO sol_penetracao;
ALTER TABLE biomas RENAME COLUMN chuva_pct_sazonal TO chuva_penetracao_sazonal;
ALTER TABLE biomas RENAME COLUMN vento_pct_sazonal TO vento_penetracao_sazonal;
ALTER TABLE biomas RENAME COLUMN sol_pct_sazonal TO sol_penetracao_sazonal;
ALTER TABLE biomas RENAME COLUMN fator_threshold TO tolerancia_bioma;