# Mapa de Veredictos — MTB Forecaster

## Escala de risco

| Risco | Veredicto |
|-------|-----------|
| 0 – 1 | ✅ DROP LIBERADO |
| 2 – 3 | ⚠️ DROP LIBERADO - Veja os alertas |
| ≥ 4   | 🛑 MELHOR ESPERAR |

> Limiares configuráveis na tabela `veredicto_limiares` (Supabase). Fallback: lim_liberado=1, lim_alertas=3.

---

## Fatores e pesos

### Aderência (base do risco)

| Status de aderência | Risco base | Quando ocorre |
|---------------------|-----------|---------------|
| SECO | 0 | acumulo_ef ≈ 0 e sem garoa |
| GRIP PERFEITO | +1 | acumulo_ef baixo, solo descansado |
| BOA ADERÊNCIA - ÚMIDO | +2 | solo seco mas garoa ativa (≥6h padrão úmido nas 48h) |
| BOA ADERÊNCIA | +2 | acumulo_ef entre threshold de grip e baixa |
| BAIXA ADERÊNCIA | +3 | acumulo_ef acima do threshold de saturação |

### Modificadores positivos (agravam)

| Fator | Peso | Condição |
|-------|------|----------|
| Pico previsto muito alto | +2 | pico 3h ≥ 15mm |
| Pico previsto alto | +1 | pico 3h ≥ 10mm |
| Chuva acumulada alta | +1 | chuva próximas 48h ≥ 8mm |
| Vento forte (previsão) | +1 | vento sustentado ≥ 12 m/s |
| Inclinação muito alta | +2 | > 30% com solo úmido ou chuva prevista |
| Inclinação alta | +1 | > 20% com solo úmido ou chuva prevista |
| Trilha natural com solo úmido | +1 | trail_type=natural + BOA ADERÊNCIA / BOA ÚMIDO / BAIXA |
| Trilha natural inclinada | +1 | trail_type=natural + inclinação > 20% + chuva prevista |
| Bikepark saturado | +2 | bikepark com solo além do limiar de saturação |
| Vento estrutural — tempestade | +2 | histórico > 90 km/h |
| Vento estrutural — forte | +1 | histórico 65–90 km/h |
| Solo encharcado + vento forte | +1 | histórico 65–90 km/h com acumulo_ef ≥ threshold |
| Solo encharcado + vento moderado | +1 | histórico 55–65 km/h com acumulo_ef ≥ threshold |
| Rajada prevista | força risco ≥ 2 | ≥ 30 km/h (aberta) ou ≥ 50 km/h (fechada) |
| Piora prevista severa | +2 | previsão 12h vai para BAIXA ADERÊNCIA |
| Piora prevista | +1 | previsão 12h vai de SECO/GRIP para BOA ADERÊNCIA |

### Modificadores negativos (atenuam)

| Fator | Peso | Condição |
|-------|------|----------|
| Bikepark | −1 | trail_type=bikepark (drenagem e manutenção controlada) |
| Melhora prevista | −1 | previsão 12h melhora a aderência atual |

---

## Cenários por veredicto

### ✅ DROP LIBERADO (risco 0–1)

| Cenário | Cálculo | Risco |
|---------|---------|-------|
| SECO, sem fatores | 0 | 0 |
| SECO + piora para BOA | 0 + 1 | 1 |
| GRIP PERFEITO | 1 | 1 |
| GRIP PERFEITO + bikepark | 1 − 1 | 0 |
| BOA ADERÊNCIA + bikepark | 2 − 1 | 1 |
| BOA ADERÊNCIA - ÚMIDO + bikepark | 2 − 1 | **1** ← Reserva hoje |
| GRIP PERFEITO + bikepark + piora para BOA | 1 − 1 + 1 | 1 |
| BAIXA ADERÊNCIA + bikepark + melhora prevista | 3 − 1 − 1 | 1 |

---

### ⚠️ DROP LIBERADO - Veja os alertas (risco 2–3)

