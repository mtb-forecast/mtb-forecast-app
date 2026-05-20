# MTB Forecast — Documentação Completa do Modelo

> Gerado a partir de `mtb-forecast.py`. Reflete o estado atual do código (branch develop).

---

## 1. Fontes de dados

### APIs utilizadas

| API | Endpoint | Uso |
|---|---|---|
| OpenWeather One Call 3.0 | `/data/3.0/onecall` | Previsão horária futura (peso 70%) |
| OpenWeather Timemachine | `/data/3.0/onecall/timemachine` | Histórico clima (temp, vento, nuvens, umidade) |
| Open-Meteo Forecast | `api.open-meteo.com/v1/forecast` | Previsão futura (peso 30%) |
| Open-Meteo Archive (ERA5) | `archive-api.open-meteo.com/v1/archive` | Precipitação histórica real + vento histórico |
| NOAA CPC | `cpc.ncep.noaa.gov/data/indices/oni.ascii.txt` | Índice ONI para ENSO |
| Supabase | REST API | Tabelas mestras (solo, meia_vida, threshold, config) |

### Fusão 70/30 (processar_trilha)

Quando Open-Meteo está disponível, os campos de previsão são mesclados:

```python
rain    = round(oc["rain"]    * 0.7 + om["rain"]    * 0.3, 1)
wind    = round(oc["wind"]    * 0.7 + om["wind"]    * 0.3, 1)
pop     = round(oc["pop"]     * 0.7 + om["pop"]     * 0.3)
pico_3h = round(oc["pico_3h"] * 0.7 + om["pico_3h"] * 0.3, 1)
gust_max_ms = max(oc.get("gust_max", 0.0), om.get("gust_max", 0.0))  # máximo, não média
```

Se Open-Meteo falhar, apenas `oc` (OpenWeather) é usado, sem ponderação.

---

## 2. Dados históricos vs. previsão futura

### Campos históricos

| Campo (banco) | Fonte | Janela | O que representa |
|---|---|---|---|
| `acumulo_48h` | Open-Meteo Archive (ERA5) | últimas 48h reais | Chuva bruta acumulada no período |
| `acumulo_ef` | Open-Meteo Archive (ERA5) | últimas 48h com decaimento | Umidade retida no solo agora |
| `ultima_chuva_h` | Open-Meteo Archive (ERA5) | últimas 48h | Horas desde a última precipitação >= 0.5mm |
| `alerta_vento_kmh` | Open-Meteo Archive + OWM Timemachine | últimas 48h | Vento sustentado máximo histórico (km/h) |
| `alerta_rajada_kmh` | Open-Meteo Archive | últimas 48h | Rajada máxima histórica (km/h) |
| `meia_vida_h` | Calculado (tabela + ajustes) | — | Taxa de secagem do solo (horas para perder 50% da umidade) |

### Campos de previsão futura

| Campo (banco) | Fonte | Janela | O que representa |
|---|---|---|---|
| `rain_mm` | OWM 70% + OM 30% | próximas **24h** | Precipitação total prevista |
| `wind_ms` | OWM 70% + OM 30% | próximas **24h** | Vento sustentado máximo previsto (m/s) |
| `gust_max_kmh` | max(OWM, OM) | próximas **24h** | Rajada máxima prevista (km/h) |
| `pop_48h` | OWM 70% + OM 30% | próximas **24h** | Probabilidade máxima de chuva (%) |
| `pico_3h` | OWM 70% + OM 30% | próximas **48h** | Maior acumulado em janela de 3h consecutivas |

> **Nota:** `pico_3h` usa janela de 48h intencionalmente — captura picos extremos futuros.
> Os demais campos foram reduzidos para 24h para refletir a janela de decisão real do rider.

---

## 3. Modelo de solo — meia-vida de secagem

### Conceito

A umidade no solo decai exponencialmente. A meia-vida (`meia_vida_h`) é o tempo em horas necessário para que 50% da umidade retida seja dissipada.

### Tabela base por `solo_type` × `exposicao`

