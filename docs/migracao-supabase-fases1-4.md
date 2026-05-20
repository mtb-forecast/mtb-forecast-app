# Migração de Dados Hardcoded para Supabase — Fases 1 a 4

**Branch:** `develop`  
**Data:** 20/05/2026  
**Objetivo:** Extrair todos os dados de configuração embutidos no código Python para tabelas Supabase, tornando `mtb-forecast.py` um motor puro de cálculo — sem constantes de negócio hardcoded.

---

## Visão Geral das Fases

| Fase | Commits | Tabelas criadas | Linhas removidas do Python |
|------|---------|-----------------|---------------------------|
| 1 | `3163b36` | `enso_config`, `aderencia_thresholds`, `veredicto_risco_pesos` | ~60 |
| 2 | `a8d6db6` · `4d3707d` | `meia_vida_clima_mult`, `microclima_config` | ~80 |
| 3 | `edcfbf7` · `60ca591` | `solo_type_config`, `inclinacao_config`, `score_config` | ~50 |
| 4 | `3d788d8` · `d47ee0e` | `aderencia_descricoes` | ~80 |
| **Total** | **8 commits** | **9 tabelas novas + 5 INSERTs em tabelas existentes** | **~270** |

---

## Padrão Arquitetural Adotado

Cada tabela segue o mesmo padrão de consumo no Python:

```
_CACHE_TABELA: list | dict = [] | {}     ← global, inicialmente vazio
_carregar_tabela() → list | dict         ← carrega 1x, popula cache, fallback seguro
warmup em main()                         ← todos os loaders chamados na inicialização
função_consumidora() usa _carregar_*()   ← zero hardcoded inline
```

**Regras de cache:** listas e dicts não-vazios são truthy → cache hit na segunda chamada.  
**Fallback:** `ativo = true` filtra todas as queries; tabelas críticas retornam `[]`/`{}` + log `[ERRO CRÍTICO]`.  
**RLS:** todas as tabelas têm `ENABLE ROW LEVEL SECURITY` + policy `FOR SELECT USING (true)`.

---

## Fase 1 — ENSO, Aderência e Veredicto

**Migration:** `supabase/migrations/fase1_enso_aderencia_veredicto.sql`  
**Commits:** `3163b36` (Python) · SQL executado manualmente

### Tabela: `enso_config`

Substitui `classificar_enso()` hardcoded. Lookup por faixa ONI retorna multiplicador sobre o threshold sazonal.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `fase` | text | Identificador: `el_nino_forte`, `el_nino`, `neutro`, `la_nina`, `la_nina_forte` |
| `oni_min` | numeric | Limite inferior ONI (null = sem limite) |
| `oni_max` | numeric | Limite superior ONI (null = sem limite) |
| `multiplicador` | numeric | Fator aplicado sobre threshold sazonal |
| `emoji` | text | Emoji de exibição no frontend |
| `ativo` | boolean | Soft-delete |

**Dados populados (5 linhas):**

| fase | oni_min | oni_max | multiplicador | emoji |
|------|---------|---------|---------------|-------|
| el_nino_forte | 1.5 | — | **0.75** | 🔥 |
| el_nino | 0.5 | 1.5 | **0.85** | ☀️ |
| neutro | -0.5 | 0.5 | **1.00** | 🌤️ |
| la_nina | -1.5 | -0.5 | **1.15** | 🌧️ |
| la_nina_forte | — | -1.5 | **1.25** | ⛈️ |

> **Detalhe de implementação:** Fases El Niño usam `oni_min <= oni < oni_max`; La Niña usam `oni_min < oni <= oni_max` — assimetria preserva o comportamento original do código.

**Função Python:** `classificar_enso(oni)` → `_carregar_enso_config()`  
**Cache:** `_CACHE_ENSO_CONFIG: list = []`

---

### Tabela: `aderencia_thresholds`

