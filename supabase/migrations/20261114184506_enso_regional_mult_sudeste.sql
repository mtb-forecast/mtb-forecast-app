
-- Calibração ENSO regional pra SUDESTE (SP/MG/RJ/ES)
-- Motivação: enso_regional_mult tinha SUL, NORTE, NORDESTE, CENTRO-OESTE, mas nenhuma
-- linha pra SUDESTE — _enso_mult_regional() caía no fallback genérico de enso_config
-- (0.75/0.85/1.00/1.15/1.25), que não é uma calibração regional de verdade, é o valor
-- que existia antes da regionalização. Direção estava certa (El Niño baixa o threshold
-- no Sudeste, igual no Sul), mas a magnitude nunca foi pensada pro Sudeste especificamente.
--
-- Evento de referência: El Niño muito forte ASO/2026 (ONI +2.46), com chuva acima do
-- normal tanto no Sul quanto no Sudeste.
--
-- Valores: mesma direção do Sul, mas atenuados — o sinal do El Niño/La Niña é
-- historicamente mais forte e mais consistente no Sul do que no Sudeste (literatura de
-- teleconexão ENSO no Brasil). Ainda assim claramente diferente do genérico anterior,
-- pra não depender mais de fallback.
INSERT INTO enso_regional_mult (fase, regiao, multiplicador) VALUES
  ('el_nino_forte', 'SUDESTE', 0.72),
  ('el_nino',       'SUDESTE', 0.82),
  ('neutro',        'SUDESTE', 1.00),
  ('la_nina',       'SUDESTE', 1.18),
  ('la_nina_forte', 'SUDESTE', 1.28)
ON CONFLICT DO NOTHING;