Carregada do Supabase (`meia_vida_secagem`). Fallback local:

| Solo | Aberta | Fechada |
|---|---|---|
| `ferro` | 8h | 14h |
| `pedra` | 6h | 10h |
| `preto` | 14h | 24h |
| `misto_mg` | 12h | 18h |
| `misto` | 18h | 28h |
| `terra` | 24h | 36h |

### Pipeline de cálculo da meia_vida final

```
meia_vida_base = tabela[(solo_type, exposicao)]
    → multiplicador Mata Atlântica (em _meia_vida())
    → multiplicadores climáticos (em _ajustar_meia_vida_clima())
    → multiplicador bikepark (em _ajustar_meia_vida_clima())
    → clamp final [4h, 72h]
```

### Multiplicador Mata Atlântica (`_meia_vida()`)

```python
if bioma == "Mata Atlântica":
    if altitude_m >= 600 and exposicao == "fechada":
        base *= 1.20   # orografia + dossel fechado = secagem muito mais lenta
    else:
        base *= 1.10   # retenção estrutural maior
```

### Multiplicadores climáticos (`_ajustar_meia_vida_clima()`)

Baseados em dados históricos das últimas 48h (médias de temp, vento, nuvens, umidade via OWM Timemachine).

**Temperatura:**

| Condição | Multiplicador |
|---|---|
| temp >= 35°C | × 0.65 (seca muito mais rápido) |
| temp >= 30°C | × 0.75 |
| temp >= 26°C | × 0.86 |
| temp <= 16°C | × 1.12 |
| temp <= 10°C | × 1.22 (seca muito mais devagar) |

**Vento:**

| Condição | Multiplicador |
|---|---|
| wind >= 40 km/h | × 0.75 |
| wind >= 20 km/h | × 0.85 |
| wind >= 10.8 km/h (~3 m/s) | × 0.92 |
| wind <= 1 m/s | × 1.05 |

**Fator combinado calor + vento:**

```python
if temp_c >= 30 and wind_kmh >= 20:
    meia_vida *= 0.80  # redução adicional acumulada
```

**Nebulosidade:**

| Condição | Multiplicador |
|---|---|
| cloud >= 90% | × 1.12 |
| cloud >= 70% | × 1.06 |
| cloud <= 25% | × 0.94 |

**Umidade relativa:**

| Condição | Multiplicador |
|---|---|
| humidity >= 95% | × 1.15 |
| humidity >= 85% | × 1.08 |
| humidity <= 45% | × 0.93 |

### Multiplicador bikepark

Aplicado **após** todos os multiplicadores climáticos, antes do clamp:

```python
if trail_type == "bikepark":
    if exposicao == "fechada":
        meia_vida *= 0.60
    else:  # aberta
        meia_vida *= 0.35
```

Terra compactada e drenagem projetada fazem o bikepark secar significativamente mais rápido que trilha natural equivalente.

### Clamp final

```python
return round(max(4.0, min(72.0, meia_vida)), 1)
```

Mínimo 4h, máximo 72h — independente de qualquer combinação de multiplicadores.

---

## 4. Cálculo do `acumulo_ef`

### Fonte dos dados

Open-Meteo Archive (ERA5) — precipitação hora a hora das últimas 48h reais.

### Fórmula

Para cada hora `i` no histórico, com precipitação `p_i` ocorrida `horas_atras` horas atrás:

```python
peso     = 0.5 ** (horas_atras / meia_vida)
efetivo += p_i * peso
```

Em notação matemática:

```
acumulo_ef = Σ p_i × 0.5^(t_i / τ)
```

Onde `τ = meia_vida_h` e `t_i` é a quantidade de horas atrás que a chuva `p_i` ocorreu.

### `acumulo_48h` vs `acumulo_ef`

| Campo | Fórmula | Representa |
|---|---|---|
| `acumulo_48h` (bruto) | `sum(p_i)` | Chuva total no período — sem levar em conta secagem |
| `acumulo_ef` (efetivo) | `sum(p_i × peso_i)` | Umidade ainda retida no solo no momento do cálculo |

