-- Armazena os fatores que levaram ao veredicto, para exibição no frontend
-- quando o veredicto é "DROP LIBERADO - Veja os alertas" sem alertas específicos
ALTER TABLE condicoes        ADD COLUMN IF NOT EXISTS motivo_veredicto text;
ALTER TABLE condicoes_strava ADD COLUMN IF NOT EXISTS motivo_veredicto text;
