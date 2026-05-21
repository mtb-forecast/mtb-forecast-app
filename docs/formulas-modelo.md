# MTB Forecast — Documentação Completa do Modelo

> Gerado a partir de `mtb-forecast.py`. Reflete o estado atual do código (branch develop).
> Atualizado após migração Supabase Fases 1–4: todos os dados de negócio removidos do Python
> e armazenados em tabelas Supabase, carregadas via REST API com cache em memória.

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
| Supabase | REST API | **14 tabelas** — solo, meia_vida, threshold, config, biomas, aderência, score |

### Tabelas Supabase carregadas no startup

| Tabela | Loader Python | Cache | Crítica? |
|---|---|---|---|
| `tabela_solo` | `_carregar_tabela_solo()` | `_CACHE_TABELA_SOLO` | Sim — sem fallback |
| `threshold_sazonal` | `_carregar_threshold_sazonal()` | `_CACHE_THRESHOLD_SAZONAL` | Sim — sem fallback |
| `meia_vida_secagem` | `_carregar_meia_vida()` | `_CACHE_MEIA_VIDA` | Sim — sem fallback |
| `enso_config` | `_carregar_enso_config()` | `_CACHE_ENSO_CONFIG` | Com fallback inline |
| `aderencia_thresholds` | `_carregar_aderencia_thresholds()` | `_CACHE_ADERENCIA_THRESHOLDS` | Com fallback inline |
| `veredicto_pesos` | `_carregar_veredicto_pesos()` | `_CACHE_VEREDICTO_PESOS` | Com fallback inline |
| `meia_vida_clima_mult` | `_carregar_meia_vida_clima_mult()` | `_CACHE_MEIA_VIDA_CLIMA_MULT` | Com fallback inline |
| `biomas` | `_carregar_biomas()` | `_CACHE_BIOMAS` | Com fallback inline |
| `solo_type_config` | `_carregar_solo_type_config()` | `_CACHE_SOLO_TYPE_CONFIG` | Com fallback inline |
| `inclinacao_config` | `_carregar_inclinacao_config()` | `_CACHE_INCLINACAO_CONFIG` | Com fallback inline |
| `score_config` | `_carregar_score_config()` | `_CACHE_SCORE_CONFIG` | Com fallback inline |
| `aderencia_descricoes` | `_carregar_aderencia_descricoes()` | `_CACHE_ADERENCIA_DESCRICOES` | Com fallback inline |
| `configuracoes_sistema` | `_get_config(chave)` | por chamada | Sem cache global |
| `localidades` | lookup de geocoding | — | Contexto geográfico |

> **Tabelas críticas** não têm fallback hardcoded. Se o Supabase estiver indisponível no startup,
> o agente loga `[ERRO CRÍTICO]` e pula as trilhas afetadas em vez de usar dados desatualizados.

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

Carregada do Supabase (`meia_vida_secagem`). **Sem fallback hardcoded** — se Supabase falhar, agente loga `[ERRO CRÍTICO]` e retorna `{}`.

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
meia_vida_base = meia_vida_secagem[(solo_type, exposicao)]
    → multiplicadores climáticos (em _ajustar_meia_vida_clima(), tabela meia_vida_clima_mult)
       incluindo vento_pct e sol_pct da tabela biomas
    → multiplicador bikepark (em _ajustar_meia_vida_clima(), tabela meia_vida_clima_mult)
    → clamp final [meia_vida_min, meia_vida_max] (configuracoes_sistema)
```

> **Nota:** O multiplicador de microclima (`fator_secagem` da antiga `microclima_config`) foi removido do pipeline. O efeito do dossel sobre a secagem é agora modelado indiretamente pelos coeficientes `vento_pct` e `sol_pct` da tabela `biomas`, que reduzem a efetividade do vento e da radiação solar — os principais drivers de evaporação.

### Multiplicadores climáticos (`_ajustar_meia_vida_clima()`)

Baseados em dados históricos das últimas 48h (médias de temp, vento, nuvens, umidade via OWM Timemachine). Carregados da tabela `meia_vida_clima_mult`. Todos os `ativo=true` são aplicados — primeiro match por variável vence.

**Coeficientes de dossel (tabela `biomas`, função `_lookup_bioma`):**

Antes de aplicar os multiplicadores climáticos, o agente lê `vento_pct` e `sol_pct` do bioma da trilha para ajustar as variáveis de clima ao nível do solo:

```python
bioma_cfg = _lookup_bioma(trail, mes)
vento_pct = bioma_cfg.get("vento_pct", 1.0)
sol_pct   = bioma_cfg.get("sol_pct",   1.0)

