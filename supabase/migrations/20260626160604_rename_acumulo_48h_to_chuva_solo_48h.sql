-- Renomeia acumulo_48h → chuva_solo_48h para deixar claro que é a chuva
-- pós-interceptação de dossel (chuva que chega ao solo), diferente de
-- chuva_bruta_mm (o que caiu do céu, usado na narrativa para o rider).
--
-- IMPORTANTE: aplicar ANTES do deploy do código que usa o novo nome.
-- O agente Python e o frontend já foram atualizados neste commit.

ALTER TABLE condicoes RENAME COLUMN acumulo_48h TO chuva_solo_48h;