Substitui os `if/elif` hardcoded em `calcular_aderencia()`. Define a faixa de `efetivo_combinado` (acumulo_ef + pico_3h) para cada status de aderência.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `status` | text | SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA |
| `ef_min` | numeric | Limite inferior (null = sem mínimo) |
| `ef_max` | numeric | Limite superior (null = sem máximo) |
| `ordem` | integer | Ordem de avaliação ascendente (1 → 4) |

**Dados populados (4 linhas):**

| ordem | status | ef_min | ef_max |
|-------|--------|--------|--------|
| 1 | SECO | — | **0.0** (inclusive) |
| 2 | GRIP PERFEITO | 0.0 | **5.0** (exclusivo) |
| 3 | BOA ADERÊNCIA | 5.0 | **7.0** (exclusivo) |
| 4 | BAIXA ADERÊNCIA | 7.0 | — |

> **Detalhe:** SECO usa `<=` (inclusivo) no upper para capturar `ef == 0.0`; demais usam `<` (exclusivo).

**Função Python:** `calcular_aderencia()` → `_carregar_aderencia_thresholds()`  
**Cache:** `_CACHE_ADERENCIA_THRESHOLDS: list = []`

---

### Tabela: `veredicto_risco_pesos`

Substitui todos os `risco += N` e os limiares de decisão final em `veredicto()`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `fator` | text | Identificador do fator de risco |
| `condicao` | text | Documentação (não executada em SQL) |
| `peso` | integer | Pontos adicionados ao risco (null para limiares) |
| `limiar_max` | integer | Limiar de decisão final (null para pesos) |
| `texto_veredicto` | text | Texto exibido (null para pesos) |

**Pesos de risco (12 linhas):**

| fator | condição | peso |
|-------|----------|------|
| aderencia_baixa | BAIXA ADERÊNCIA | +3 |
| aderencia_boa | BOA ADERÊNCIA | +2 |
| aderencia_grip | GRIP PERFEITO | +1 |
| pico_3h_muito_alto | pico_3h ≥ 15 mm | +2 |
| pico_3h_alto | pico_3h ≥ 10 mm | +1 |
| rain_alto | rain_mm ≥ 8 mm | +1 |
| vento_alto | wind_ms ≥ 12 m/s | +1 |
| inclinacao_alta | inclinação > 30% | +2 |
| inclinacao_media | inclinação > 20% | +1 |
| vento_estrutural_alto | gust_max > 90 km/h | +2 |
| vento_estrutural_med | gust_max > 65 km/h | +1 |
| solo_encharcado | solo molhado + BAIXA ADERÊNCIA | +1 |

**Limiares de decisão (3 linhas):**

| fator | limiar_max | texto_veredicto |
|-------|-----------|-----------------|
| limiar_liberado | **1** | DROP LIBERADO |
| limiar_alertas | **3** | DROP LIBERADO - Veja os alertas |
| limiar_esperar | > 3 | MELHOR ESPERAR |

**Função Python:** `veredicto()` → `_carregar_veredicto_pesos()`  
**Cache:** `_CACHE_VEREDICTO_PESOS: list = []`

---

## Fase 2 — Meia-Vida Climática e Microclima

**Migration:** `supabase/migrations/fase2_meia_vida_clima_microclima.sql`  
**Commits:** `a8d6db6` (SQL) · `4d3707d` (Python)

### Tabela: `meia_vida_clima_mult`

Substitui todos os `if/elif` de `_ajustar_meia_vida_clima()`. Cada linha define um multiplicador sobre a meia-vida base de secagem de acordo com variáveis climáticas.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `variavel` | text | `temperatura` / `vento` / `nebulosidade` / `umidade` / `combo` / `bikepark` |
| `condicao` | text | Documentação da faixa (não executada) |
| `valor_min` | numeric | Limite inferior (null = sem mínimo) |
| `valor_max` | numeric | Limite superior (null = sem máximo) |
| `exposicao` | text | null = qualquer; `aberta`/`fechada` para bikepark |
| `multiplicador` | numeric | Fator multiplicado sobre meia_vida atual |

**Dados populados (18 linhas ativas + 1 inativa):**