# Vento efetivo ao nível do solo:
wind_kmh = wind_ms * 3.6 * vento_pct

# Nebulosidade efetiva (dossel bloqueia a radiação solar que chegaria no solo):
cloud_efetivo = 100.0 - (100.0 - cloud_pct) * sol_pct
# Exemplo: Amazônia fechada (sol_pct=0.02), 30% nuvens → cloud_efetivo = 98.6% (sempre sombreado)
```

`vento_pct` reduz o vento da estação para o vento que realmente atinge o solo sob o dossel. `sol_pct` comprime a variação de nebulosidade: dossel fechado (sol_pct → 0) → nebulosidade efetiva → 100% independente do céu.

**Temperatura (variavel=`temperatura`):**

| Condição | Multiplicador | Observação |
|---|---|---|
| temp >= 35°C | × 0.65 | Seca muito mais rápido |
| 30 <= temp < 35°C | × 0.75 | |
| 26 <= temp < 30°C | × 0.86 | |
| temp <= 16°C | × 1.12 | Seca mais devagar |
| temp <= 10°C | × 1.22 | `ativo=false` — dead code; coberto pelo <= 16 acima |

**Vento (variavel=`vento`, unidade: km/h convertido de m/s via `× 3.6`):**

| Condição | Multiplicador |
|---|---|
| wind_kmh >= 40 | × 0.75 |
| 20 <= wind_kmh < 40 | × 0.85 |
| 10.8 <= wind_kmh < 20 (~3 m/s) | × 0.92 |
| wind_kmh <= 3.6 (≈ 1 m/s) | × 1.05 |

**Combo calor + vento (variavel=`combo`):**

Condição multi-variável — avaliada separadamente do helper `_aplicar()`:

```python
if temp_c >= 30 and wind_kmh >= 20:
    combo = next((r["multiplicador"] for r in registros if r["variavel"] == "combo"), None)
    if combo is not None:
        meia_vida *= combo   # → × 0.80 (redução adicional acumulada)
```

**Nebulosidade (variavel=`nebulosidade`):**

| Condição | Multiplicador |
|---|---|
| cloud_pct >= 90% | × 1.12 |
| 70 <= cloud_pct < 90% | × 1.06 |
| cloud_pct <= 25% | × 0.94 |

**Umidade relativa (variavel=`umidade`):**

| Condição | Multiplicador |
|---|---|
| humidity_pct >= 95% | × 1.15 |
| 85 <= humidity_pct < 95% | × 1.08 |
| humidity_pct <= 45% | × 0.93 |

### Multiplicador bikepark (variavel=`bikepark`)

Aplicado **após** todos os multiplicadores climáticos, antes do clamp. Carregado de `meia_vida_clima_mult` com filtro por `exposicao`:

| exposicao | Multiplicador | Razão |
|---|---|---|
| fechada | × 0.60 | Drenagem projetada + cobertura — seca rápido |
| aberta | × 0.35 | Terra compactada exposta — seca ainda mais rápido |

```python
if trail_type == "bikepark":
    expo = trail.get("exposicao", "aberta")
    _aplicar(0.0, "bikepark", exposicao=expo)
    # valor_min=null e valor_max=null → qualquer valor bate; exposicao filtra a linha correta
```

### Clamp final

Limites carregados de `configuracoes_sistema`:

```python
mv_min = float(_get_config("meia_vida_min") or 4.0)   # chave: meia_vida_min → 4
mv_max = float(_get_config("meia_vida_max") or 72.0)  # chave: meia_vida_max → 72
return round(max(mv_min, min(mv_max, meia_vida)), 1)
```

Mínimo 4h, máximo 72h — independente de qualquer combinação de multiplicadores.

---

## 4. Cálculo do `acumulo_ef`

### Fonte dos dados

Open-Meteo Archive (ERA5) — precipitação hora a hora das últimas 48h reais.

### Interceptação de dossel (`chuva_pct`)

Antes de acumular, a precipitação bruta da estação meteorológica é multiplicada por `chuva_pct` do bioma da trilha, que representa a fração de chuva que atravessa o dossel e realmente atinge o solo:

```python
mes       = datetime.now(BRT).month
chuva_pct = _lookup_bioma(trail, mes).get("chuva_pct", 1.0)

