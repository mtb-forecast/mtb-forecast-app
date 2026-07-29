
ALTER TABLE trilhas
  ADD COLUMN IF NOT EXISTS link_referencia text,
  ADD COLUMN IF NOT EXISTS observacoes     text;
