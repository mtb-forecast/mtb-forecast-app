# MTB Forecast — Documentação Completa do Modelo

> Gerado a partir de `mtb-forecast.py`. Reflete o estado atual do código (branch develop).
> Atualizado em jun/2026 com: arquitetura batch OM, remoção do OWM timemachine,
> modelo regional (enso_regional_mult, meia_vida por macro-região, cascata de thresholds),
> multiplicadores de garoa atualizados, colunas de auditoria em condicoes.

---

## 1. Fontes de dados

### APIs utilizadas

| API | Endpoint | Uso |
|---|---|---|
| OpenWeather One Call 3.0 | `/data/3.0/onecall` | Previsão horária futura (peso 70%) |
| OpenWeather Day Summary | `/data/3.0/onecall/day_summary` | Precipitação diária hoje + ontem — detector de lag OM |
| Open-Meteo Forecast (batch) | `api.open-meteo.com/v1/forecast` | Previsão futura (peso 30%) + batch multi-coordenada |
| Open-Meteo Archive ERA5 (batch) | `archive-api.open-meteo.com/v1/archive` | Precipitação + clima histórico real (temp, vento, nuvens, umidade) |
| NOAA CPC | `cpc.ncep.noaa.gov/data/indices/oni.ascii.txt` | Índice ONI para ENSO |
| Supabase | REST API | 16+ tabelas de configuração + dados operacionais |

> **Removido em jun/2026:** OpenWeather Timemachine (`/data/3.0/onecall/timemachine`).
> O endpoint retorna 1 ÚNICA hora por chamada (diferente da API 2.5). As 3 chamadas por trilha
> (offsets 0/24/48h) amostravam 3 horas de 48 — sempre o mesmo horário do dia — enviasando
> temperatura média para baixo e inflando a meia-vida de secagem. Substituído pelo batch
> histórico do OM, que entrega 48 amostras horárias por coordenada.

### Arquitetura batch Open-Meteo (jun/2026)

O agente usa **multi-coordenada** para cobrir todos os grupos de clima em 2 chamadas totais:

```
GET archive-api.open-meteo.com/v1/archive?
    latitude=a,b,c&longitude=x,y,z
    &hourly=temperature_2m,relativehumidity_2m,
            windspeed_10m,windgusts_10m,
            cloudcover,precipitation
    &past_days=2

Resposta com 1 coord: objeto único {"hourly": {...}}
Resposta com N coords: array [{"hourly": {...}}, {"hourly": {...}}, ...]
```

O código trata ambos os formatos. Fallback para chamadas individuais com retry se o batch falhar.

**Campo canônico de precipitação:** `precipitation` (= rain + showers + snow).
- NUNCA usar apenas `rain` — perde eventos convectivos (showers)
- NUNCA somar `rain + precipitation` — dupla contagem

### Detector de lag de assimilação OM

Open-Meteo `past_days` usa análise NWP (modelo numérico), não pluviômetro. Chuva de madrugada pode demorar horas para aparecer no OM. O `day_summary` OWM usa dados reais de estações:

```python
bruto_ow = owm_day_summary["precipitation"]["total"]  # hoje + ontem acumulado
bruto_om = sum(precips_om_horareis)                   # batch OM últimas 48h

# Ambos os brutos recebem chuva_pct antes da comparação
bruto_ow_ef = bruto_ow * chuva_pct
bruto_om_ef = bruto_om * chuva_pct

if bruto_ow_ef > bruto_om_ef + 1.0:
    # Lag detectado — OM ainda não assimilou a chuva recente
    diferenca = bruto_ow_ef - bruto_om_ef
    acumulo_ef += diferenca * 0.9  # peso conservador (protege o rider de falso "solo seco")
    log("[lag-om] trilha — OW=Xmm > OM=Ymm (+1.0) → +Zmm × 0.9 ao ef")
```

**Regra crítica:** `chuva_pct` DEVE ser aplicado a AMBAS as fontes antes de qualquer comparação. Comparar chuva crua de uma fonte com chuva interceptada de outra infla o histórico artificialmente em mata fechada.

### Tabelas Supabase carregadas no startup