Chuva de 48h atrás tem peso ≈ 0 (já secou). Chuva de 1h atrás tem peso ≈ 1 (ainda presente).

---

## 5. `fator_absorcao`

Representa o quanto a chuva impacta o solo — solos que absorvem mais têm fator maior e ficam mais impactados pela mesma quantidade de chuva.

### Cálculo base

**Com `clay_pct` disponível** (tabela mestra Supabase):

```python
base = 0.20 + (clay_pct / 100) * 1.60
base = max(0.25, min(0.90, base))
```

Exemplo: clay_pct=45 → base = 0.20 + 0.45 × 1.60 = **0.92** → clampado em **0.90**

**Sem `clay_pct`** (fallback por solo_type):

| solo_type | fator base |
|---|---|
| `terra` | 0.80 |
| `preto` | 0.60 |
| `misto` | 0.55 |
| `misto_mg` | 0.45 |
| `ferro` | 0.30 |
| `pedra` | 0.25 |

### Ajuste por altitude

```python
if altitude_m > 1200:
    base += 0.05
```

### Ajuste por inclinação

```python
# Se inclinacao calculável (desnivel_m / extensao_km disponíveis):
if inclinacao >= 30%:  base -= 0.22
elif inclinacao >= 20%: base -= 0.15
elif inclinacao >= 10%: base -= 0.08

# Fallback quando extensao_km ausente (só desnivel_m):
if desnivel_m >= 800: base -= 0.18
elif desnivel_m >= 500: base -= 0.10
elif desnivel_m >= 300: base -= 0.05
```

### Clamp final

```python
return max(0.05, min(1.0, base))
```

### Por que não afeta o status do rider

`fator_absorcao` multiplica o `impacto` → determina o `score` numérico (0–100).  
O `status` (SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA) é determinado diretamente por `efetivo_combinado = acumulo_ef + pico_3h`, **sem passar por `fator_absorcao`**.

---

## 6. `calcular_score_trilha()`

Produz um score numérico 0–100 que representa o impacto da chuva no solo.

### Fórmula completa

```python
thresh = threshold_solo_descansado(mes, enso, trail)
fator  = fator_absorcao(trail)
solo_descansado = acumulo_ef < thresh

# Impacto bruto
if pico_3h >= 10.0:
    impacto = pico_3h * (0.7 if solo_descansado else 1.0)
else:
    impacto = rain_mm * 0.6 if solo_descansado else (rain_mm + acumulo_ef * 0.3)

# Multiplicadores
impacto *= fator                                  # fator de absorção do solo

if clay_pct is None:                              # solo_mult só sem clay_pct
    solo_mult = {"pedra": 0.80, "ferro": 0.85,
                 "preto": 0.95, "misto_mg": 0.92,
                 "misto": 1.00, "terra": 1.05}
    impacto *= solo_mult[solo_type]

if trail_type == "bikepark" and acumulo_ef < 5.0:
    impacto *= 0.90                               # bikepark não saturado: leve redução

score = max(0.0, min(100.0, impacto * 10.0))
```

### Lógica de solo descansado vs. saturado

- **Solo descansado** (`acumulo_ef < thresh`): chuva nova tem impacto reduzido porque o solo aguenta mais
- **Solo saturado** (`acumulo_ef >= thresh`): cada mm de chuva nova impacta mais porque o solo já está cheio

---

## 7. `calcular_aderencia()` — status do rider

### Fórmula central

```python
efetivo_combinado = acumulo_ef + pico_3h

if efetivo_combinado == 0:    status = "SECO"
elif efetivo_combinado < 5.0: status = "GRIP PERFEITO"
elif efetivo_combinado < 7.0: status = "BOA ADERÊNCIA"
else:                         status = "BAIXA ADERÊNCIA"
```

### Fator de recuperação

Evita BAIXA ADERÊNCIA quando o solo está em processo de secagem dentro do normal sazonal:

