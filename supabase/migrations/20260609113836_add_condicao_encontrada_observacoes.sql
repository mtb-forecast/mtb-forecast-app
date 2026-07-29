ALTER TABLE observacoes_trilha
ADD COLUMN IF NOT EXISTS condicao_encontrada text
CHECK (condicao_encontrada IN ('seco', 'grip', 'boa', 'baixa', 'lama'));