| Tabela | Loader Python | Cache | Crítica? |
|---|---|---|---|
| `tabela_solo` | `_carregar_tabela_solo()` | `_CACHE_TABELA_SOLO` | Sim — sem fallback |
| `threshold_sazonal` | `_carregar_threshold_sazonal()` | `_CACHE_THRESHOLD_SAZONAL` | Sim — sem fallback |
| `meia_vida_secagem` | `_carregar_meia_vida()` | `_CACHE_MEIA_VIDA` | Sim — sem fallback |
| `enso_config` | `_carregar_enso_config()` | `_CACHE_ENSO_CONFIG` | Com fallback inline |
| `enso_regional_mult` | `_carregar_enso_regional_mult()` | `_CACHE_ENSO_REGIONAL` | Com fallback (usa enso_config) |
| `aderencia_thresholds` | `_carregar_aderencia_thresholds()` | `_CACHE_ADERENCIA_THRESHOLDS` | Com fallback inline |
| `veredicto_pesos` | `_carregar_veredicto_pesos()` | `_CACHE_VEREDICTO_PESOS` | Com fallback inline |
| `veredicto_limiares` | `_carregar_veredicto_limiares()` | `_CACHE_VEREDICTO_LIMIARES` | Com fallback inline |
| `meia_vida_clima_mult` | `_carregar_meia_vida_clima_mult()` | `_CACHE_MEIA_VIDA_CLIMA_MULT` | Com fallback inline |
| `biomas` | `_carregar_biomas()` | `_CACHE_BIOMAS` | Com fallback inline |
| `trail_type_config` | `_carregar_trail_type_config()` | `_CACHE_TRAIL_TYPE_CONFIG` | Com fallback inline |
| `solo_type_config` | `_carregar_solo_type_config()` | `_CACHE_SOLO_TYPE_CONFIG` | Com fallback inline |
| `inclinacao_config` | `_carregar_inclinacao_config()` | `_CACHE_INCLINACAO_CONFIG` | Com fallback inline |
| `score_config` | `_carregar_score_config()` | `_CACHE_SCORE_CONFIG` | Com fallback inline |
| `aderencia_descricoes` | `_carregar_aderencia_descricoes()` | `_CACHE_ADERENCIA_DESCRICOES` | Com fallback inline |
| `configuracoes_sistema` | `_get_config(chave)` | por chamada | Sem cache global |

> **Tabelas críticas** não têm fallback hardcoded. Se o Supabase estiver indisponível no startup,
> o agente loga `[ERRO CRÍTICO]` e pula as trilhas afetadas.

### Fusão 70/30 (processar_trilha)

Quando Open-Meteo está disponível, os campos de previsão são mesclados:

```python
rain    = round(oc["rain"]    * 0.7 + om["rain"]    * 0.3, 1)
wind    = round(oc["wind"]    * 0.7 + om["wind"]    * 0.3, 1)
pop     = round(oc["pop"]     * 0.7 + om["pop"]     * 0.3)
pico_3h = round(oc["pico_3h"] * 0.7 + om["pico_3h"] * 0.3, 1)
gust_max_ms = max(oc.get("gust_max", 0.0), om.get("gust_max", 0.0))  # máximo, não média
```

---

## 2. Dados históricos vs. previsão futura

### Campos históricos

| Campo (banco) | Fonte | Janela | O que representa |
|---|---|---|---|
| `acumulo_48h` | Open-Meteo Archive ERA5 (batch) | últimas 48h reais | Chuva bruta acumulada no período |
| `acumulo_ef` | Open-Meteo Archive ERA5 (batch) + lag OWM | últimas 48h com decaimento | Umidade retida no solo agora |
| `ultima_chuva_h` | Open-Meteo Archive ERA5 (batch) | últimas 48h | Horas desde a última precipitação >= 0.5mm |
| `alerta_vento_kmh` | Open-Meteo Archive ERA5 (batch) | últimas 48h | Vento sustentado máximo histórico (km/h) |
| `alerta_rajada_kmh` | Open-Meteo Archive ERA5 (batch) | últimas 48h | Rajada máxima histórica (km/h) |
| `meia_vida_h` | Calculado (tabela + ajustes) | — | Taxa de secagem do solo |
| `cloud_pct` | Open-Meteo Archive ERA5 (batch) | últimas 48h | Cobertura de nuvens média (%) — auditoria |
| `humidity_pct` | Open-Meteo Archive ERA5 (batch) | últimas 48h | Umidade relativa média (%) — auditoria |
| `temp_media_c` | Open-Meteo Archive ERA5 (batch) | últimas 48h | Temperatura média (°C) — auditoria |
| `meia_vida_base_h` | Calculado (tabela base) | — | Meia-vida antes dos multiplicadores climáticos — auditoria |

> **Nota:** OWM Timemachine foi removido em jun/2026. Todos os dados históricos vêm exclusivamente
> do batch Open-Meteo Archive. O campo `historico_atualizado_em` e o zero-rain shortcircuit também
> foram removidos — com o batch OM a economia de chamadas é irrelevante.

### Campos de previsão futura