```python
thresh_local = threshold_solo_descansado(mes, enso, trail)
if status == "BAIXA ADERÊNCIA" and acumulo_ef < thresh_local * 2.5:
    status = "BOA ADERÊNCIA"
```

### Regras especiais bikepark

```python
if trail_type == "bikepark":
    if acumulo_ef >= 5.0:
        pass  # BAIXA ADERÊNCIA permitida — bikepark saturado
    else:
        if status == "BAIXA ADERÊNCIA":
            status = "BOA ADERÊNCIA"  # teto: nunca BAIXA quando não saturado
    if acumulo_ef >= 2.0 and status == "SECO":
        status = "GRIP PERFEITO"  # nunca SECO com umidade real no solo
```

---

## 8. Veredicto

### Sistema de pontuação de risco

```python
risco = 0

# Aderência
BAIXA ADERÊNCIA  → risco += 3
BOA ADERÊNCIA    → risco += 2
GRIP PERFEITO    → risco += 1
SECO             → risco += 0

# Precipitação
pico_3h >= 15mm  → risco += 2
pico_3h >= 10mm  → risco += 1
rain_mm >= 8mm   → risco += 1

# Vento futuro
wind_ms >= 12 m/s → risco += 1

# Inclinação (só com umidade real: rain_mm > 0 ou acumulo_ef > 0)
inclinacao > 30%  → risco += 2
inclinacao > 20%  → risco += 1

# Trail type
bikepark          → risco -= 1
bikepark saturado → risco += 2 (adicional)
natural + inclinação > 20% + rain > 0 + BOA/BAIXA → risco += 1

# Vento histórico (vento_hist de fetch_vento_historico)
nivel 3 (>90 km/h)  → risco += 2
nivel 2 (65–90 km/h)→ risco += 1
nivel 2 + encharcado→ risco += 1 (adicional)
nivel 1 + encharcado→ risco += 1

# Rajada prevista (gust_max_kmh)
>= 30 km/h (aberta) ou >= 50 km/h (fechada) → risco = max(risco, 2)

# Aderência futura (próximas 24h por blocos de 6h)
piora severa (→ BAIXA) → risco += 2
piora moderada (→ BOA) → risco += 1
melhora prevista       → risco -= 1
```

### Classificação final

| Risco | Veredicto |
|---|---|
| 0 – 1 | **DROP LIBERADO** ✅ |
| 2 – 3 | **DROP LIBERADO - Veja os alertas** ⚠️ |
| >= 4 | **MELHOR ESPERAR** 🛑 |

### `veredicto_12h` vs. `veredicto`

| | veredicto | veredicto_12h |
|---|---|---|
| Janela de chuva | 24h (rain_mm) | 12h (rain_12h) |
| Janela de vento | 24h (wind_ms) | 12h (wind_12h) |
| Rajada | gust_max_kmh (24h) | gust_12h (12h) |
| Base do aderência | acumulo_ef atual | acumulo_ef atual (mesma base) |
| Uso | Card principal + veredicto | Badge "12h" no card |

---

## 9. ENSO (El Niño / La Niña)

### Fonte

NOAA CPC — arquivo `oni.ascii.txt`. Lido uma vez por execução, com cache em `_CACHE_ONI`.

### Classificação e multiplicadores

```python
def classificar_enso(oni: float) -> dict:
    if oni >= 1.5:  return {"fase": "El Niño Forte",  "mult": 0.75}
    elif oni >= 0.5: return {"fase": "El Niño",        "mult": 0.85}
    elif oni <= -1.5: return {"fase": "La Niña Forte", "mult": 1.25}
    elif oni <= -0.5: return {"fase": "La Niña",       "mult": 1.15}
    else:            return {"fase": "ENSO Neutro",    "mult": 1.00}
```

### Aplicação

O multiplicador ENSO é aplicado sobre o `threshold_solo_descansado`:

```python
thresh = base_sazonal * enso["mult"] * fator_microclima(trail)
```

