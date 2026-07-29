-- Peso para trilhas naturais no modelo de secagem.
-- Trilhas naturais não têm drenagem projetada nem solo compactado,
-- retêm mais umidade que bikeparks e demoram mais para secar.
-- O multiplicador é aplicado sobre a meia_vida_base em _ajustar_meia_vida_clima().
--
-- Exemplo: terra/fechada base = 36h → com natural_meia_vida_mult = 1.15 → 41.4h
-- Bikepark comparativo: × 0.60 (fechado) → 21.6h

INSERT INTO configuracoes_sistema (chave, valor, grupo, descricao)
VALUES (
  'natural_meia_vida_mult',
  '1.15',
  'modelo',
  'Multiplicador aplicado sobre a meia_vida_base para trilhas do tipo "natural". Trilhas naturais não possuem drenagem projetada nem solo compactado, retendo umidade por mais tempo que bikeparks. Ex: terra/fechada base=36h → 36×1.15=41.4h. Bikepark equivalente recebe ×0.60 → 21.6h. Calibrável: valores entre 1.05 (efeito suave) e 1.30 (muito conservador). Padrão: 1.15'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