| Campo (banco) | Fonte | Janela | O que representa |
|---|---|---|---|
| `rain_mm` | OWM 70% + OM 30% | próximas **24h** | Precipitação total prevista |
| `wind_ms` | OWM 70% + OM 30% | próximas **24h** | Vento sustentado máximo previsto (m/s) |
| `gust_max_kmh` | max(OWM, OM) | próximas **24h** | Rajada máxima prevista (km/h) |
| `pop_48h` | OWM 70% + OM 30% | próximas **24h** | Probabilidade máxima de chuva (%) — nome legado |
| `pico_3h` | OWM 70% + OM 30% | próximas **48h** | Maior acumulado em janela de 3h consecutivas |

> **Nota:** `pico_3h` usa janela de 48h intencionalmente — captura picos extremos futuros.

---

## 3. Modelo regional (jun/2026)

### Mapeamento UF → macro-região

```python
_UF_MACRO_REGIAO = {
    # NORTE
    "AC": "NORTE", "AM": "NORTE", "AP": "NORTE",
    "PA": "NORTE", "RO": "NORTE", "RR": "NORTE", "TO": "NORTE",
    # NORDESTE
    "AL": "NORDESTE", "BA": "NORDESTE", "CE": "NORDESTE",
    "MA": "NORDESTE", "PB": "NORDESTE", "PE": "NORDESTE",
    "PI": "NORDESTE", "RN": "NORDESTE", "SE": "NORDESTE",
    # CENTRO-OESTE
    "DF": "CENTRO-OESTE", "GO": "CENTRO-OESTE",
    "MS": "CENTRO-OESTE", "MT": "CENTRO-OESTE",
    # SUDESTE
    "ES": "SUDESTE", "MG": "SUDESTE", "RJ": "SUDESTE", "SP": "SUDESTE",
    # SUL
    "PR": "SUL", "RS": "SUL", "SC": "SUL",
}

def _macro_regiao(uf: str) -> str:
    return _UF_MACRO_REGIAO.get(uf.upper(), "SUDESTE")  # fallback SUDESTE
```

### Meia-vida regional (`meia_vida_secagem.regiao`)

O campo `regiao` aceita `DEFAULT` ou nome de macro-região. Cascata de lookup:
1. Busca por `(solo_type, exposicao, macro_regiao_exata)`
2. Se não encontrado: `(solo_type, exposicao, "DEFAULT")`

**Valores `terra/fechada` por macro-região:**

| regiao | meia_vida_h | Razão física |
|---|---|---|
| DEFAULT / SUDESTE | 36h | Referência calibrada para SP/MG/RJ/ES |
| SUL | 46h | Inverno com temperatura ≤ 10°C reduz evapotranspiração |
| NORTE | 56h | Umidade relativa ≥ 90% permanente — equilíbrio de solo praticamente constante |
| NORDESTE | 23h | Temperatura ≥ 30°C + umidade ≤ 50% na estação seca — secagem acelerada |
| CENTRO-OESTE | 31h | Cerrado: seco em abril–setembro, úmido em outubro–março |

### Cascata de thresholds sazonais (`_threshold_tabela`)

```python
def _threshold_tabela(regiao: str, mes: int) -> tuple:
    uf = regiao.upper()
    # 1. Busca por UF exata
    if uf in tabela and mes in tabela[uf]:
        return tabela[uf][mes]
    # 2. Busca pela macro-região
    macro = _macro_regiao(uf)
    if macro in tabela and mes in tabela[macro]:
        return tabela[macro][mes]
    # 3. DEFAULT
    if "DEFAULT" in tabela and mes in tabela["DEFAULT"]:
        return tabela["DEFAULT"][mes]
    return (5.0, 10.0)  # fallback hardcoded de emergência
```

UFs com entrada própria na tabela: SP, MG, RJ, SC, RS, PR.
Demais UFs: herdam da macro-região ou DEFAULT.

### ENSO regional (`_enso_mult_regional`)

```python
def _enso_mult_regional(enso: dict, uf: str) -> float:
    macro = _macro_regiao(uf)
    fase_raw = enso.get("fase_raw", "neutro")
    chave = (fase_raw, macro)
    return _CACHE_ENSO_REGIONAL.get(chave, enso.get("mult", 1.0))
```

**Lógica inversa NORTE/NORDESTE:**
El Niño no Norte/Nordeste = padrão de SECA → threshold SOBE → modelo mais conservador (mult > 1.0).
Isso é o oposto do Sul/Sudeste, onde El Niño = mais chuva → threshold DESCE.

**Multiplicadores por macro-região e fase:**

