-- Remove coluna previsao_24h (jsonb) de condicoes.
-- Dados migrados para tabela previsao_blocos (relacional, tipada).
-- Executar apenas após confirmar que previsao_blocos está sendo populada pelo agente.

ALTER TABLE condicoes DROP COLUMN IF EXISTS previsao_24h;
