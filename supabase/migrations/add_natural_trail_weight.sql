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
  'Multiplicador de meia-vida para trilhas naturais. Natural não tem drenagem projetada — seca mais lento que bikepark. Padrão: 1.15'
)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
