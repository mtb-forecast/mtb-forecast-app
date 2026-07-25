-- Status reportado pelo rider na avaliação (ex: trilha fechada, em manutenção).
-- Array com no máximo 2 valores simultâneos, dos 4 permitidos.
ALTER TABLE observacoes_trilha
ADD COLUMN IF NOT EXISTS status_trilha text[]
CHECK (
  status_trilha IS NULL
  OR (
    array_length(status_trilha, 1) <= 2
    AND status_trilha <@ ARRAY['fechada', 'manutencao', 'sem_manutencao', 'arvore_caida']::text[]
  )
);