| macro_regiao | el_nino_forte | el_nino | neutro | la_nina | la_nina_forte |
|---|---|---|---|---|---|
| SUDESTE | 0.72 | 0.82 | 1.00 | 1.18 | 1.30 |
| SUL | 0.69 | 0.79 | 1.00 | 1.22 | 1.37 |
| NORTE | 1.25 | 1.18 | 1.00 | 0.82 | 0.75 |
| NORDESTE | 1.35 | 1.25 | 1.00 | 0.78 | 0.70 |
| CENTRO-OESTE | 0.90 | 0.94 | 1.00 | 1.06 | 1.12 |

---

## 4. Modelo de solo — meia-vida de secagem

### Conceito

A umidade no solo decai exponencialmente. A meia-vida (`meia_vida_h`) é o tempo em horas necessário para que 50% da umidade retida seja dissipada.

### Pipeline de cálculo da meia_vida final

```
1. meia_vida_base = meia_vida_secagem[(solo_type, exposicao, regiao)]
   └─ cascata: regiao_exata → DEFAULT
   └─ gravado em condicoes.meia_vida_base_h (auditoria)

2. _ajustar_meia_vida_clima() — multiplicadores climáticos
   ├─ temperatura    (tabela meia_vida_clima_mult)
   ├─ vento          (ajustado por vento_pct do bioma)
   ├─ combo calor+vento
   ├─ nebulosidade   (ajustada por sol_pct do bioma)
   ├─ umidade
   └─ combo garoa    (umidade≥85% E nuvem≥70% → × 1.10 adicional)

3. _lookup_trail_type() — multiplicador trail_type × exposicao
   (tabela trail_type_config)

4. clamp final: max(meia_vida_min, min(meia_vida_max, meia_vida))
   Limites: 4h a 72h (configuracoes_sistema)
```

### Multiplicadores climáticos (`_ajustar_meia_vida_clima()`)

Baseados em dados históricos das últimas 48h (batch OM Archive). Carregados da tabela `meia_vida_clima_mult`.

**Coeficientes de dossel (tabela `biomas`, função `_lookup_bioma`):**

Antes de aplicar os multiplicadores climáticos, o agente lê `vento_pct` e `sol_pct` do bioma:

```python
bioma_cfg = _lookup_bioma(trail, mes)
vento_pct = bioma_cfg.get("vento_pct", 1.0)
sol_pct   = bioma_cfg.get("sol_pct",   1.0)

# Vento efetivo ao nível do solo (OM entrega em km/h — converter para m/s se necessário):
wind_kmh_efetivo = wind_kmh * vento_pct

# Nebulosidade efetiva (dossel bloqueia a radiação solar):
cloud_efetivo = 100.0 - (100.0 - cloud_pct) * sol_pct
# Amazônia fechada (sol_pct=0.02), 30% nuvens → cloud_efetivo = 98.6% (sempre sombreado)
```

**Temperatura (variavel=`temperatura`):**

| Condição | Multiplicador |
|---|---|
| temp >= 35°C | × 0.65 |
| 30 <= temp < 35°C | × 0.75 |
| 26 <= temp < 30°C | × 0.86 |
| temp <= 16°C | × 1.12 |

**Vento (variavel=`vento`, unidade: km/h × `vento_pct` do bioma):**

| Condição | Multiplicador |
|---|---|
| wind_kmh >= 40 | × 0.75 |
| 20 <= wind_kmh < 40 | × 0.85 |
| 10.8 <= wind_kmh < 20 | × 0.92 |
| wind_kmh <= 3.6 | × 1.05 |

**Combo calor + vento (variavel=`combo`):**

```python
if temp_c >= 30 and wind_kmh >= 20:
    combo = next((r["multiplicador"] for r in registros if r["variavel"] == "combo"), None)
    if combo is not None:
        meia_vida *= combo   # × 0.80 adicional
```

**Nebulosidade (variavel=`nebulosidade`, usando `cloud_efetivo`):**

| Condição | Multiplicador | (atualizado jun/2026) |
|---|---|---|
| cloud_pct >= 90% | × 1.20 | era × 1.12 |
| 70 <= cloud_pct < 90% | × 1.06 | sem alteração |
| cloud_pct <= 25% | × 0.94 | sem alteração |

**Umidade relativa (variavel=`umidade`):**

| Condição | Multiplicador | (atualizado jun/2026) |
|---|---|---|
| humidity_pct >= 95% | × 1.25 | era × 1.15 |
| 85 <= humidity_pct < 95% | × 1.18 | era × 1.08 |
| humidity_pct <= 45% | × 0.93 | sem alteração |

**Combo garoa (variavel=`umidade_nebulosidade_combo`) — NOVO jun/2026:**

Aplicado APÓS os multiplicadores individuais, captura a interação específica entre céu fechado e ar saturado (condição de garoa persistente):