**Temperatura (°C):**
| condição | mult |
|----------|------|
| temp ≥ 35 | × **0.65** — calor extremo seca muito rápido |
| 30 ≤ temp < 35 | × **0.75** |
| 26 ≤ temp < 30 | × **0.86** |
| temp ≤ 16 | × **1.12** — frio retém umidade |
| ~~temp ≤ 10~~ | ~~× 1.22~~ — `ativo=false` (dead code no if/elif original) |

**Vento (km/h, convertido de m/s):**
| condição | mult |
|----------|------|
| wind_kmh ≥ 40 | × **0.75** |
| 20 ≤ wind_kmh < 40 | × **0.85** |
| 10.8 ≤ wind_kmh < 20 (~3 m/s) | × **0.92** |
| wind_ms ≤ 1 (≤ 3.6 km/h) | × **1.05** |

**Combo calor + vento** (redução adicional, multi-variável):
| condição | mult |
|----------|------|
| temp ≥ 30 AND wind_kmh ≥ 20 | × **0.80** adicional |

**Nebulosidade (%):**
| condição | mult |
|----------|------|
| cloud ≥ 90% | × **1.12** |
| 70% ≤ cloud < 90% | × **1.06** |
| cloud ≤ 25% | × **0.94** |

**Umidade (%):**
| condição | mult |
|----------|------|
| humidity ≥ 95% | × **1.15** |
| 85% ≤ humidity < 95% | × **1.08** |
| humidity ≤ 45% | × **0.93** |

**Bikepark** (terra compactada + drenagem projetada):
| exposição | mult |
|-----------|------|
| fechada | × **0.60** |
| aberta | × **0.35** |

**Função Python:** `_ajustar_meia_vida_clima()` → `_carregar_meia_vida_clima_mult()`  
**Helper interno:** `_aplicar(valor, variavel, exposicao)` com `nonlocal meia_vida` — aplica primeiro match.  
**Cache:** `_CACHE_MEIA_VIDA_CLIMA_MULT: list = []`

---

### Tabela: `microclima_config`

Substitui lógica hardcoded de `fator_microclima()` e `_meia_vida()`. Dois multiplicadores por bioma/altitude/exposição: um para threshold de aderência, outro para retenção de umidade.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `bioma` | text | Ex: `Mata Atlântica` |
| `altitude_min` | integer | Altitude mínima em metros (null = sem requisito) |
| `exposicao` | text | `fechada` / `aberta` / null = qualquer |
| `mult_threshold` | numeric | Retornado por `fator_microclima()` |
| `mult_meia_vida` | numeric | Multiplicado sobre `base` em `_meia_vida()` |

**Dados populados (2 linhas — avaliados em ordem de especificidade):**

| bioma | altitude_min | exposição | mult_threshold | mult_meia_vida |
|-------|-------------|-----------|----------------|----------------|
| Mata Atlântica | ≥ 600 m | fechada | **0.75** | **1.20** — orografia + dossel = secagem muito lenta |
| Mata Atlântica | — | — | **0.90** | **1.10** — retenção geral da mata |

**Funções Python:**
- `fator_microclima(trail)` → retorna `mult_threshold` do primeiro match
- `_meia_vida(trail)` → multiplica `base` por `mult_meia_vida` do primeiro match

**Cache:** `_CACHE_MICROCLIMA_CONFIG: list = []`

---

### `configuracoes_sistema` — INSERTs da Fase 2

| chave | valor | uso |
|-------|-------|-----|
| `meia_vida_min` | `4` | `max(mv_min, ...)` em `_ajustar_meia_vida_clima()` |
| `meia_vida_max` | `72` | `min(mv_max, ...)` em `_ajustar_meia_vida_clima()` |

---

## Fase 3 — Solo, Score e Inclinação

**Migration:** `supabase/migrations/fase3_solo_score_inclinacao.sql`  
**Commits:** `edcfbf7` (SQL) · `60ca591` (Python)

### Tabela: `solo_type_config`