- **El Niño** → threshold menor → solo considerado descansado com menos chuva → modelo mais permissivo
- **La Niña** → threshold maior → solo precisa de mais chuva para ser considerado saturado → modelo mais conservador

O ENSO **não aparece diretamente no card do rider** — influencia apenas os thresholds internos.

---

## 10. Microclima Mata Atlântica

### `fator_microclima(trail)`

```python
def fator_microclima(trail: dict) -> float:
    bioma = trail.get("bioma", "Desconhecido")
    if bioma not in {"Mata Atlântica"}:
        return 1.0
    if altitude_m >= 600 and exposicao == "fechada":
        return 0.75   # orografia + dossel = instabilidade muito maior
    return 0.90       # Mata Atlântica em geral
```

### Efeito no threshold de solo descansado

```python
thresh = base_sazonal * enso["mult"] * fator_microclima(trail)
```

Threshold menor → solo considerado saturado com menos chuva acumulada → modelo mais conservador.

Exemplo: SP em junho, ENSO neutro, terra/fechada/MA/altitude 800m:
- `base = 8.0mm`, `enso["mult"] = 1.0`, `fator_microclima = 0.75`
- `thresh = 8.0 × 1.0 × 0.75 = 6.0mm`

---

## 11. Campos exibidos no card do rider

### UMIDADE RETIDA (`acumulo_ef`)

- **Banco:** `condicoes.acumulo_ef`
- **O que é:** Umidade ainda presente no solo agora, calculada com decaimento exponencial sobre o histórico de 48h (ERA5)
- **Fórmula:** `Σ p_i × 0.5^(t_i / τ)` onde τ = meia_vida_h
- **Exibição:** valor em mm, recalculado no front-end com drift desde o `gerado_em`

### TRILHA SECA EM (derivado de `acumulo_ef` + `meia_vida_h`)

- **Banco:** calculado no front-end (`CondicaoCard.tsx > recalcularSolo()`)
- **Fórmula:** `max(0, meia_vida × log₂(efetivo_agora / GRIP_THRESHOLD))` onde `GRIP_THRESHOLD = 5.0mm`
- **O que é:** Estimativa de horas até o solo atingir condição de GRIP PERFEITO

### ÚLTIMA CHUVA (`ultima_chuva_h`)

- **Banco:** `condicoes.ultima_chuva_h`
- **O que é:** Horas desde a última precipitação >= 0.5mm (ERA5 archive)
- **Exibição:** Ajustado pelo drift: `ultima_chuva_h + horas_desde_gerado_em`

### CHUVA 48H (`acumulo_48h`)

- **Banco:** `condicoes.acumulo_48h`
- **O que é:** Precipitação bruta total nas últimas 48h reais (ERA5) — sem decaimento
- **Uso no modelo:** Contexto informativo; não entra diretamente nos thresholds (usa-se `acumulo_ef`)

### PICO PREV. 3H (`pico_3h`)

- **Banco:** `condicoes.pico_3h`
- **O que é:** Maior acumulado em qualquer janela de 3h consecutivas nas próximas 48h
- **Fórmula:** `max(sum(precip[i:i+3]) for i in range(len(precip)-2))`
- **Fonte:** OWM 70% + OM 30%, janela 48h (intencional — captura picos extremos futuros)

### VENTO PREV. 24H (`wind_ms`)

- **Banco:** `condicoes.wind_ms` (em m/s)
- **O que é:** Vento sustentado máximo previsto nas próximas 24h
- **Fonte:** OWM 70% + OM 30%, janela 24h
- **Exibição:** Convertido para km/h: `wind_ms × 3.6`

### RAJADA PREV. 24H (`gust_max_kmh`)

- **Banco:** `condicoes.gust_max_kmh` (em km/h)
- **O que é:** Rajada máxima prevista nas próximas 24h
- **Fonte:** `max(oc_gust_ms, om_gust_ms) × 3.6`

### VENTO HIST. 48H (`alerta_vento_kmh`)

