# Mapa de Veredictos — MTB Forecaster

## Escala de risco

| Risco | Veredicto |
|-------|-----------|
| 0 – 1 | ✅ DROP LIBERADO |
| 2 – 3 | ⚠️ DROP LIBERADO - Veja os alertas |
| ≥ 4   | 🛑 MELHOR ESPERAR |

> Limiares configuráveis na tabela `veredicto_limiares` (Supabase). Fallback: lim_liberado=1, lim_alertas=3.

---

## Fatores e pesos — tabela `veredicto_pesos`

### Aderência (base do risco)

| Fator | Peso | Quando ocorre |
|-------|------|---------------|
| aderencia_baixa | 4 | acumulo_ef acima do threshold de saturação |
| aderencia_boa | 2 | acumulo_ef entre threshold de grip e baixa |
| aderencia_boa_umido | 2 | solo seco mas garoa ativa (≥6h padrão úmido nas 48h) |
| aderencia_grip | 1 | acumulo_ef baixo, solo descansado |
| *(SECO)* | *0* | *acumulo_ef ≈ 0 e sem garoa — não tem fator, risco parte de zero* |

### Modificadores positivos (agravam)

| Fator | Peso | Condição |
|-------|------|----------|
| pico_3h_muito_alto | 3 | pico 3h ≥ 15mm |
| piora_prevista_severa | 2 | previsão 12h vai para BAIXA ADERÊNCIA |
| inclinacao_alta | 2 | inclinação > 30% com solo úmido ou chuva prevista |
| bikepark_saturado | 2 | bikepark com solo além do limiar de saturação |
| vento_estrutural_alto | 2 | vento histórico > 90 km/h |
| pico_3h_alto | 1 | pico 3h ≥ 10mm |
| piora_prevista | 1 | previsão 12h vai de SECO/GRIP para BOA ADERÊNCIA |
| rain_alto | 1 | chuva acumulada prevista ≥ 8mm |
| vento_alto | 1 | vento sustentado previsto ≥ 12 m/s |
| inclinacao_media | 1 | inclinação > 20% com solo úmido ou chuva prevista |
| trilha_natural_umida | 1 | trail_type=natural + BOA / BOA ÚMIDO / BAIXA |
| trilha_natural_inclinada | 1 | trail_type=natural + inclinação > 20% + chuva prevista |
| vento_estrutural_med | 1 | vento histórico 65–90 km/h |
| solo_encharcado | 1 | vento histórico 55–90 km/h com acumulo_ef ≥ threshold |
| rajada_prevista | 1 | rajada ≥ 30 km/h (aberta) ou ≥ 50 km/h (fechada) |

### Modificadores negativos (atenuam)

| Fator | Peso | Condição |
|-------|------|----------|
| bikepark_reduz | 1 | trail_type=bikepark **e status ≠ BAIXA ADERÊNCIA** |
| melhora_prevista | 1 | previsão 12h melhora a aderência atual |

---

## Cenários por veredicto

### ✅ DROP LIBERADO (risco 0–1)

| Cenário | Cálculo | Risco |
|---------|---------|-------|
| SECO | 0 | 0 |
| SECO + piora para BOA | 0 + 1 | 1 |
| GRIP PERFEITO | 1 | 1 |
| GRIP PERFEITO + bikepark | 1 − 1 | 0 |
| BOA ADERÊNCIA + bikepark | 2 − 1 | 1 |
| BOA ADERÊNCIA - ÚMIDO + bikepark | 2 − 1 | 1 |
| GRIP PERFEITO + bikepark + piora para BOA | 1 − 1 + 1 | 1 |

---

### ⚠️ DROP LIBERADO - Veja os alertas (risco 2–3)

| Cenário | Cálculo | Risco |
|---------|---------|-------|
| GRIP PERFEITO + rajada | 1 + 1 | 2 |
| GRIP PERFEITO + pico alto (≥10mm) | 1 + 1 | 2 |
| GRIP PERFEITO + vento estrutural forte | 1 + 1 | 2 |
| GRIP PERFEITO + piora severa → BAIXA | 1 + 2 | 3 |
| BOA ADERÊNCIA + bikepark + rajada | 2 − 1 + 1 | 2 |
| BOA ADERÊNCIA + bikepark + pico alto | 2 − 1 + 1 | 2 |
| BOA ADERÊNCIA + bikepark + piora severa | 2 − 1 + 2 | 3 |
| BOA ADERÊNCIA + bikepark + pico muito alto (≥15mm) | 2 − 1 + 3 | 4 → **ESPERAR** ✓ |
| BOA ADERÊNCIA natural | 2 + 1 | 3 |
| BOA ADERÊNCIA - ÚMIDO natural | 2 + 1 | 3 |
| BAIXA ADERÊNCIA + bikepark | 4 − 1 | 3 |
| BAIXA ADERÊNCIA + bikepark + melhora prevista | 4 − 1 − 1 | 2 |

---

### 🛑 MELHOR ESPERAR (risco ≥ 4)

| Cenário | Cálculo | Risco |
|---------|---------|-------|
| **BAIXA ADERÊNCIA sozinha** | 4 | 4 |
| BAIXA ADERÊNCIA natural | 4 + 1 | 5 |
| BAIXA ADERÊNCIA + inclinação > 20% | 4 + 1 | 5 |
| BAIXA ADERÊNCIA + pico alto | 4 + 1 | 5 |
| BAIXA ADERÊNCIA + vento estrutural | 4 + 1 | 5 |
| BAIXA ADERÊNCIA + piora severa | 4 + 2 | 6 |
| BAIXA ADERÊNCIA + bikepark saturado | 4 − 1 + 2 | 5 |
| BOA ADERÊNCIA + bikepark + pico muito alto | 2 − 1 + 3 | 4 |
| BOA ADERÊNCIA natural + pico muito alto | 2 + 1 + 3 | 6 |
| BOA ADERÊNCIA natural + piora severa | 2 + 1 + 2 | 5 |
| GRIP PERFEITO + pico muito alto (natural) | 1 + 3 | 4 |
| GRIP PERFEITO + piora severa + rajada | 1 + 2 + 1 | 4 |
| GRIP PERFEITO + piora severa + inclinação alta | 1 + 2 + 1 | 4 |
