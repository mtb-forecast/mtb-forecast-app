-- =============================================================
-- Rename condicoes.pop_48h → pop_24h
-- Branch: develop
-- O campo sempre representou o pico de POP nas próximas 24h
-- (ver resumo_onecall() em mtb-forecast.py, que usa hourly[:24]).
-- O nome "pop_48h" era legado e enganoso; corrigido para refletir
-- a janela real. Não afeta cálculo de aderência/veredicto/secagem —
-- pop nunca foi input de fórmula, só campo informativo.
-- =============================================================

ALTER TABLE condicoes RENAME COLUMN pop_48h TO pop_24h;