- **Banco:** `condicoes.alerta_vento_kmh`
- **O que é:** Vento sustentado máximo observado nas últimas 48h reais
- **Fonte:** Média de Open-Meteo Archive (windspeed_10m) + OWM Timemachine — convertido para km/h

### RAJADA HIST. 48H (`alerta_rajada_kmh`)

- **Banco:** `condicoes.alerta_rajada_kmh`
- **O que é:** Rajada máxima observada nas últimas 48h reais
- **Fonte:** Open-Meteo Archive (windgusts_10m)

### PROB. CHUVA 24H (`pop_48h`)

- **Banco:** `condicoes.pop_48h` (nome legado — representa 24h após alteração)
- **O que é:** Probabilidade máxima de precipitação prevista nas próximas 24h (%)
- **Fonte:** OWM (0–1 × 100) 70% + OM (0–100) 30%, janela 24h

### `aderencia_status`

- **Banco:** `condicoes.aderencia_status`
- **Valores:** `SECO` / `GRIP PERFEITO` / `BOA ADERÊNCIA` / `BAIXA ADERÊNCIA`
- **Fórmula:** Ver seção 7 (`calcular_aderencia`)

### `veredicto`

- **Banco:** `condicoes.veredicto`
- **Valores:** `DROP LIBERADO` / `DROP LIBERADO - Veja os alertas` / `MELHOR ESPERAR`
- **Fórmula:** Ver seção 8 (sistema de pontuação de risco)

### Janela de pedal (`janela`)

- **Banco:** `condicoes.janela`
- **O que é:** Maior bloco contínuo de horas nas próximas 48h com: `pop < 30%`, `precipitação < 1mm/h` e `wind_speed < 15 m/s`
- **Fórmula:** Varre `hourly_oc` (One Call 3.0) hora a hora, identifica blocos limpos e retorna o maior

---

## 12. Thresholds sazonais

### Fonte

Carregado do Supabase (`threshold_sazonal`). Fallback em `_THRESHOLD_SAZONAL_REGIONAL`:

```python
tabela[regiao][mes] = (threshold_descansado, threshold_saturado)
```

### Valores fallback SP (padrão quando região não encontrada)

| Mês | Descansado | Saturado (bikepark) |
|---|---|---|
| Jan | 3.0mm | 7.0mm |
| Fev | 2.0mm | 6.0mm |
| Mar | 3.0mm | 7.0mm |
| Abr | 5.0mm | 10.0mm |
| Mai | 6.0mm | 12.0mm |
| Jun | 8.0mm | 15.0mm |
| Jul | 8.0mm | 15.0mm |
| Ago | 8.0mm | 15.0mm |
| Set | 8.0mm | 15.0mm |
| Out | 5.0mm | 10.0mm |
| Nov | 4.0mm | 9.0mm |
| Dez | 3.0mm | 7.0mm |

### Valores fallback MG

| Mês | Descansado | Saturado |
|---|---|---|
| Jan | 2.5mm | 6.5mm |
| Fev | 2.0mm | 6.0mm |
| Mar | 2.5mm | 6.5mm |
| Abr | 4.5mm | 9.0mm |
| Mai | 5.5mm | 11.0mm |
| Jun–Set | 7.0mm | 13.5mm |
| Out | 4.5mm | 9.0mm |
| Nov | 3.5mm | 8.0mm |
| Dez | 2.5mm | 6.5mm |

### Uso no modelo

**`threshold_descansado`** → `threshold_solo_descansado()`:
```python
thresh = base * enso["mult"] * fator_microclima(trail)
```
Define se `acumulo_ef < thresh` (solo descansado) ou saturado. Afeta `calcular_score_trilha()` e o fator de recuperação em `calcular_aderencia()`.

**`threshold_saturado`** → `threshold_bikepark_saturado()`:
```python
limite = sat * enso["mult"] * fator_microclima(trail)
saturado = (trail_type == "bikepark" and acumulo_ef > limite)
```
Define quando um bikepark é considerado saturado — liberando BAIXA ADERÊNCIA e adicionando pontos de risco no veredicto.