Substitui dois dicts hardcoded: o dict de `fator_absorcao_base` em `fator_absorcao()` e o dict `solo_mult` em `calcular_score_trilha()`. Ambos só são usados quando `clay_pct` não está disponível (FIX #7).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `solo_type` | text | `terra` / `preto` / `misto` / `misto_mg` / `pedra` / `ferro` |
| `fator_absorcao_base` | numeric | Base de absorção de umidade |
| `score_mult` | numeric | Multiplicador de impacto no score |
| `altitude_bonus_min` | integer | Altitude de corte para bônus (metros) |
| `altitude_bonus` | numeric | Valor somado à base acima da altitude de corte |

**Dados populados (6 linhas):**

| solo_type | fator_absorcao_base | score_mult | altitude_bonus_min | altitude_bonus |
|-----------|--------------------|-----------|--------------------|----------------|
| terra | **0.80** | **1.05** | 1200 m | +0.05 |
| preto | **0.60** | **0.95** | 1200 m | +0.05 |
| misto | **0.55** | **1.00** | 1200 m | +0.05 |
| misto_mg | **0.45** | **0.92** | 1200 m | +0.05 |
| pedra | **0.25** | **0.80** | 1200 m | +0.05 |
| ferro | **0.30** | **0.85** | 1200 m | +0.05 |

> O bônus de altitude (`+0.05` acima de 1200 m) se aplica a todos os tipos — solos mais elevados tendem a ser mais argilosos e reter mais umidade.

**Funções Python:**
- `fator_absorcao(trail)` → `solo_cfg["fator_absorcao_base"]` (quando sem clay_pct)
- `fator_absorcao(trail)` → `solo_cfg["altitude_bonus"]` (quando altitude_m > altitude_bonus_min)
- `calcular_score_trilha()` → `solo_cfg["score_mult"]` (quando sem clay_pct)

**Cache:** `_CACHE_SOLO_TYPE_CONFIG: list = []`

---

### Tabela: `inclinacao_config`

Substitui os `if/elif` de penalizadores em `fator_absorcao()`. Dois tipos: `inclinacao` (graus percentuais calculados) e `desnivel` (metros brutos, fallback quando `extensao_km` ausente).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `tipo` | text | `inclinacao` (graus %) ou `desnivel` (metros) |
| `grau_min` | numeric | Limite inferior da faixa |
| `grau_max` | numeric | Limite superior (null = sem máximo) |
| `delta_fator` | numeric | Valor subtraído da base (sempre negativo) |

**Dados populados (6 linhas):**

**tipo = `inclinacao`** (graus = desnivel_m / extensao_km×1000 × 100):

| grau_min | grau_max | delta_fator |
|----------|----------|-------------|
| 30% | — | **−0.22** — inclinação severa |
| 20% | 30% | **−0.15** |
| 10% | 20% | **−0.08** |

**tipo = `desnivel`** (metros brutos — fallback):

| grau_min | grau_max | delta_fator |
|----------|----------|-------------|
| 800 m | — | **−0.18** |
| 500 m | 800 m | **−0.10** |
| 300 m | 500 m | **−0.05** |

**Função Python:** `fator_absorcao(trail)` → `_carregar_inclinacao_config()`  
**Cache:** `_CACHE_INCLINACAO_CONFIG: list = []`

---

### Tabela: `score_config`

Substitui todos os coeficientes hardcoded de `calcular_score_trilha()`. Chave-valor com `UNIQUE(chave)`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `chave` | text UNIQUE | Identificador do coeficiente |
| `valor` | numeric | Valor numérico |

**Dados populados (9 linhas):**

| chave | valor | fórmula onde é usado |
|-------|-------|----------------------|
| `coef_rain` | **0.6** | `impacto = rain_mm × 0.6` (solo descansado, pico < 10) |
| `coef_pico_descansado` | **0.7** | `impacto = pico_3h × 0.7` (pico ≥ 10, solo descansado) |
| `coef_pico_molhado` | **1.0** | `impacto = pico_3h × 1.0` (pico ≥ 10, solo molhado) |
| `coef_acumulo` | **0.3** | `impacto = rain + acumulo_ef × 0.3` (solo molhado, pico < 10) |
| `coef_base` | **10.0** | `score = impacto × 10.0` — escala para 0–100 |
| `pico_threshold` | **10.0** | Limiar de ativação da lógica de pico (mm) |
| `bikepark_acumulo_threshold` | **5.0** | Se `acumulo_ef < 5.0`: aplica redução bikepark |
| `bikepark_score_mult` | **0.90** | Redução de impacto para bikepark não saturado |
| `bikepark_saturado_threshold` | **10.0** | Fallback quando `threshold_sazonal` indisponível |

**Função Python:** `calcular_score_trilha()` → `_carregar_score_config()`  
**Cache:** `_CACHE_SCORE_CONFIG: dict = {}`

---

## Fase 4 — Descrições de Aderência e Limpeza de Fallbacks

**Migration:** `supabase/migrations/fase4_limpeza_fallbacks.sql`  
**Commits:** `3d788d8` (SQL) · `d47ee0e` (Python)

### Tabela: `aderencia_descricoes`

Substitui o dict de 24 textos hardcoded em `_descricao_aderencia()`. Constraint `UNIQUE(status, solo_type)` garante idempotência.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `status` | text | SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA / BIKEPARK_SATURADO |
| `solo_type` | text | `terra` / `preto` / `misto` / `misto_mg` / `pedra` / `ferro` / `default` |
| `texto` | text | Descrição exibida ao usuário |

**Dados populados (25 linhas):**

| status | solo_types cobertos | total |
|--------|--------------------|----|
| SECO | terra, misto, misto_mg, preto, pedra, ferro | 6 |
| GRIP PERFEITO | terra, misto, misto_mg, preto, pedra, ferro | 6 |
| BOA ADERÊNCIA | terra, misto, misto_mg, preto, pedra, ferro | 6 |
| BAIXA ADERÊNCIA | terra, misto, misto_mg, preto, pedra, ferro | 6 |
| BIKEPARK_SATURADO | default (qualquer) | 1 |
| **Total** | | **25** |

> `BIKEPARK_SATURADO` é avaliado antes do lookup por `(status, solo_type)` — tem prioridade quando `trail_type == bikepark AND saturado == True`.

**Lógica de fallback na função:**
```python
texto = descricoes.get((status, solo_type))   # 1º: match exato
     or descricoes.get((status, "default"))   # 2º: default do status
     or f"Solo em condição de {status.lower()}."  # 3º: string genérica
```

**Função Python:** `_descricao_aderencia()` → `_carregar_aderencia_descricoes()`  
**Cache:** `_CACHE_ADERENCIA_DESCRICOES: dict = {}`

---

### `configuracoes_sistema` — INSERT da Fase 4

| chave | valor | uso |
|-------|-------|-----|
| `aderencia_recovery_mult` | `2.5` | `calcular_aderencia()`: se `acumulo_ef < thresh × 2.5` → rebaixa BAIXA ADERÊNCIA para BOA ADERÊNCIA |

---

## Constantes Removidas do Python

| Constante | Tipo | Linhas | Substituída por |
|-----------|------|--------|----------------|
| `_THRESHOLD_SAZONAL_REGIONAL` | dict SP/MG | ~30 | `threshold_sazonal` (Supabase, pré-existente) |
| `_THRESHOLD_FALLBACK` | string | 1 | fallback `""` |
| `_MEIA_VIDA_SECAGEM` | dict 12 entradas | ~14 | `meia_vida_secagem` (Supabase, pré-existente) |
| `_MEIA_VIDA_DEFAULT` | int `24` | 1 | literal `24` em `_meia_vida()` |
| `_TABELA_SOLO_FALLBACK` | list 11 entradas | ~13 | `tabela_solo` (Supabase, pré-existente) |
| `_BIOMAS_MICROCLIMA` | set | 1 | Dead code após Fase 2 |
| Dict 24 textos aderência (inline) | dict | ~28 | `aderencia_descricoes` |
| Dict `solo_mult` em score | dict 6 entradas | ~8 | `solo_type_config.score_mult` |
| Dict base absorcao em fator | dict 6 entradas | ~1 | `solo_type_config.fator_absorcao_base` |
| Dicts coef inline em score | ~7 literais | ~8 | `score_config` |
| If/elif clima em meia_vida | 16 condições | ~30 | `meia_vida_clima_mult` |
| If/elif inclinação em absorcao | 6 condições | ~10 | `inclinacao_config` |
| If/elif aderência em calcular | 4 condições | ~10 | `aderencia_thresholds` |
| If/elif veredicto | 15 condições | ~20 | `veredicto_risco_pesos` |
| If/elif ENSO | 5 condições | ~12 | `enso_config` |

---

## Inventário Completo das Tabelas Supabase Criadas

| # | Tabela | Fase | Linhas | Função(ões) consumidora(s) | Loader Python | Cache |
|---|--------|------|--------|---------------------------|---------------|-------|
| 1 | `enso_config` | 1 | 5 | `classificar_enso()` | `_carregar_enso_config()` | `_CACHE_ENSO_CONFIG` |
| 2 | `aderencia_thresholds` | 1 | 4 | `calcular_aderencia()` | `_carregar_aderencia_thresholds()` | `_CACHE_ADERENCIA_THRESHOLDS` |
| 3 | `veredicto_risco_pesos` | 1 | 15 | `veredicto()` | `_carregar_veredicto_pesos()` | `_CACHE_VEREDICTO_PESOS` |
| 4 | `meia_vida_clima_mult` | 2 | 18 | `_ajustar_meia_vida_clima()` | `_carregar_meia_vida_clima_mult()` | `_CACHE_MEIA_VIDA_CLIMA_MULT` |
| 5 | `microclima_config` | 2 | 2 | `fator_microclima()`, `_meia_vida()` | `_carregar_microclima_config()` | `_CACHE_MICROCLIMA_CONFIG` |
| 6 | `solo_type_config` | 3 | 6 | `fator_absorcao()`, `calcular_score_trilha()` | `_carregar_solo_type_config()` | `_CACHE_SOLO_TYPE_CONFIG` |
| 7 | `inclinacao_config` | 3 | 6 | `fator_absorcao()` | `_carregar_inclinacao_config()` | `_CACHE_INCLINACAO_CONFIG` |
| 8 | `score_config` | 3 | 9 | `calcular_score_trilha()` | `_carregar_score_config()` | `_CACHE_SCORE_CONFIG` |
| 9 | `aderencia_descricoes` | 4 | 25 | `_descricao_aderencia()` | `_carregar_aderencia_descricoes()` | `_CACHE_ADERENCIA_DESCRICOES` |

**Tabelas preexistentes com INSERTs adicionados:**

| Tabela | Fase | Chaves adicionadas |
|--------|------|--------------------|
| `configuracoes_sistema` | 2 | `meia_vida_min`, `meia_vida_max` |
| `configuracoes_sistema` | 2 | *(mesma migration)* |
| `configuracoes_sistema` | 4 | `aderencia_recovery_mult` |

---

## Estado Final do `mtb-forecast.py`

### Caches globais declarados (todos os loaders)

```python
_CACHE_SOLO:                  dict = {}   # pré-existente
_CACHE_TABELA_SOLO:           list = []   # pré-existente
_CACHE_THRESHOLD:             dict = {}   # pré-existente
_CACHE_MEIA_VIDA:             dict = {}   # pré-existente
_CACHE_CONFIG:                dict = {}   # pré-existente
_CACHE_ENSO_CONFIG:           list = []   # Fase 1
_CACHE_ADERENCIA_THRESHOLDS:  list = []   # Fase 1
_CACHE_VEREDICTO_PESOS:       list = []   # Fase 1
_CACHE_MEIA_VIDA_CLIMA_MULT:  list = []   # Fase 2
_CACHE_MICROCLIMA_CONFIG:     list = []   # Fase 2
_CACHE_SOLO_TYPE_CONFIG:      list = []   # Fase 3
_CACHE_INCLINACAO_CONFIG:     list = []   # Fase 3
_CACHE_SCORE_CONFIG:          dict = {}   # Fase 3
_CACHE_ADERENCIA_DESCRICOES:  dict = {}   # Fase 4
```

### Warmup em `main()` (ordem de execução)

```python
_carregar_tabela_solo()           # pré-existente
_carregar_threshold_sazonal()     # pré-existente
_carregar_meia_vida()             # pré-existente
_carregar_enso_config()           # Fase 1
_carregar_aderencia_thresholds()  # Fase 1
_carregar_veredicto_pesos()       # Fase 1
_carregar_meia_vida_clima_mult()  # Fase 2
_carregar_microclima_config()     # Fase 2
_carregar_solo_type_config()      # Fase 3
_carregar_inclinacao_config()     # Fase 3
_carregar_score_config()          # Fase 3
_carregar_aderencia_descricoes()  # Fase 4
```

### Constantes restantes (schema / validação — não são dados)

```python
_CAMPOS_OBRIGATORIOS = ("name", "lat", "lon", "solo_type", ...)  # validação de campos
_SOLO_VALIDOS        = {"terra", "misto", "preto", "pedra", ...}  # validação de enum
_EXPOSICAO_VALIDOS   = {"aberta", "fechada"}                      # validação de enum
_TRAIL_VALIDOS       = {"natural", "bikepark"}                    # validação de enum
```

> Estas constantes definem **o que é válido**, não **como calcular** — pertencem ao código, não ao banco.

---

## Diagrama de Fluxo da Migração

```
mtb-forecast.py (antes)                mtb-forecast.py (depois)
─────────────────────────              ──────────────────────────
classificar_enso()                     classificar_enso()
  └─ if oni >= 1.5: mult=0.75    →       └─ _carregar_enso_config()
  └─ elif oni >= 0.5: mult=0.85             └─ Supabase: enso_config

calcular_aderencia()                   calcular_aderencia()
  └─ if ef < 0: SECO              →       └─ _carregar_aderencia_thresholds()
  └─ elif ef < 5: GRIP PERFEITO            └─ Supabase: aderencia_thresholds

veredicto()                            veredicto()
  └─ risco += 3  (BAIXA)          →       └─ _carregar_veredicto_pesos()
  └─ if risco <= 1: LIBERADO               └─ Supabase: veredicto_risco_pesos

_ajustar_meia_vida_clima()             _ajustar_meia_vida_clima()
  └─ if temp >= 35: *= 0.65       →       └─ _carregar_meia_vida_clima_mult()
  └─ elif temp >= 30: *= 0.75             └─ Supabase: meia_vida_clima_mult

fator_microclima() / _meia_vida()      fator_microclima() / _meia_vida()
  └─ if bioma == "Mata Atlântica" →       └─ _carregar_microclima_config()
       and alt >= 600: 0.75              └─ Supabase: microclima_config

fator_absorcao()                       fator_absorcao()
  └─ {"terra": 0.80, ...}[solo]   →       └─ _carregar_solo_type_config()
  └─ if inclinacao >= 30: -=0.22          └─ _carregar_inclinacao_config()
                                          └─ Supabase: solo_type_config
                                                       inclinacao_config

calcular_score_trilha()                calcular_score_trilha()
  └─ pico_3h * 0.7                →       └─ _carregar_score_config()
  └─ rain_mm * 0.6                         └─ _carregar_solo_type_config()
  └─ {"pedra": 0.80, ...}[solo]            └─ Supabase: score_config
                                                        solo_type_config

_descricao_aderencia()                 _descricao_aderencia()
  └─ {("SECO","terra"): "..."}    →       └─ _carregar_aderencia_descricoes()
  └─ (24 textos inline)                   └─ Supabase: aderencia_descricoes
```

---

*Gerado em 20/05/2026 — branch `develop` — 8 commits de migração*