p_bruto = float(precips[i] or 0.0)
p       = p_bruto * chuva_pct   # interceptação de dossel

# ultima_chuva_h usa p_bruto >= 0.5 (chuva na estação, não no solo)
```

Exemplo: Amazônia fechada (`chuva_pct=0.175`), estação registrou 20mm → apenas 3.5mm chega ao solo.  
Trilha aberta (`chuva_pct=0.990`), 20mm → 19.8mm no solo.

### Fórmula

Para cada hora `i` no histórico, com precipitação efetiva `p_i` (já com `chuva_pct` aplicado), ocorrida `horas_atras` horas atrás:

```python
peso     = 0.5 ** (horas_atras / meia_vida)
efetivo += p_i * peso
```

Em notação matemática:

```
acumulo_ef = Σ (p_bruto_i × chuva_pct) × 0.5^(t_i / τ)
```

Onde `τ = meia_vida_h`, `t_i` é a quantidade de horas atrás que a chuva ocorreu, e `chuva_pct` vem da tabela `biomas`.

### `acumulo_48h` vs `acumulo_ef`

| Campo | Fórmula | Representa |
|---|---|---|
| `acumulo_48h` (bruto) | `sum(p_bruto_i)` | Chuva total da estação no período — sem dossel, sem secagem |
| `acumulo_ef` (efetivo) | `sum(p_bruto_i × chuva_pct × peso_i)` | Umidade ainda retida no solo, após interceptação do dossel e decaimento |

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

**Sem `clay_pct`** — fallback por `solo_type`, carregado de `solo_type_config` (coluna `fator_absorcao_base`):

| solo_type | fator_absorcao_base | Supabase |
|---|---|---|
| `terra` | 0.80 | `solo_type_config` |
| `preto` | 0.60 | `solo_type_config` |
| `misto` | 0.55 | `solo_type_config` |
| `misto_mg` | 0.45 | `solo_type_config` |
| `ferro` | 0.30 | `solo_type_config` |
| `pedra` | 0.25 | `solo_type_config` |

Se `solo_type_config` não retornar match, usa `base = 0.55` como fallback literal.

### Ajuste por altitude

Carregado de `solo_type_config` (colunas `altitude_bonus_min` e `altitude_bonus`). Todos os tipos têm `altitude_bonus_min=1200` e `altitude_bonus=0.05`:

```python
if solo_cfg and solo_cfg.get("altitude_bonus_min") is not None:
    if trail["altitude_m"] > solo_cfg["altitude_bonus_min"]:
        base += solo_cfg["altitude_bonus"]   # → +0.05 se altitude > 1200m
```

### Ajuste por inclinação

Carregado de `inclinacao_config`. Avaliados em ordem de id — primeiro match vence com `break`.

**Tipo `inclinacao`** (graus percentuais — prioritário quando `extensao_km` disponível):

```python
inclinacao = desnivel_m / (extensao_km * 1000) * 100  # em % de inclinação
```

| grau_min | grau_max | delta_fator | Condição |
|---|---|---|---|
| 30 | — | −0.22 | inclinacao >= 30% |
| 20 | 30 | −0.15 | 20% <= inclinacao < 30% |
| 10 | 20 | −0.08 | 10% <= inclinacao < 20% |

**Tipo `desnivel`** (metros brutos — fallback quando `extensao_km` ausente):

| grau_min | grau_max | delta_fator | Condição |
|---|---|---|---|
| 800 | — | −0.18 | desnivel_m >= 800m |
| 500 | 800 | −0.10 | 500m <= desnivel_m < 800m |
| 300 | 500 | −0.05 | 300m <= desnivel_m < 500m |

```python
inclinacao = calcular_inclinacao(trail)
if inclinacao is not None:
    for ic in (c for c in inclinacao_cfgs if c["tipo"] == "inclinacao"):
        if inclinacao >= ic["grau_min"] and (ic["grau_max"] is None or inclinacao <= ic["grau_max"]):
            base += ic["delta_fator"]
            break
elif trail.get("desnivel_m") is not None:
    d = trail["desnivel_m"]
    for ic in (c for c in inclinacao_cfgs if c["tipo"] == "desnivel"):
        if d >= ic["grau_min"] and (ic["grau_max"] is None or d <= ic["grau_max"]):
            base += ic["delta_fator"]
            break