| Cenário | Cálculo | Risco |
|---------|---------|-------|
| GRIP PERFEITO + rajada ≥ 30 km/h (aberta) | força ≥ 2 | 2 |
| GRIP PERFEITO + pico ≥ 10mm | 1 + 1 | 2 |
| GRIP PERFEITO + vento estrutural forte | 1 + 1 | 2 |
| GRIP PERFEITO + piora severa → BAIXA | 1 + 2 | 3 |
| BOA ADERÊNCIA + bikepark + rajada | 2 − 1 = 1, força → | 2 |
| BOA ADERÊNCIA + bikepark + pico alto | 2 − 1 + 1 | 2 |
| BOA ADERÊNCIA + bikepark + piora severa | 2 − 1 + 2 | 3 |
| BOA ADERÊNCIA natural | 2 + 1 | 3 |
| BOA ADERÊNCIA - ÚMIDO natural | 2 + 1 | 3 |
| BAIXA ADERÊNCIA (sozinha) | 3 | 3 |
| BAIXA ADERÊNCIA + bikepark | 3 − 1 | 2 |
| BAIXA ADERÊNCIA + bikepark + melhora prevista | 3 − 1 − 1 | 1 → **LIBERADO** ⚠️ |

> **Atenção**: BAIXA ADERÊNCIA sozinha = risco 3 = alertas (não ESPERAR). Precisa de pelo menos +1 adicional para subir para MELHOR ESPERAR.

---

### 🛑 MELHOR ESPERAR (risco ≥ 4)

| Cenário | Cálculo | Risco |
|---------|---------|-------|
| BAIXA ADERÊNCIA natural | 3 + 1 | 4 |
| BAIXA ADERÊNCIA + pico alto | 3 + 1 | 4 |
| BAIXA ADERÊNCIA + inclinação > 20% | 3 + 1 | 4 |
| BAIXA ADERÊNCIA + vento estrutural forte | 3 + 1 | 4 |
| BAIXA ADERÊNCIA + bikepark saturado | 3 − 1 + 2 | 4 |
| BAIXA ADERÊNCIA + piora severa | 3 + 2 | 5 |
| BOA ADERÊNCIA natural + pico muito alto | 2 + 1 + 2 | 5 |
| BOA ADERÊNCIA natural + piora severa | 2 + 1 + 2 | 5 |
| BOA ADERÊNCIA + pico muito alto (bikepark) | 2 − 1 + 2 | 3 → **alertas** ⚠️ |
| GRIP PERFEITO + piora severa + vento forte | 1 + 2 + 1 | 4 |
| GRIP PERFEITO + piora severa + inclinação alta | 1 + 2 + 1 | 4 |
| Qualquer aderência + vento tempestade + solo encharcado | base + 2 + 1 | varia |

---

## Pontos de atenção para calibração

1. **BAIXA ADERÊNCIA sozinha = alertas, não ESPERAR** — a penalidade base (3) encosta no limiar mas não ultrapassa. Precisa de um agravante (natural, inclinação, pico, vento) para virar ESPERAR.

2. **BOA ADERÊNCIA + bikepark + pico muito alto** = 2 − 1 + 2 = **3** (alertas) — um bikepark com chuva pesada prevista fica em alertas mesmo com pico de 15mm.

3. **BAIXA ADERÊNCIA + bikepark + melhora prevista** = 3 − 1 − 1 = **1** (LIBERADO) — solo ruim hoje mas bikepark com melhora prevista pode chegar em LIBERADO. Avaliar se é coerente.

4. **Rajada força risco ≥ 2 mas não soma** — se o risco já estava em 3 por outros fatores, a rajada não eleva para ESPERAR. Considerar se deveria somar (+1) em vez de forçar mínimo.

5. **BOA ADERÊNCIA - ÚMIDO tem o mesmo peso de BOA ADERÊNCIA (+2)** — a diferença no veredicto final vem do tipo de trilha (natural +1) e dos demais fatores, não da aderência em si.