```python
if humidity_pct >= 85 and cloud_pct >= 70:
    combo_garoa = next((r["multiplicador"] for r in registros
                        if r["variavel"] == "umidade_nebulosidade_combo"), None)
    if combo_garoa is not None:
        meia_vida *= combo_garoa  # × 1.10 adicional
    # se a linha não existir na tabela: passa sem efeito (seguro)
```

**Efeito máximo empilhado em dia de garoa fria:**
`base × 1.25 (umidade≥95%) × 1.20 (nuvem≥90%) × 1.10 (combo) ≈ × 1.65`

**Motivação:** dias com garoa persistente não acumulam mm significativos mas mantêm solo úmido. Os multiplicadores individuais existiam; o combo captura a interação — céu fechado + ar saturado = secagem muito mais lenta.

### Multiplicador trail_type × exposição (`trail_type_config`)

Aplicado após todos os multiplicadores climáticos, antes do clamp:

| trail_type | exposicao | meia_vida_mult |
|---|---|---|
| `natural` | aberta | × 1.08 |
| `natural` | mista | × 1.15 |
| `natural` | fechada | × 1.30 |
| `bikepark` | aberta | × 0.35 |
| `bikepark` | mista | × 0.48 |
| `bikepark` | fechada | × 0.60 |

### Clamp final

```python
mv_min = float(_get_config("meia_vida_min") or 4.0)   # 4h
mv_max = float(_get_config("meia_vida_max") or 72.0)  # 72h
return round(max(mv_min, min(mv_max, meia_vida)), 1)
```

---

## 5. Cálculo do `acumulo_ef`

### Fonte dos dados

Open-Meteo Archive ERA5 — `precipitation` hora a hora das últimas 48h reais.
**Sempre usar o campo `precipitation`** (= rain + showers + snow), nunca apenas `rain`.

### Interceptação de dossel (`chuva_pct`)

```python
mes       = datetime.now(BRT).month
chuva_pct = _lookup_bioma(trail, mes).get("chuva_pct", 1.0)

p_bruto = float(precips[i] or 0.0)
p       = p_bruto * chuva_pct   # interceptação de dossel

# ultima_chuva_h usa p_bruto >= 0.5 (chuva na estação, não no solo)
```

Exemplo: Amazônia fechada (`chuva_pct=0.175`), estação registrou 20mm → apenas 3.5mm no solo.

### Fórmula

```python
peso     = 0.5 ** (horas_atras / meia_vida)
efetivo += p_i * peso  # p_i já com chuva_pct aplicado
```

Em notação matemática:

```
acumulo_ef = Σ (p_bruto_i × chuva_pct) × 0.5^(t_i / τ)
```

Onde `τ = meia_vida_h`, `t_i` é a quantidade de horas atrás que a chuva ocorreu.

### Aplicação do lag OWM (detector de assimilação)

Após calcular `acumulo_ef` via OM, o detector de lag adiciona a diferença ponderada se detectado:

```python
if bruto_ow_ef > bruto_om_ef + 1.0:
    diferenca = bruto_ow_ef - bruto_om_ef
    acumulo_ef += diferenca * 0.9
```

O peso 0.9 é conservador: protege o rider de falso "solo seco" sem inflar excessivamente o acúmulo.

---

## 6. `fator_absorcao`

Representa o quanto a chuva impacta o solo.

### Cálculo base

**Com `clay_pct` disponível** (tabela `tabela_solo`):

```python
base = 0.20 + (clay_pct / 100) * 1.60
base = max(0.25, min(0.90, base))
```

**Sem `clay_pct`** — fallback por `solo_type` (`solo_type_config.fator_absorcao_base`):

| solo_type | fator_absorcao_base |
|---|---|
| `terra` | 0.80 |
| `preto` | 0.60 |
| `misto` | 0.55 |
| `misto_mg` | 0.45 |
| `ferro` | 0.30 |
| `pedra` | 0.25 |

### Ajuste por altitude

```python
if trail["altitude_m"] > altitude_bonus_min:   # 1200m
    base += altitude_bonus                       # +0.05
```

### Ajuste por inclinação

Tipo `inclinacao` (prioritário quando `extensao_km` disponível):
```python
inclinacao = desnivel_m / (extensao_km * 1000) * 100
```

| tipo | valor_min | valor_max | delta_fator |
|---|---|---|---|
| `inclinacao` | 30% | — | −0.22 |
| `inclinacao` | 20% | 30% | −0.15 |
| `inclinacao` | 10% | 20% | −0.08 |
| `desnivel` | 800m | — | −0.18 |
| `desnivel` | 500m | 800m | −0.10 |
| `desnivel` | 300m | 500m | −0.05 |

### Clamp final

```python
return max(0.05, min(1.0, base))
```

---

## 7. `calcular_score_trilha()`

Produz um score numérico 0–100 que representa o impacto da chuva no solo.