```

### Clamp final

```python
return max(0.05, min(1.0, base))
```

### Relação com o status do rider

`fator_absorcao` multiplica o `impacto` → determina o `score` numérico (0–100).  
O `status` (SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA) **não passa por `fator_absorcao`**, mas é ajustado pelo `fator_microclima(trail)` aplicado sobre `efetivo_combinado` antes da comparação com os thresholds — ver Seção 7.

---

## 6. `calcular_score_trilha()`

Produz um score numérico 0–100 que representa o impacto da chuva no solo.

### Coeficientes — carregados de `score_config`

| Chave | Valor | Uso |
|---|---|---|
| `pico_threshold` | 10.0 | Limiar para ativar lógica de pico_3h |
| `coef_pico_descansado` | 0.7 | `impacto = pico_3h × 0.7` (solo descansado + pico >= threshold) |
| `coef_pico_molhado` | 1.0 | `impacto = pico_3h × 1.0` (solo saturado + pico >= threshold) |
| `coef_rain` | 0.6 | `impacto = rain_mm × 0.6` (solo descansado + pico < threshold) |
| `coef_acumulo` | 0.3 | `impacto = rain_mm + acumulo_ef × 0.3` (solo saturado + pico < threshold) |
| `coef_base` | 10.0 | `score = impacto × 10.0` (escala para 0–100) |
| `bikepark_acumulo_threshold` | 5.0 | Se `acumulo_ef < 5.0`: aplica `bikepark_score_mult` |
| `bikepark_score_mult` | 0.90 | Redução de impacto para bikepark não saturado |
| `bikepark_saturado_threshold` | 10.0 | Fallback quando `threshold_sazonal` indisponível |

### Fórmula completa

```python
sc              = _carregar_score_config()          # dict do Supabase
pico_thr        = sc.get("pico_threshold",   10.0)
coef_pico_desc  = sc.get("coef_pico_descansado", 0.7)
coef_pico_mol   = sc.get("coef_pico_molhado",    1.0)
coef_rain       = sc.get("coef_rain",        0.6)
coef_acumulo    = sc.get("coef_acumulo",     0.3)
coef_base       = sc.get("coef_base",       10.0)
bk_acumulo_thr  = sc.get("bikepark_acumulo_threshold", 5.0)
bk_score_mult   = sc.get("bikepark_score_mult",        0.90)

thresh = threshold_solo_descansado(mes, enso, trail)
fator  = fator_absorcao(trail)
solo_descansado = acumulo_ef < thresh

# Impacto bruto
if pico_3h >= pico_thr:
    impacto = pico_3h * (coef_pico_desc if solo_descansado else coef_pico_mol)
else:
    impacto = rain_mm * coef_rain if solo_descansado else (rain_mm + acumulo_ef * coef_acumulo)

# Multiplicadores
impacto *= fator                          # fator de absorção do solo

# FIX #7: solo_mult só aplicado quando clay_pct NÃO disponível
# Quando clay_pct vem da tabela mestra, fator_absorcao já é calculado por ele
if clay_pct is None:
    solo_cfg = next((c for c in _carregar_solo_type_config()
                     if c["solo_type"] == trail.get("solo_type", "terra")), None)
    impacto *= solo_cfg["score_mult"] if solo_cfg else 1.0

if trail_type == "bikepark" and acumulo_ef < bk_acumulo_thr:
    impacto *= bk_score_mult              # bikepark não saturado: leve redução

score = max(0.0, min(100.0, impacto * coef_base))
```

### `score_mult` por `solo_type` (de `solo_type_config`, aplicado apenas sem `clay_pct`)

| solo_type | score_mult |
|---|---|
| `terra` | 1.05 |
| `misto` | 1.00 |
| `preto` | 0.95 |
| `misto_mg` | 0.92 |
| `ferro` | 0.85 |
| `pedra` | 0.80 |

### Lógica de solo descansado vs. saturado

- **Solo descansado** (`acumulo_ef < thresh`): chuva nova tem impacto reduzido porque o solo aguenta mais
- **Solo saturado** (`acumulo_ef >= thresh`): cada mm de chuva nova impacta mais porque o solo já está cheio

---

## 7. `calcular_aderencia()` — status do rider

### Thresholds carregados de `aderencia_thresholds`

Os thresholds fixos da tabela são:

| status | ef_min | ef_max | Semântica do intervalo |
|---|---|---|---|
| SECO | — | 0.0 | `ef <= 0` (inclusivo — captura ef==0.0) |
| GRIP PERFEITO | 0.0 | 5.0 | `0 < ef < 5.0` |
| BOA ADERÊNCIA | 5.0 | 7.0 | `5.0 <= ef < 7.0` |
| BAIXA ADERÊNCIA | 7.0 | — | `ef >= 7.0` |

### Ajuste microclimático dos thresholds

Antes de comparar contra a tabela, o `efetivo_combinado` é normalizado pelo `fator_microclima(trail)`. Trilhas em Mata Atlântica fechada de altitude retêm umidade estruturalmente — o mesmo `acumulo_ef` causa mais degradação do que em terreno aberto. Dividir por um fator < 1.0 infla o valor comparado contra os thresholds fixos, tornando-os efetivamente mais rígidos:

```python
efetivo_combinado = acumulo_ef + pico_3h

