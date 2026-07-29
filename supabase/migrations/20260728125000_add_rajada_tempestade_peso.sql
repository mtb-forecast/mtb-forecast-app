-- Rajada prevista (forecast, não histórico) como fator de risco no veredicto.
-- Cobre tempestade ainda não observada nas últimas 48h mas já presente no
-- forecast de vento — mesmo threshold de nivel_vento==3 (>90 km/h), aplicado
-- à rajada PREVISTA em vez da rajada histórica.
INSERT INTO veredicto_pesos (fator, peso, ativo) VALUES
  ('rajada_prevista',   1, true),
  ('rajada_tempestade', 3, true)
ON CONFLICT (fator) DO NOTHING;