### Fórmula completa

```python
thresh = threshold_solo_descansado(mes, enso, trail)
fator  = fator_absorcao(trail)
solo_descansado = acumulo_ef < thresh

if pico_3h >= pico_thr:   # pico_thr = 10.0
    impacto = pico_3h * (coef_pico_desc if solo_descansado else coef_pico_mol)
    # coef_pico_desc = 0.7  |  coef_pico_mol = 1.0
else:
    if solo_descansado:
        impacto = rain_mm * coef_rain              # coef_rain = 0.6
    else:
        impacto = rain_mm + acumulo_ef * coef_acumulo  # coef_acumulo = 0.3

impacto *= fator   # fator de absorção do solo

if clay_pct is None:
    impacto *= solo_type_config[solo_type]["score_mult"]  # material do solo

if trail_type == "bikepark" and acumulo_ef < bk_acumulo_thr:   # bk_acumulo_thr = 5.0
    impacto *= trail_type_config[trail_type][exposicao]["score_mult"]  # 0.90

score = max(0.0, min(100.0, impacto * coef_base))  # coef_base = 10.0
```

---

## 8. `calcular_aderencia()` — status do rider

### Thresholds carregados de `aderencia_thresholds`

| status | ef_min | ef_max |
|---|---|---|
| SECO | — | 0.0 |
| GRIP PERFEITO | 0.0 | 3.0 |
| BOA ADERÊNCIA | 3.0 | 7.0 |
| BAIXA ADERÊNCIA | 7.0 | — |

### Ajuste microclimático dos thresholds

```python
efetivo_combinado  = acumulo_ef + pico_3h
fator_mc           = fator_microclima(trail)   # _lookup_bioma(trail)["fator_threshold"]
efetivo_threshold  = efetivo_combinado / fator_mc if fator_mc > 0 else efetivo_combinado

status = "BAIXA ADERÊNCIA"  # default seguro
for thr in _carregar_aderencia_thresholds():
    # loop em ordem crescente de ef_min
    if acima_de(efetivo_threshold, thr["ef_min"]) and abaixo_de(efetivo_threshold, thr["ef_max"]):
        status = thr["status"]
        break
```

**Limiares efetivos resultantes:**

| Trilha | fator_threshold | GRIP → BOA | BOA → BAIXA |
|---|---|---|---|
| Mata Atlântica + alt ≥ 600m + fechada | 0.50 | > 1.5 mm | > 3.5 mm |
| Mata Atlântica geral | 0.90 | > 2.7 mm | > 6.3 mm |
| Outros biomas / aberta | 1.00 | > 3.0 mm | > 7.0 mm |

### Fator de recuperação

```python
recovery_mult = float(_get_config("aderencia_recovery_mult") or 2.5)
if status == "BAIXA ADERÊNCIA" and acumulo_ef < thresh_local * recovery_mult and not saturado:
    status = "BOA ADERÊNCIA"
```

### Regras especiais bikepark

```python
if trail_type == "bikepark":
    if saturado:
        pass   # BAIXA ADERÊNCIA permitida
    else:
        if status == "BAIXA ADERÊNCIA":
            status = "BOA ADERÊNCIA"   # teto quando não saturado
    if acumulo_ef >= 2.0 and status == "SECO":
        status = "GRIP PERFEITO"       # nunca SECO com umidade real
```

---

## 9. Veredicto

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

# Inclinação (só com umidade real)
inclinacao > 30%  → risco += 2
inclinacao > 20%  → risco += 1

# Trail type
bikepark               → risco -= 1
bikepark saturado      → risco += 2 (adicional)
natural + incl > 20% + rain > 0 + BOA/BAIXA → risco += 1

# Vento histórico (ERA5 batch)
nivel 3 (>90 km/h)     → risco += 2
nivel 2 (65–90 km/h)   → risco += 1
nivel 2 + encharcado   → risco += 1 (adicional)
nivel 1 + encharcado   → risco += 1

# Rajada prevista
>= 30 km/h (aberta) ou >= 50 km/h (fechada) → risco = max(risco, 2)