fator_mc = fator_microclima(trail)   # 0.75 · 0.90 · 1.00 — lido de microclima_config
efetivo_threshold = efetivo_combinado / fator_mc if fator_mc > 0 else efetivo_combinado

status = "BAIXA ADERÊNCIA"  # default seguro
for thr in _carregar_aderencia_thresholds():
    acima  = ef_min is None or efetivo_threshold >= ef_min
    abaixo = (ef_max is None or
              (efetivo_threshold <= ef_max if ef_min is None else efetivo_threshold < ef_max))
    if acima and abaixo:
        status = thr["status"]
        break
```

**Limiares efetivos resultantes** (thresholds fixos ÷ fator_mc):

| Trilha | fator_mc | GRIP → BOA | BOA → BAIXA |
|---|---|---|---|
| Mata Atlântica + alt ≥ 600m + fechada | 0.75 | > **3.75 mm** | > **5.25 mm** |
| Mata Atlântica (demais) | 0.90 | > **4.5 mm** | > **6.3 mm** |
| Outros biomas / aberta sem microclima | 1.00 | > 5.0 mm | > 7.0 mm |

Exemplo: `acumulo_ef = 4mm` em Mata Atlântica alta fechada → `efetivo_threshold = 4 / 0.75 = 5.33` → **BOA ADERÊNCIA** (era GRIP PERFEITO com fator=1.0).

Os valores de `fator_mc` são ajustáveis via Supabase (`microclima_config.mult_threshold`) sem alteração de código. Quanto menor o valor, mais rígido o threshold efetivo.

### Fator de recuperação

Evita BAIXA ADERÊNCIA quando o solo está em processo de secagem dentro do normal sazonal. O multiplicador `2.5` é carregado de `configuracoes_sistema` (`aderencia_recovery_mult`):

```python
thresh_local = threshold_solo_descansado(mes, enso, trail)
recovery_mult = float(_get_config("aderencia_recovery_mult") or 2.5)
if status == "BAIXA ADERÊNCIA" and acumulo_ef < thresh_local * recovery_mult:
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

### Descrições de aderência (`_descricao_aderencia()`)

Textos carregados da tabela `aderencia_descricoes` (`UNIQUE(status, solo_type)`). Cadeia de fallback:

```python
descricoes = _carregar_aderencia_descricoes()        # dict[(status, solo_type)] → texto

if trail_type == "bikepark" and saturado:
    return descricoes.get(("BIKEPARK_SATURADO", "default")) or "<inline>"

texto = descricoes.get((status, solo_type)) \
     or descricoes.get((status, "default")) \
     or f"Solo em condição de {status.lower()}."
```

25 registros na tabela: 4 status × 6 solo_types + 1 entrada `BIKEPARK_SATURADO/default`.

---

## 8. Veredicto

### Sistema de pontuação de risco

Pesos e limiares carregados de `veredicto_pesos` (Supabase):

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

Carregado da tabela `enso_config` (Supabase). Limites usam semântica assimétrica para espelhar o if/elif original:
- El Niño: `min_v <= oni < max_v` (limite inferior inclusivo)
- La Niña: `min_v < oni <= max_v` (limite superior inclusivo)