# Aderência futura (próximas 24h por blocos de 6h)
piora severa (→ BAIXA) → risco += 2
piora moderada (→ BOA) → risco += 1
melhora prevista       → risco -= 1
```

### Classificação final

| Risco | Veredicto |
|---|---|
| 0 – 1 | DROP LIBERADO |
| 2 – 3 | DROP LIBERADO - Veja os alertas |
| >= 4 | MELHOR ESPERAR |

### Override pós-modelo: chuva prevista nas próximas 12h

Função `_aplicar_override_chuva_futura(resultado)` — executada após `processar_trilha()`, antes de `gravar_supabase()`. Isolada e removível sem afetar o modelo.

**Gatilho:** qualquer um dos dois primeiros blocos de 6h com `rain_mm > 3mm`.

**Regras:**

| Estado atual | Veredicto atual | Ação |
|---|---|---|
| BAIXA ADERÊNCIA | qualquer | nenhuma |
| SECO ou GRIP PERFEITO | qualquer | → BOA ADERÊNCIA + DROP LIBERADO - Veja os alertas |
| BOA ADERÊNCIA | DROP LIBERADO | → DROP LIBERADO - Veja os alertas |
| BOA ADERÊNCIA | DROP LIBERADO - Veja os alertas | nenhuma (já correto) |

### Ajuste pós-modelo: relatos de condição dos riders

Função `ajustar_por_observacoes(resultado, trail)` — executada após `_aplicar_override_chuva_futura()`. Consulta `observacoes_trilha` das últimas 24h.

**Mapeamento de risco:**

| condicao_encontrada | delta_risco |
|---|---|
| `seco` | −1 |
| `grip` | 0 |
| `boa` | 0 |
| `baixa` | +1 |
| `lama` | +2 |

Cap: `delta = min(delta_acumulado, 2)` — máximo +2 por execução.

---

## 10. ENSO (El Niño / La Niña)

### Fonte

NOAA CPC — arquivo `oni.ascii.txt`. Lido uma vez por execução, com cache em `_CACHE_ONI`.

### Classificação

```python
# classificar_enso(oni) retorna:
{
    "fase": "El Niño Forte",  # texto exibível
    "fase_raw": "el_nino_forte",  # chave para enso_regional_mult
    "mult": 0.75,             # multiplicador genérico (fallback)
    "emoji": "🔥",
    "oni": 1.8
}
```

**Fases:**
```
oni >= 1.5:           fase_raw="el_nino_forte"
0.5 <= oni < 1.5:     fase_raw="el_nino"
-0.5 < oni < 0.5:     fase_raw="neutro"
-1.5 < oni <= -0.5:   fase_raw="la_nina"
oni <= -1.5:          fase_raw="la_nina_forte"
```

**Validação do arquivo NOAA (3 camadas):**
1. Header != 4 colunas → aviso + fallback neutro
2. partes[2] (SST absoluta) fora de 20–32°C → aviso (indica mudança de formato)
3. partes[3] (ANOM) fora de -4..+4 → aviso + fallback neutro

### Aplicação no threshold

```python
enso_mult = _enso_mult_regional(enso, trail["regiao"])
thresh = base_sazonal * enso_mult * fator_microclima(trail)
```

Onde `base_sazonal` vem de `_threshold_tabela(regiao, mes)` com cascata UF → macro-região → DEFAULT.

---

## 11. Coeficientes de dossel e microclima (tabela `biomas`)

### Função `_lookup_bioma(trail, mes)`

1. Filtra por bioma + exposicao
2. Prioriza linha com `altitude_min` preenchido quando `trail.altitude_m >= altitude_min`
3. Se mês atual está no intervalo sazonal, sobrescreve coeficientes pelos valores sazonais
4. Fallback: `{chuva_pct: 1.0, vento_pct: 1.0, sol_pct: 1.0, fator_threshold: 1.0}` (neutro)

### Efeitos no modelo

| Coeficiente | Onde aplicado | Efeito |
|---|---|---|
| `chuva_pct` | `fetch_historico_chuva_om()` + lag OWM | Fração da chuva que chega ao solo |
| `fator_threshold` | `threshold_solo_descansado()` + `calcular_aderencia()` | Threshold de solo descansado menor; thresholds de aderência mais rígidos |
| `vento_pct` | `_ajustar_meia_vida_clima()` | Reduz o vento efetivo sob o dossel |
| `sol_pct` | `_ajustar_meia_vida_clima()` | Aumenta nebulosidade efetiva (dossel fecha a luz) |

### `fator_microclima(trail)`

```python
def fator_microclima(trail: dict) -> float:
    return _lookup_bioma(trail).get("fator_threshold", 1.0)
```

Usado em:
- `threshold_solo_descansado()`: `thresh = base × enso_mult × fator_microclima`
- `calcular_aderencia()`: `efetivo_threshold = efetivo_combinado / fator_microclima`

---

## 12. Thresholds sazonais

### Fonte

Carregado do Supabase (`threshold_sazonal`). Sem fallback hardcoded — se Supabase falhar: `[ERRO CRÍTICO]`.

### Estrutura do cache

```python
tabela[regiao][mes] = (threshold_descansado, threshold_saturado)
# regiao pode ser: "SP", "MG", "RJ", "SC", "RS", "PR",
#                  "SUDESTE", "SUL", "NORTE", "NORDESTE", "CENTRO-OESTE",
#                  "DEFAULT"
```

### Uso no modelo

**`threshold_descansado`** → `threshold_solo_descansado()`:
```python
(base, _sat) = _threshold_tabela(regiao, mes)
thresh = base * _enso_mult_regional(enso, regiao) * fator_microclima(trail)
```

**`threshold_saturado`** → `threshold_bikepark_saturado()`:
```python
(_desc, sat) = _threshold_tabela(regiao, mes)
limite = sat * _enso_mult_regional(enso, regiao) * fator_microclima(trail)
saturado = (trail_type == "bikepark" and acumulo_ef > limite)
```

---

## 13. Campos de auditoria gravados em `condicoes` (jun/2026)

Quatro novas colunas adicionadas para facilitar diagnóstico e calibração do modelo:

| Campo | Tipo | Quando gravado | Uso |
|---|---|---|---|
| `cloud_pct` | NUMERIC(5,1) | Sempre (pipeline completo) | Cobertura de nuvens média histórica — diagnóstico do multiplicador de nebulosidade |
| `humidity_pct` | NUMERIC(5,1) | Sempre | Umidade relativa média histórica — diagnóstico do multiplicador de umidade e combo garoa |
| `temp_media_c` | NUMERIC(5,1) | Sempre | Temperatura média histórica — diagnóstico do multiplicador de temperatura |
| `meia_vida_base_h` | NUMERIC(5,1) | Sempre | Meia-vida base antes dos multiplicadores climáticos — diagnóstico do impacto dos multiplicadores |

**Exemplo de uso em diagnóstico:**
```
condicoes.meia_vida_h = 52h
condicoes.meia_vida_base_h = 36h (terra/fechada/DEFAULT)
Razão: 52/36 = 1.44 → multiplicadores climáticos elevaram 44%
condicoes.humidity_pct = 92% → × 1.18 (umidade 85–95%)
condicoes.cloud_pct = 88% → × 1.06 (nebulosidade 70–90%)
condicoes.temp_media_c = 15°C → × 1.12 (temp ≤ 16°C)
combo garoa: humidity=92% ≥ 85% E cloud=88% ≥ 70% → × 1.10
1.18 × 1.06 × 1.12 × 1.10 = 1.545 (×trail_type_config natural/fechada=1.30 → total=2.01 → clamped para 72h)
```

---

## 14. Campos exibidos no card do rider

### UMIDADE RETIDA (`acumulo_ef`)

Umidade ainda presente no solo agora. Recalculada no front-end com drift desde o `gerado_em`:
```javascript
const horasSince = (Date.now() - geradoEm) / 3600000
const efAgora = acumulo_ef * Math.pow(0.5, horasSince / meia_vida_h)
```

### TRILHA SECA EM (derivado)

```javascript
const horasAteGrip = meia_vida_h * Math.log2(efAgora / GRIP_THRESHOLD)
// GRIP_THRESHOLD = 3.0mm (primeiro limiar da aderencia_thresholds)
```

### PICO PREV. 3H (`pico_3h`)

```python
max(sum(precip[i:i+3]) for i in range(len(precip)-2))
```

Janela de 48h (intencional — captura picos extremos futuros).

### JANELA DE PEDAL (`janela`)

Maior bloco contínuo de horas nas próximas 48h com:
- `pop < 30%`
- `precipitação < 1mm/h`
- `wind_speed < 15 m/s`

---

## 15. Invariantes do modelo — não regredir

1. **NUNCA reintroduzir OWM timemachine como fonte de precipitação** — retorna 1 hora por chamada, enviasa para o mesmo horário do dia
2. **NUNCA comparar acumulados de fontes sem normalizar `chuva_pct` em ambas** — infla histórico em mata fechada
3. **NUNCA usar só o campo `rain` do OM** — perde eventos convectivos (showers). Sempre usar `precipitation`
4. **NUNCA somar `rain + precipitation` do OM** — dupla contagem
5. **NUNCA criar zero-rain shortcircuit** — forecast zero não prova ausência de chuva passada; com batch OM a economia é irrelevante
6. **Modelo regional:** `_enso_mult_regional()` substitui `enso["mult"]` genérico — cada UF tem sua lógica climática
7. **NORTE/NORDESTE têm lógica ENSO inversa** — El Niño = seca nessas regiões → multiplicador > 1.0
8. **Combo garoa:** verificar existência da linha `umidade_nebulosidade_combo` antes de aplicar (seguro se ausente)
9. **Auditoria:** `meia_vida_base_h`, `cloud_pct`, `humidity_pct`, `temp_media_c` devem ser gravados em toda execução de pipeline completo