```python
# Fases (em ordem de avaliação):
oni >= 1.5:           {"fase": "El Niño Forte",  "mult": 0.75}
0.5 <= oni < 1.5:     {"fase": "El Niño",        "mult": 0.85}
-0.5 < oni < 0.5:     {"fase": "ENSO Neutro",    "mult": 1.00}
-1.5 < oni <= -0.5:   {"fase": "La Niña",        "mult": 1.15}
oni <= -1.5:          {"fase": "La Niña Forte",  "mult": 1.25}
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

## 10. Coeficientes de dossel e microclima (tabela `biomas`)

### Fonte única de verdade

A tabela `biomas` centraliza todos os dados físicos por bioma e exposição. A função `_lookup_bioma(trail, mes)` é o único ponto de acesso — substitui `_carregar_microclima_config()`, `fator_microclima()` e a parte de `fator_secagem` de `_meia_vida()`.

### `fator_microclima(trail)`

Simplificado: retorna `_lookup_bioma(trail).get("fator_threshold", 1.0)`.

| Bioma | exposicao | altitude_min | fator_threshold | Razão |
|---|---|---|---|---|
| Mata Atlântica | fechada | 600m | 0.50 | Orografia + dossel alto = muito mais úmido |
| Mata Atlântica | fechada | — | 0.90 | Retenção estrutural da mata |
| Demais biomas | aberta | — | 1.00 (ou próximo) | Sem efeito microclimático rígido |

```python
def fator_microclima(trail: dict) -> float:
    return _lookup_bioma(trail).get("fator_threshold", 1.0)
```

### Efeito no threshold de solo descansado

```python
thresh = base_sazonal * enso["mult"] * fator_microclima(trail)
```

Threshold menor → solo considerado saturado com menos chuva acumulada → modelo mais conservador.

Exemplo: SP em junho, ENSO neutro, terra/fechada/Mata Atlântica/altitude 700m:
- `base = 8.0mm`, `enso["mult"] = 1.0`, `fator_microclima = 0.50`
- `thresh = 8.0 × 1.0 × 0.50 = 4.0mm`

### Efeito nos thresholds de aderência

O `fator_threshold` de `biomas` é reutilizado em `calcular_aderencia()` para normalizar o `efetivo_combinado` antes da comparação com `aderencia_thresholds`. Ver Seção 7 para fórmula e limiares efetivos por bioma.

### Efeito na meia-vida de secagem (indireto)

O efeito do dossel sobre a secagem é modelado pelos coeficientes `vento_pct` e `sol_pct`, que reduzem a efetividade dos multiplicadores de vento e nebulosidade em `_ajustar_meia_vida_clima()` (ver Seção 3). Não há mais um multiplicador direto de meia-vida na tabela de biomas.

**Resumo dos efeitos de `biomas` sobre o modelo:**

| Efeito | Campo/função | Onde | Resultado |
|---|---|---|---|
| Interceptação de dossel | `chuva_pct` | `fetch_historico_chuva_om()` | Menos chuva chega ao solo em matas fechadas |
| Threshold solo descansado menor | `fator_threshold` | `threshold_solo_descansado()` | Solo classificado como úmido com menos mm |
| Thresholds de aderência mais rígidos | `fator_threshold` | `calcular_aderencia()` | GRIP → BOA em 1.5mm (MA alta fechada) |
| Vento efetivo reduzido | `vento_pct` | `_ajustar_meia_vida_clima()` | Secagem mais lenta em matas densas |
| Nebulosidade efetiva elevada | `sol_pct` | `_ajustar_meia_vida_clima()` | Sempre "encoberto" sob dossel fechado |

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

Carregado do Supabase (`threshold_sazonal`). **Sem fallback hardcoded** — se Supabase falhar, agente loga `[ERRO CRÍTICO]` e retorna `{}`.

```python
tabela[regiao][mes] = (threshold_descansado, threshold_saturado)
```

### Valores de referência SP (exemplos — dados reais no Supabase)

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

### Valores de referência MG (exemplos — dados reais no Supabase)

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

---

## 13. Inventário completo — configuracoes_sistema

Chaves inseridas no Supabase pelas migrações Fases 1–4 (tabela `configuracoes_sistema`):

| Chave | Valor | Fase | Uso |
|---|---|---|---|
| `meia_vida_min` | 4 | Fase 2 | Clamp mínimo da meia_vida final (horas) |
| `meia_vida_max` | 72 | Fase 2 | Clamp máximo da meia_vida final (horas) |
| `aderencia_recovery_mult` | 2.5 | Fase 4 | Multiplicador do fator de recuperação de aderência |

Chaves de infra (inseridas em Fase 1 ou pré-existentes):

| Chave | Uso |
|---|---|
| `email_from` | Endereço do remetente de alertas por e-mail |
| `email_password` | Senha/app-password do remetente |
| `telegram_token` | Token do bot Telegram |
| `telegram_chat_ids` | Chat IDs separados por vírgula |
