# MTB Forecast — Inventário Completo de Tabelas Supabase

> Documento de referência gerado a partir de `mtb-forecast.py`, migrations SQL e código Next.js.
> Cobre todas as **34+ tabelas** do sistema, seus campos, valores válidos e onde cada uma é consumida.
> Atualizado em jun/2026 com: tabela `mantenedores`, tabela `enso_regional_mult`, coluna `regiao`
> em `meia_vida_secagem`, entradas macro-regionais em `threshold_sazonal`, colunas de auditoria
> em `condicoes`, multiplicadores de garoa atualizados em `meia_vida_clima_mult`.

---

## Visão Geral por Grupo

| Grupo | Tabelas | Propósito |
|---|---|---|
| [Configuração do Modelo](#grupo-1--configuração-do-modelo) | 16 | Dados de negócio que alimentam o algoritmo Python |
| [Trilhas e Condições](#grupo-2--trilhas-e-condições) | 5 | Cadastro de trilhas, resultados de previsão e mantenedores |
| [Strava](#grupo-3--strava) | 4 | Segmentos pessoais via integração Strava |
| [Usuários](#grupo-4--usuários) | 2 | Perfis e preferências de usuários |
| [Interações](#grupo-5--interações) | 2 | Avaliações de riders e aprovações administrativas |
| [Pump Tracks](#grupo-6--pump-tracks) | 4 | Locais pump track com previsão, fotos e avaliações |
| [Strava Condições](#grupo-7--strava-condições) | 1 | Condições calculadas para segmentos Strava |

---

## Grupo 1 — Configuração do Modelo

Todas as tabelas deste grupo têm:
- **RLS ativa** com policy de leitura pública (`FOR SELECT USING (true)`)
- Campo `ativo boolean DEFAULT true` — apenas registros `ativo=true` são lidos pelo agente
- Carregadas **uma vez no startup** e mantidas em cache Python até o processo encerrar

---

### `configuracoes_sistema`

Chave-valor central do sistema. Absorveu `score_config` na Fase 5, categorizada por `grupo`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `chave` | text UNIQUE | Nome da configuração |
| `valor` | text | Valor (sempre string; conversão feita no Python) |
| `grupo` | text | Categoria: `sistema`, `secagem`, `aderencia`, `solo`, `scoring` |
| `ativo` | boolean DEFAULT true | Controle de ativação |

**Registros presentes:**

| Chave | Valor | Grupo | Uso no sistema |
|---|---|---|---|
| `meia_vida_min` | `4` | `secagem` | Clamp mínimo da meia_vida final (horas) |
| `meia_vida_max` | `72` | `secagem` | Clamp máximo da meia_vida final (horas) |
| `aderencia_recovery_mult` | `2.5` | `aderencia` | Multiplicador do fator de recuperação de aderência |
| `altitude_bonus_min` | `1200` | `solo` | Altitude de corte para bônus de absorção (metros) |
| `altitude_bonus` | `0.05` | `solo` | Valor somado ao fator_absorcao_base acima do corte |
| `coef_rain` | `0.6` | `scoring` | `impacto = rain_mm × 0.6` (solo descansado, pico < 10) |
| `coef_pico_descansado` | `0.7` | `scoring` | `impacto = pico_3h × 0.7` (solo descansado, pico ≥ 10) |
| `coef_pico_molhado` | `1.0` | `scoring` | `impacto = pico_3h × 1.0` (solo saturado, pico ≥ 10) |
| `coef_acumulo` | `0.3` | `scoring` | `impacto = rain + acumulo_ef × 0.3` (solo saturado, pico < 10) |
| `coef_base` | `10.0` | `scoring` | `score = impacto × 10.0` — escala 0–100 |
| `pico_threshold` | `10.0` | `scoring` | Limiar de ativação da lógica de pico (mm) |
| `bikepark_acumulo_threshold` | `5.0` | `scoring` | Gatilho de saturação para o desconto de score do bikepark |
| `bikepark_saturado_threshold` | `10.0` | `scoring` | Fallback de saturação quando `threshold_sazonal` indisponível |
| `email_from` | endereço | `sistema` | Remetente dos alertas por e-mail |
| `email_password` | senha/app-pw | `sistema` | Credencial do remetente |
| `telegram_token` | token | `sistema` | Token do bot Telegram |
| `telegram_chat_ids` | ids csv | `sistema` | Chat IDs separados por vírgula (broadcast) |

**Usado em:**
- `mtb-forecast.py` → `_get_config(chave)` — busca lazy com fallback para `os.getenv()`
- `mtb-forecast.py` → `_carregar_score_config()` — filtra `grupo=eq.scoring`
- `mtb-forecast.py` → `fator_absorcao()` — lê `altitude_bonus_min` / `altitude_bonus`
- `mtb-forecast.py` → `_ajustar_meia_vida_clima()` — lê `meia_vida_min`/`meia_vida_max`
- `mtb-forecast.py` → `calcular_aderencia()` — lê `aderencia_recovery_mult`

---

### `tabela_solo`

Tabela mestra de composição do solo por tipo, bioma e região.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `solo_type` | text | `terra`, `preto`, `misto`, `misto_mg`, `pedra`, `ferro` |
| `bioma` | text | Ex: `Mata Atlântica`, `Cerrado` — `NULL` = wildcard |
| `regiao` | text | Sigla do estado: `SP`, `MG` — `NULL` = wildcard |
| `clay_pct` | numeric | % de argila (0–100) |
| `sand_pct` | numeric | % de areia (0–100) |
| `texture_class` | text | Ex: `Franco-argiloso`, `Argiloso` |

**Prioridade de lookup (3 níveis):**
1. Match exato: `solo_type + bioma + regiao`
2. Match: `solo_type + bioma + regiao=NULL`
3. Fallback: `solo_type + bioma=NULL + regiao=NULL`

**Usado em:**
- `mtb-forecast.py` → `_carregar_tabela_solo()` / `_lookup_solo()` → `buscar_solo_openlandmap()`
- `app/(app)/admin/tabelas/page.tsx` → painel admin de edição com dupla aprovação

---

### `threshold_sazonal`

Thresholds mensais de saturação por região. **Atualizado em jun/2026**: adicionadas entradas para macro-regiões além de UFs específicos.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `regiao` | text | Sigla do estado (`SP`, `MG`, `RJ`, `SC`, `RS`, `PR`) OU macro-região (`SUDESTE`, `SUL`, `NORTE`, `NORDESTE`, `CENTRO-OESTE`) OU `DEFAULT` |
| `mes` | integer | Mês (1–12) |
| `threshold_descansado` | numeric | mm de `acumulo_ef` acima do qual o solo está saturado |
| `threshold_saturado` | numeric | mm para considerar bikepark saturado |

**Cascata de lookup Python `_threshold_tabela(regiao, mes)`:**
1. Busca por UF exata (ex: `SP`)
2. Se não encontrado: busca pela macro-região (`_macro_regiao(uf)` → `SUDESTE`)
3. Se não encontrado: busca `DEFAULT`

**Entradas por macro-região (valores de referência — dados reais no Supabase):**

| regiao | jan | abr | jul | out |
|---|---|---|---|---|
| SUDESTE | 3.0mm / 7.0mm | 5.0mm / 10.0mm | 8.0mm / 15.0mm | 5.0mm / 10.0mm |
| SUL | 4.0mm / 9.0mm | 6.0mm / 12.0mm | 9.0mm / 17.0mm | 6.0mm / 12.0mm |
| NORTE | 1.5mm / 5.0mm | 1.5mm / 5.0mm | 3.0mm / 8.0mm | 2.0mm / 6.0mm |
| NORDESTE | 5.0mm / 11.0mm | 4.0mm / 10.0mm | 6.0mm / 13.0mm | 5.0mm / 11.0mm |
| CENTRO-OESTE | 2.5mm / 6.0mm | 4.5mm / 9.0mm | 8.0mm / 15.0mm | 4.0mm / 9.0mm |

**Formato:** `threshold_descansado / threshold_saturado`

**Usado em:**
- `mtb-forecast.py` → `_carregar_threshold_sazonal()` → `threshold_solo_descansado()`
- `mtb-forecast.py` → `threshold_bikepark_saturado()`
- `app/(app)/admin/tabelas/page.tsx` → painel admin de edição

---

### `meia_vida_secagem`

Taxa de secagem base por tipo de solo, exposição e região. **Atualizado em jun/2026**: adicionada coluna `regiao`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `solo_type` | text | `terra`, `preto`, `misto`, `misto_mg`, `pedra`, `ferro` |
| `exposicao` | text | `aberta` ou `fechada` |
| `regiao` | text | `DEFAULT` ou macro-região: `SUDESTE`, `SUL`, `NORTE`, `NORDESTE`, `CENTRO-OESTE` |
| `meia_vida_h` | numeric | Horas para perder 50% da umidade (base, antes de ajustes) |

**Cascata de lookup Python `_meia_vida(trail)`:**
1. Busca por `(solo_type, exposicao, macro_regiao_exata)`
2. Se não encontrado: busca por `(solo_type, exposicao, "DEFAULT")`
3. Se não encontrado: usa `24` com log `[ERRO CRÍTICO]`

**Valores regionais para `terra/fechada` (tipo mais comum):**

| regiao | meia_vida_h | Fator vs DEFAULT | Razão |
|---|---|---|---|
| DEFAULT / SUDESTE | 36h | × 1.00 | Referência calibrada para SP/MG/RJ/ES |
| SUL | 46h | × 1.28 | Inverno frio + alta umidade relativa |
| NORTE | 56h | × 1.55 | Umidade amazônica permanente — solo quase nunca seca |
| NORDESTE | 23h | × 0.64 | Clima seco e quente — secagem acelerada |
| CENTRO-OESTE | 31h | × 0.86 | Cerrado — seco na estiagem, úmido no verão |

**Valores DEFAULT (terra/misto) por exposição:**

| solo_type | aberta | fechada |
|---|---|---|
| `ferro` | 8h | 14h |
| `pedra` | 6h | 10h |
| `preto` | 14h | 24h |
| `misto_mg` | 12h | 18h |
| `misto` | 18h | 28h |
| `terra` | 24h | 36h |

**Usado em:**
- `mtb-forecast.py` → `_carregar_meia_vida()` → `_meia_vida(trail)`
- `mtb-forecast.py` → `calcular_acumulo_ef()` — `meia_vida_h` alimenta o peso exponencial
- `app/(app)/admin/tabelas/page.tsx` → painel admin de edição

---

### `enso_config`

Fases do ENSO (El Niño / La Niña) e multiplicadores genéricos (não-regionais). Usado como fallback quando `enso_regional_mult` não tem entrada para a região.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `fase` | text | `el_nino_forte`, `el_nino`, `neutro`, `la_nina`, `la_nina_forte` |
| `oni_min` | numeric | Limite inferior do ONI (null = sem limite) |
| `oni_max` | numeric | Limite superior do ONI (null = sem limite) |
| `multiplicador` | numeric | Fator aplicado sobre o threshold sazonal (genérico, não-regional) |
| `emoji` | text | Emoji exibido no resultado |
| `ativo` | boolean | Controle de ativação |
| `created_at` | timestamptz | Timestamp de criação |

**Valores atuais:**

| fase | oni_min | oni_max | mult | emoji |
|---|---|---|---|---|
| `el_nino_forte` | 1.5 | — | 0.75 | 🔥 |
| `el_nino` | 0.5 | 1.5 | 0.85 | ☀️ |
| `neutro` | -0.5 | 0.5 | 1.00 | 🌤️ |
| `la_nina` | -1.5 | -0.5 | 1.15 | 🌧️ |
| `la_nina_forte` | — | -1.5 | 1.25 | ⛈️ |

**Nota:** `classificar_enso()` agora retorna `fase_raw` (`"el_nino"`, `"la_nina"`, `"neutro"` etc.) além dos campos existentes — usado como chave de lookup em `enso_regional_mult`.

**Fallback:** `[{"fase": "neutro", "multiplicador": 1.00, ...}]`

**Usado em:**
- `mtb-forecast.py` → `_carregar_enso_config()` → `classificar_enso(oni)`
- `mtb-forecast.py` → `threshold_solo_descansado()` — fallback quando `enso_regional_mult` não tem entrada

---

### `enso_regional_mult`

**NOVA tabela (jun/2026).** Multiplicadores ENSO específicos por fase × macro-região. NORTE e NORDESTE têm lógica **inversa** (El Niño = seca = threshold sobe = rider mais conservador).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `fase_raw` | text | `el_nino_forte`, `el_nino`, `neutro`, `la_nina`, `la_nina_forte` |
| `macro_regiao` | text | `NORTE`, `NORDESTE`, `CENTRO-OESTE`, `SUDESTE`, `SUL` |
| `multiplicador` | numeric | Fator sobre o threshold sazonal. > 1.0 = mais conservador (seco); < 1.0 = mais permissivo (chuva) |
| `descricao` | text | Explicação da lógica climática regional |
| `ativo` | boolean DEFAULT true | Controle de ativação |

**Valores por macro-região:**

| macro_regiao | el_nino_forte | el_nino | neutro | la_nina | la_nina_forte |
|---|---|---|---|---|---|
| SUDESTE | 0.72 | 0.82 | 1.00 | 1.18 | 1.30 |
| SUL | 0.69 | 0.79 | 1.00 | 1.22 | 1.37 |
| NORTE | 1.25 | 1.18 | 1.00 | 0.82 | 0.75 |
| NORDESTE | 1.35 | 1.25 | 1.00 | 0.78 | 0.70 |
| CENTRO-OESTE | 0.90 | 0.94 | 1.00 | 1.06 | 1.12 |

**Lógica inversa NORTE/NORDESTE:**
- El Niño = padrão seco no Norte/Nordeste → threshold SOBE → modelo mais conservador (mult > 1.0)
- La Niña = padrão chuvoso no Norte/Nordeste → threshold DESCE → modelo mais permissivo (mult < 1.0)

**Função Python `_enso_mult_regional(enso, uf)`:**
```python
macro = _macro_regiao(uf)  # converte UF → macro-região
chave = (enso["fase_raw"], macro)
mult = _CACHE_ENSO_REGIONAL.get(chave, enso["mult"])  # fallback para enso_config
```

**Usado em:**
- `mtb-forecast.py` → `_enso_mult_regional()` → `threshold_solo_descansado()`
- `mtb-forecast.py` → `threshold_bikepark_saturado()`

---

### `aderencia_thresholds`

Faixas de `efetivo_combinado` que mapeiam para os status de aderência do rider.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `status` | text | `SECO`, `GRIP PERFEITO`, `BOA ADERÊNCIA`, `BAIXA ADERÊNCIA` |
| `ef_min` | numeric | Limite inferior (null = desde 0) |
| `ef_max` | numeric | Limite superior (null = sem teto) |
| `ativo` | boolean | Controle de ativação |

**Valores atuais** (`efetivo_threshold = efetivo_combinado / fator_microclima`):

| status | ef_min | ef_max |
|---|---|---|
| SECO | — | 0.0 |
| GRIP PERFEITO | 0.0 | 3.0 |
| BOA ADERÊNCIA | 3.0 | 7.0 |
| BAIXA ADERÊNCIA | 7.0 | — |

**Thresholds efetivos por bioma** (após divisão por `fator_threshold`):

| Bioma / config | fator_threshold | GRIP→BOA | BOA→BAIXA |
|---|---|---|---|
| Outros (padrão) | 1.00 | 3.0 mm | 7.0 mm |
| Mata Atlântica geral | 0.90 | 2.7 mm | 6.3 mm |
| Mata Atlântica alta fechada | 0.50 | 1.5 mm | 3.5 mm |

**Fallback:** lista hardcoded com os valores acima.

**Usado em:**
- `mtb-forecast.py` → `_carregar_aderencia_thresholds()` → `calcular_aderencia()`

---

### `veredicto_pesos`

Pesos de risco do sistema de pontuação que gera o veredicto final.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `fator` | text UNIQUE | Identificador do fator de risco |
| `peso` | integer | Pontos adicionados ao risco total |
| `ativo` | boolean | Controle de ativação |

**Registros atuais (12 linhas):**

| fator | condição de ativação | peso |
|---|---|---|
| `aderencia_baixa` | BAIXA ADERÊNCIA | +3 |
| `aderencia_boa` | BOA ADERÊNCIA | +2 |
| `aderencia_grip` | GRIP PERFEITO | +1 |
| `pico_3h_muito_alto` | pico_3h >= 15 | +2 |
| `pico_3h_alto` | pico_3h >= 10 | +1 |
| `rain_alto` | rain_mm >= 8 | +1 |
| `vento_alto` | wind_ms >= 12 | +1 |
| `inclinacao_alta` | inclinação > 30% | +2 |
| `inclinacao_media` | inclinação > 20% | +1 |
| `vento_estrutural_alto` | gust_max_kmh > 90 | +2 |
| `vento_estrutural_med` | gust_max_kmh > 65 | +1 |
| `solo_encharcado` | solo saturado + BAIXA ADERÊNCIA | +1 |

**Fallback:** lista hardcoded com os 12 registros acima.

**Usado em:**
- `mtb-forecast.py` → `_carregar_veredicto_pesos()` → `veredicto()`

---

### `veredicto_limiares`

Limiares de decisão que mapeiam o risco acumulado para o texto de veredicto.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `limiar_max` | integer | Risco máximo para este veredicto |
| `texto_veredicto` | text | Texto exibido ao rider |
| `ordem` | integer | Ordem de avaliação (menor limiar primeiro) |
| `ativo` | boolean | Controle de ativação |

**Registros atuais:**

| ordem | limiar_max | texto_veredicto |
|---|---|---|
| 1 | 1 | DROP LIBERADO |
| 2 | 3 | DROP LIBERADO - Veja os alertas |
| — | > 3 | MELHOR ESPERAR (implícito) |

**Fallback:** `[{"limiar_max": 1, ...}, {"limiar_max": 3, ...}]`

**Usado em:**
- `mtb-forecast.py` → `_carregar_veredicto_limiares()` → `veredicto()`

---

### `meia_vida_clima_mult`

Multiplicadores climáticos que ajustam a meia-vida de secagem. **Atualizado em jun/2026**: valores de umidade e nebulosidade aumentados para capturar dias de garoa; nova linha `umidade_nebulosidade_combo`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Ordem de avaliação |
| `variavel` | text | `temperatura`, `vento`, `nebulosidade`, `umidade`, `combo`, `umidade_nebulosidade_combo`, `bikepark` |
| `valor_min` | numeric | Limite inferior (null = sem limite) |
| `valor_max` | numeric | Limite superior (null = sem limite) |
| `exposicao` | text | `aberta` / `fechada` — só relevante para `variavel=bikepark` |
| `multiplicador` | numeric | Fator multiplicado sobre a meia_vida atual |
| `ativo` | boolean | Controle de ativação |

**Registros ativos por variável (16 linhas após jun/2026):**

| variavel | valor_min | valor_max | mult | Observação |
|---|---|---|---|---|
| `temperatura` | 35 | — | 0.65 | Seca muito rápido |
| `temperatura` | 30 | 35 | 0.75 | |
| `temperatura` | 26 | 30 | 0.86 | |
| `temperatura` | — | 16 | 1.12 | Frio — seca devagar |
| `vento` | 40 | — | 0.75 | Vento forte |
| `vento` | 20 | 40 | 0.85 | |
| `vento` | 10.8 | 20 | 0.92 | |
| `vento` | — | 3.6 | 1.05 | Calmo |
| `combo` | — | — | 0.80 | Calor + vento simultâneos |
| `nebulosidade` | 90 | — | **1.20** | Atualizado (era 1.12) |
| `nebulosidade` | 70 | 90 | 1.06 | |
| `nebulosidade` | — | 25 | 0.94 | Céu limpo |
| `umidade` | 95 | — | **1.25** | Atualizado (era 1.15) |
| `umidade` | 85 | 95 | **1.18** | Atualizado (era 1.08) |
| `umidade` | — | 45 | 0.93 | Ar seco |
| `umidade_nebulosidade_combo` | — | — | **1.10** | **NOVA linha** — combo garoa |

**Linha `umidade_nebulosidade_combo`** — aplicação especial:
```python
# Avaliada APÓS os multiplicadores individuais
if humidity_pct >= 85 and cloud_pct >= 70:
    combo_garoa = next((r["multiplicador"] for r in registros
                        if r["variavel"] == "umidade_nebulosidade_combo"), None)
    if combo_garoa is not None:
        meia_vida *= combo_garoa  # × 1.10 adicional
```

**Efeito máximo empilhado em dia de garoa fria:**
`base × 1.25 (umidade≥95%) × 1.20 (nuvem≥90%) × 1.10 (combo) ≈ × 1.65`

**Nota:** Vento em km/h (`wind_ms × 3.6`). As linhas `variavel=bikepark` estão desativadas (`ativo=false`) — ver `trail_type_config`.

**Fallback:** lista hardcoded com os 16 registros ativos.

**Usado em:**
- `mtb-forecast.py` → `_carregar_meia_vida_clima_mult()` → `_ajustar_meia_vida_clima()`

---

### `biomas`

Fonte única de verdade para coeficientes físicos de dossel por bioma e exposição.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `bioma` | text | `Mata Atlântica`, `Cerrado`, `Amazônia`, `Caatinga`, `Pantanal`, `Pampa` |
| `exposicao` | text | `aberta` ou `fechada` |
| `altitude_min` | int | NULL = qualquer altitude; preenchido quando há linha específica para altitude |
| `chuva_pct` | float | Fração da chuva que atravessa o dossel e chega ao solo (0–1). Deve ser aplicado a AMBAS as fontes de precipitação antes de qualquer comparação |
| `vento_pct` | float | Fração do vento medido na estação ao nível do solo (0–1) |
| `sol_pct` | float | Fração da radiação solar que chega ao solo (0–1) |
| `mes_sazonal_inicio` | int | Mês de início da sazonalidade |
| `mes_sazonal_fim` | int | Mês de fim da sazonalidade |
| `chuva_pct_sazonal` | float | Valor de `chuva_pct` durante a estação seca |
| `vento_pct_sazonal` | float | |
| `sol_pct_sazonal` | float | |
| `fator_threshold` | float DEFAULT 1.0 | Divisor do `efetivo_combinado` antes dos thresholds de aderência |
| `ativo` | boolean DEFAULT true | Controle de ativação |

**13 registros (6 abertas + 7 fechadas):**

| bioma | exposicao | altitude_min | chuva_pct | vento_pct | sol_pct | fator_threshold |
|---|---|---|---|---|---|---|
| Amazônia | aberta | — | 0.965 | 0.575 | 0.800 | 1.00 |
| Mata Atlântica | aberta | — | 0.965 | 0.600 | 0.775 | 0.90 |
| Cerrado | aberta | — | 0.990 | 0.850 | 0.925 | 1.00 |
| Caatinga | aberta | — | 0.995 | 0.900 | 0.975 | 1.00 |
| Pantanal | aberta | — | 0.990 | 0.800 | 0.900 | 1.00 |
| Pampa | aberta | — | 0.990 | 0.950 | 0.940 | 1.00 |
| Amazônia | fechada | — | 0.175 | 0.100 | 0.020 | 1.00 |
| Mata Atlântica | fechada | — | 0.225 | 0.125 | 0.035 | 0.90 |
| Mata Atlântica | fechada | 600m | 0.180 | 0.100 | 0.025 | 0.50 |
| Cerrado | fechada | — | 0.500 | 0.275 | 0.175 | 1.00 |
| Caatinga | fechada | — | 0.600 | 0.325 | 0.225 | 1.00 |
| Pantanal | fechada | — | 0.400 | 0.175 | 0.100 | 1.00 |
| Pampa | fechada | — | 0.450 | 0.225 | 0.140 | 1.00 |

**Regra crítica:** `chuva_pct` DEVE ser aplicado a AMBAS as fontes de precipitação (Open-Meteo e OWM) antes de qualquer comparação. Comparar chuva crua de uma fonte com chuva interceptada de outra infla o histórico em mata fechada.

**Usado em:**
- `mtb-forecast.py` → `_carregar_biomas()` / `_lookup_bioma()`
- `mtb-forecast.py` → `fetch_historico_chuva_om()` — aplica `chuva_pct`
- `mtb-forecast.py` → `_ajustar_meia_vida_clima()` — aplica `vento_pct` e `sol_pct`
- `app/(app)/admin/tabelas/page.tsx` → aba "Biomas"

---

### `microclima_config`

> **Esta tabela foi supersedida pela tabela `biomas`.** O Python não lê mais `microclima_config` — mantida no banco por conservadorismo. Não tem efeito no modelo.

---

### `trail_type_config`

Multiplicadores de meia-vida e de score por `trail_type` × `exposicao`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `trail_type` | text | `natural` ou `bikepark` |
| `exposicao` | text | `aberta`, `mista`, `fechada` — NULL = genérico para o trail_type |
| `meia_vida_mult` | float | Multiplicador sobre a meia_vida após ajustes climáticos |
| `score_mult` | float | Multiplicador sobre o impacto calculado no score |
| `descricao` | text | Explicação e exemplos numéricos |
| `ativo` | boolean DEFAULT true | Controle de ativação |

**Valores atuais (6 linhas):**

| trail_type | exposicao | meia_vida_mult | score_mult |
|---|---|---|---|
| `natural` | `aberta` | 1.08 | 1.00 |
| `natural` | `mista` | 1.15 | 1.00 |
| `natural` | `fechada` | 1.30 | 1.00 |
| `bikepark` | `aberta` | 0.35 | 0.90 |
| `bikepark` | `mista` | 0.48 | 0.90 |
| `bikepark` | `fechada` | 0.60 | 0.90 |

**Usado em:**
- `mtb-forecast.py` → `_carregar_trail_type_config()` / `_lookup_trail_type()`
- `app/(app)/admin/tabelas/page.tsx` → aba "Trail Type"

---

### `solo_type_config`

Parâmetros de absorção e multiplicadores de score por tipo de solo quando `clay_pct` não está disponível.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `solo_type` | text | `terra`, `preto`, `misto`, `misto_mg`, `pedra`, `ferro` |
| `fator_absorcao_base` | numeric | Base do fator de absorção quando `clay_pct` ausente |
| `score_mult` | numeric | Multiplicador de impacto no score (apenas sem `clay_pct`) |
| `ativo` | boolean | Controle de ativação |

**Valores atuais:**

| solo_type | fator_absorcao_base | score_mult |
|---|---|---|
| `terra` | 0.80 | 1.05 |
| `preto` | 0.60 | 0.95 |
| `misto` | 0.55 | 1.00 |
| `misto_mg` | 0.45 | 0.92 |
| `pedra` | 0.25 | 0.80 |
| `ferro` | 0.30 | 0.85 |

**Usado em:**
- `mtb-forecast.py` → `_carregar_solo_type_config()` → `fator_absorcao()`
- `mtb-forecast.py` → `calcular_score_trilha()` — `score_mult` quando `clay_pct is None`

---

### `inclinacao_config`

Penalizadores do fator de absorção conforme a inclinação da trilha.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Ordem de avaliação — menor id avaliado primeiro |
| `tipo` | text | `inclinacao` (graus %) ou `desnivel` (metros brutos, fallback) |
| `valor_min` | numeric | Limite inferior |
| `valor_max` | numeric | Limite superior (null = sem limite) |
| `delta_fator` | numeric | Valor subtraído da base (negativo = penalizador) |
| `ativo` | boolean | Controle de ativação |

**Valores atuais:**

| tipo | valor_min | valor_max | delta_fator |
|---|---|---|---|
| `inclinacao` | 30 | — | −0.22 |
| `inclinacao` | 20 | 30 | −0.15 |
| `inclinacao` | 10 | 20 | −0.08 |
| `desnivel` | 800 | — | −0.18 |
| `desnivel` | 500 | 800 | −0.10 |
| `desnivel` | 300 | 500 | −0.05 |

**Usado em:**
- `mtb-forecast.py` → `_carregar_inclinacao_config()` → `fator_absorcao()`

---

### `aderencia_descricoes`

Textos descritivos de condição de solo exibidos no card do rider.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `status` | text | `SECO`, `GRIP PERFEITO`, `BOA ADERÊNCIA`, `BAIXA ADERÊNCIA`, `BIKEPARK_SATURADO` |
| `solo_type` | text | `terra`, `preto`, `misto`, `misto_mg`, `pedra`, `ferro`, `default` |
| `texto` | text | Descrição exibida ao rider |
| `ativo` | boolean | Controle de ativação |
| — | UNIQUE | `(status, solo_type)` |

**25 registros:** 4 status × 6 solo_types + 1 entrada `BIKEPARK_SATURADO/default`.

**Usado em:**
- `mtb-forecast.py` → `_carregar_aderencia_descricoes()` → `_descricao_aderencia()`

---

## Grupo 2 — Trilhas e Condições

---

### `mantenedores`

**NOVA tabela (jun/2026).** Entidades que mantêm e operam trilhas (bike parks, associações).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `nome` | text | Nome completo da organização |
| `nome_primario` | text | Primeira parte do nome exibido (ex: "Reserva Natural") — cor_primaria |
| `nome_secundario` | text | Segunda parte do nome exibido (ex: "Park") — cor_secundaria |
| `cor_primaria` | text | Cor hex para `nome_primario` (ex: `#FFE000`) |
| `cor_secundaria` | text | Cor hex para `nome_secundario` (ex: `#FFFFFF`) |
| `logo_url` | text | URL pública da logo no bucket `logos` (Supabase Storage). Renderizar sempre com `<img>` nativo — NUNCA `next/image` |
| `site_url` | text | URL do site do mantenedor (exibida como link `↗` no contexto de página) |
| `ativo` | boolean DEFAULT true | Controle de visibilidade |
| `created_at` | timestamptz | Timestamp de criação |

**Regras:**
- `logo_url` pode ser NULL — exibe apenas o nome sem elemento gráfico
- `site_url` pode ser NULL — link `↗` não é exibido quando ausente
- Mantenedor sempre opcional em trilhas — `mantenedor_id = NULL` nunca quebra card

**Bucket Storage:** `logos` — público, aceita jpeg/png/webp. Upload via `POST /api/admin/upload-logo` (canvas comprime para WebP antes do envio).

**Usado em:**
- `mtb-forecast.py` → JOIN em `_carregar_trilhas_supabase()` — carrega para gravar `local_key`
- `app/(app)/trilhas/page.tsx` → `select('*, condicoes(*), localidades(*), mantenedores(*)')`
- `app/(app)/trilhas/[id]/page.tsx` → `LogoMantenedor` no header da trilha
- `app/(app)/mantenedores/[id]/page.tsx` → hero + grid de TrilhaCards
- `components/LogoMantenedor.tsx` → exibição com cores dinâmicas

---

### `trilhas`

Tabela principal de trilhas aprovadas e visíveis no app.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `name` | text | Nome da trilha |
| `lat` | numeric | Latitude |
| `lon` | numeric | Longitude |
| `solo_type` | text | `terra`, `preto`, `misto`, `misto_mg`, `pedra`, `ferro` |
| `exposicao` | text | `aberta` ou `fechada` |
| `altitude_m` | integer | Altitude em metros |
| `trail_type` | text | `natural` ou `bikepark` |
| `regiao` | text | Sigla do estado (legado — usado como fallback) |
| `desnivel_m` | numeric | Desnível total (opcional) |
| `extensao_km` | numeric | Extensão em km (opcional) |
| `bioma` | text | Ex: `Mata Atlântica`, `Cerrado` (opcional) |
| `aprovada` | boolean | `true` = visível no app |
| `polyline` | text | Encoded polyline para exibição no mapa |
| `localidade_id` | uuid FK | Referência para `localidades.id` |
| `mantenedor_id` | uuid FK | Referência para `mantenedores.id` (opcional) |
| `created_at` | timestamptz | Timestamp de criação |

**Usado em:**
- `mtb-forecast.py` → `_carregar_trilhas_supabase()` — carrega trilhas aprovadas
- `app/(app)/trilhas/page.tsx` — listagem com filtros
- `app/(app)/trilhas/[id]/page.tsx` — página de detalhe
- `app/(app)/mantenedores/[id]/page.tsx` — grid de trilhas do mantenedor

---

### `trilhas_pendentes`

Trilhas submetidas por usuários aguardando aprovação pelo admin.

Mesmos campos de `trilhas` + `status` (pendente/aprovada/rejeitada) + `motivo_rejeicao` + `user_id`.

**Usado em:**
- `app/(app)/trilhas/cadastrar/page.tsx` → `insert` ao cadastrar nova trilha
- `app/(app)/admin/page.tsx` → listagem, aprovação e rejeição
- `app/(app)/perfil/page.tsx` → trilhas pendentes do usuário logado

---

### `localidades`

Cache de geocodificação reversa (Nominatim / OpenStreetMap).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `pais` | text DEFAULT `Brasil` | País |
| `estado` | text | Sigla UF (ISO 3166-2) |
| `cidade` | text DEFAULT `''` | Nome da cidade |
| `localidade` | text | Bairro, vila, subdistrito (opcional) |
| `created_at` | timestamptz | Timestamp de criação |
| — | UNIQUE INDEX | `(estado, cidade, COALESCE(localidade, ''))` |

**Comportamento de fallback na aprovação:** se o geocoding Nominatim falhar, `admin/page.tsx` cria uma entrada mínima com `estado = trilha.regiao` e `cidade = ''`.

---

### `condicoes`

Resultado do processamento do agente Python por trilha. Uma linha por trilha (DELETE + INSERT a cada rodada). **Atualizado em jun/2026**: 4 novas colunas de auditoria.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `trilha_id` | uuid FK | Referência para `trilhas.id` |
| `gerado_em` | timestamptz | Quando o agente gerou este registro |
| `aderencia_status` | text | `SECO` / `GRIP PERFEITO` / `BOA ADERÊNCIA` / `BAIXA ADERÊNCIA` |
| `aderencia_score` | numeric | Score numérico 0–100 |
| `aderencia_desc` | text | Texto descritivo do status |
| `aderencia_futura_status` | text | Status do pior bloco futuro de 6h |
| `aderencia_futura_label` | text | Rótulo do bloco (ex: `12h→18h`) |
| `aderencia_futura_rain` | numeric | Chuva prevista no bloco futuro (mm) |
| `veredicto` | text | `DROP LIBERADO` / `DROP LIBERADO - Veja os alertas` / `MELHOR ESPERAR` |
| `veredicto_12h` | text | Veredicto para as próximas 12h |
| `texto_dinamico` | text | Frase contextual do veredicto |
| `motivo_veredicto` | text | Fatores de risco que levaram ao veredicto |
| `previsao_24h` | jsonb | Array de 4 blocos de 6h: `{label, rain_mm, pop_max, wind_max, temp_med}` |
| `rain_mm` | numeric | Chuva prevista 24h (mm) — fusão OWM 70% + OM 30% |
| `rain_12h` | numeric | Chuva prevista 12h (mm) |
| `pico_3h` | numeric | Maior acumulado em janela deslizante de 3h nas próximas 48h (mm) |
| `acumulo_48h` | numeric | Precipitação bruta das últimas 48h (mm) — Open-Meteo Archive |
| `acumulo_ef` | numeric | Acúmulo efetivo com decaimento exponencial (mm) |
| `wind_ms` | numeric | Vento sustentado máximo previsto 24h (m/s) |
| `wind_12h` | numeric | Vento sustentado máximo previsto 12h (m/s) |
| `gust_max_kmh` | numeric | Rajada máxima prevista 24h (km/h) |
| `temp_max` | numeric | Temperatura máxima prevista (°C) |
| `pop_48h` | numeric | Probabilidade máxima de chuva 24h (%) — nome legado |
| `pop_12h` | numeric | Probabilidade máxima de chuva 12h (%) |
| `janela` | text | Melhor janela para pedal calculada pelo agente |
| `horarios_chuva` | text | Blocos com chuva prevista (JSON) |
| `frase_secagem` | text | Frase descritiva do estado do solo (Claude AI) |
| `solo_descansado` | boolean | `true` se `acumulo_ef < threshold` |
| `thresh_desc` | numeric | Threshold de solo descansado calculado (mm) |
| `meia_vida_h` | numeric | Meia-vida de secagem ajustada (horas) |
| `clay_pct` | numeric | Teor de argila via tabela_solo (%) |
| `sand_pct` | numeric | Teor de areia (%) |
| `texture_class` | text | Classificação textural USDA (ex: Argiloso) |
| `inclinacao` | numeric | Inclinação média calculada: `desnivel / (extensao × 1000) × 100` (%) |
| `ultima_chuva_h` | numeric | Horas desde a última chuva significativa (≥ 0.5mm) |
| `enso_fase` | text | Fase ENSO atual |
| `enso_oni` | numeric | Anomalia ONI da NOAA |
| `fonte` | text | Fonte meteorológica: OpenWeather + Open-Meteo |
| `alerta_vento_nivel` | integer | Nível histórico de vento 1 (55–65) / 2 (65–90) / 3 (> 90 km/h) |
| `alerta_vento_kmh` | numeric | Vento sustentado máximo histórico ERA5 (km/h) |
| `alerta_rajada_kmh` | numeric | Rajada máxima futura prevista (km/h) |
| `fds_d1_veredicto` / `fds_d1_rain` / `fds_d1_wind` / `fds_d1_temp` | text/numeric | Previsão D+1 |
| `fds_d2_*` | text/numeric | Previsão D+2 |
| `fds_d3_*` | text/numeric | Previsão D+3 |
| `dados_json` | jsonb | `{bioma, trail_type, exposicao}` — metadados no momento do cálculo |
| **`cloud_pct`** | NUMERIC(5,1) | **NOVA (jun/2026)** — cobertura de nuvens média no período histórico (%) |
| **`humidity_pct`** | NUMERIC(5,1) | **NOVA (jun/2026)** — umidade relativa média no período histórico (%) |
| **`temp_media_c`** | NUMERIC(5,1) | **NOVA (jun/2026)** — temperatura média no período histórico (°C) |
| **`meia_vida_base_h`** | NUMERIC(5,1) | **NOVA (jun/2026)** — meia-vida base antes dos multiplicadores climáticos (auditoria) |

> **Remoção de referências obsoletas:**
> - `historico_atualizado_em` — coluna de rastreamento do zero-rain shortcircuit. O shortcircuit foi removido em jun/2026; a coluna pode permanecer no banco mas não é mais atualizada nem consultada pelo agente.
> - Não há mais referência a OWM timemachine nesta tabela — histórico de clima vem exclusivamente do batch OM.

**Usado em:**
- `mtb-forecast.py` → `gravar_supabase()` — DELETE + INSERT a cada execução
- `app/(app)/trilhas/[id]/page.tsx` → via join: `trilhas.select("*, condicoes(*)")`
- `app/(app)/dashboard/page.tsx` → condições das trilhas favoritas

---

## Grupo 3 — Strava

---

### `strava_segmentos_config`

Configuração de solo/exposição/tipo para cada segmento Strava.

| Coluna | Tipo | Descrição |
|---|---|---|
| `strava_segment_id` | bigint UNIQUE | ID do segmento na API Strava |
| `owner_user_id` | uuid FK | Usuário que cadastrou primeiro |
| `name` | text | Nome do segmento |
| `lat` / `lon` | numeric | Latitude e longitude do ponto inicial |
| `extensao_km` | numeric | Extensão em km |
| `desnivel_m` | numeric | Desnível total (opcional) |
| `altitude_m` | integer | Altitude máxima |
| `solo_type` | text | Tipo de solo |
| `exposicao` | text | `aberta` ou `fechada` |
| `trail_type` | text | `natural` ou `bikepark` |
| `bioma` | text | Bioma |
| `regiao` | text | Sigla do estado |
| `created_at` | timestamptz | Timestamp de criação |

---

### `trilhas_pessoais`

Segmentos Strava vinculados a um usuário específico.

Campos: `id`, `user_id`, `strava_segment_id`, `name`, `lat`, `lon`, `extensao_km`, `desnivel_m`, `altitude_m`, `solo_type`, `exposicao`, `trail_type`, `bioma`, `regiao`, `strava_url`, `polyline`, `strava_elevation_profile`, `created_at`.

---

### `strava_config_sugestoes`

Sugestões de alteração de configuração de segmento enviadas por riders.

Campos: `id`, `strava_segment_id`, `user_id`, `solo_type`, `exposicao`, `trail_type`, `bioma`, `status` (pendente/aprovada/rejeitada), `created_at`.

---

## Grupo 4 — Usuários

---

### `profiles`

Perfil estendido de cada usuário autenticado.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Mesmo UUID do `auth.users` |
| `email` | text | E-mail do usuário |
| `nome` / `apelido` | text | Dados do rider |
| `regiao` | text | Sigla UF preferida |
| `plano` | text | `gratuito`, `pro`, `elite` |
| `is_admin` | boolean | Acesso ao painel admin |
| `receber_email` | boolean | Opt-in de alertas por e-mail |
| `email_trilhas_favoritas` | boolean | Inclui trilhas favoritas no e-mail |
| `email_trilhas_strava` | boolean | Inclui trilhas Strava no e-mail |
| `telegram_ativo` | boolean | Opt-in de alertas Telegram |
| `telegram_chat_id` | text | Chat ID do usuário no Telegram |
| `avatar_url` | text | URL pública da foto de perfil no bucket `avatars` |
| `stripe_customer_id` | text | ID do cliente no Stripe |
| `stripe_subscription_id` | text | ID da assinatura no Stripe |
| `created_at` | timestamptz | Timestamp de criação |

---

### `favoritos`

Trilhas marcadas como favoritas por cada usuário.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto |
| `user_id` | uuid FK | Referência para `profiles.id` |
| `trilha_id` | uuid FK | Referência para `trilhas.id` |
| `created_at` | timestamptz | Auto |

**Regra de negócio:** plano `gratuito` limitado a 5 favoritos.

---

## Grupo 5 — Interações

---

### `observacoes_trilha`

Avaliações de riders sobre condições reais da trilha.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto |
| `trilha_id` | uuid FK | Referência para `trilhas.id` (null se Strava) |
| `strava_segment_id` | bigint | ID do segmento Strava (null se trilha pública) |
| `user_id` | uuid FK | Referência para `profiles.id` |
| `condicao_encontrada` | text | `seco`, `grip`, `boa`, `baixa`, `lama`. Obrigatório. Usado pelo agente Python em `ajustar_por_observacoes()` |
| `estrelas` | integer | Nota da experiência do ride (1–5). Apenas exibição |
| `texto` | text | Comentário livre (máx. 150 caracteres) |
| `veredicto_sistema` | text | Snapshot do veredicto no momento da publicação |
| `created_at` | timestamptz | Auto |

**Mapeamento de risco (`ajustar_por_observacoes`):**

| condicao_encontrada | delta_risco |
|---|---|
| `seco` | −1 |
| `grip` | 0 |
| `boa` | 0 |
| `baixa` | +1 |
| `lama` | +2 |

Cap: máximo +2 por execução do agente.

---

### `admin_aprovacoes`

Workflow de dupla aprovação para alterações nas tabelas de configuração do modelo.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto |
| `solicitante_id` | uuid FK | Admin que solicitou a alteração |
| `aprovador_id` | uuid FK | Outro admin que deve aprovar |
| `tabela` | text | Tabela alvo: `tabela_solo`, `threshold_sazonal`, `meia_vida_secagem`, `biomas`, `trail_type_config` |
| `operacao` | text | `update` ou `insert` |
| `dados_anteriores` | jsonb | Snapshot do registro antes da alteração |
| `dados_novos` | jsonb | Dados que serão aplicados se aprovado |
| `status` | text | `pendente`, `aprovada`, `rejeitada` |
| `motivo_rejeicao` | text | Motivo (opcional) |
| `motivo` | text | Justificativa do solicitante (mín. 20 chars) |
| `created_at` | timestamptz | Auto |

---

## Grupo 6 — Pump Tracks

---

### `trilhas_pumptrack`

Cadastro de pump tracks do Brasil.

| Coluna | Tipo | Valores / Notas |
|---|---|---|
| `id` | text PK | `BR-001` a `BR-015` (dados iniciais) · `PT-<timestamp>` (cadastros de riders) |
| `nome` | text NOT NULL | Nome do pump track |
| `cidade` | text | Cidade do município |
| `uf` | text | Sigla do estado |
| `endereco` | text | Endereço completo (opcional) |
| `latitude` / `longitude` | numeric(10,6) | Coordenadas decimais |
| `tipo_superficie` | text | Asfalto · Terra · Terra/Saibro · Concreto · etc. |
| `comprimento_estimado` | text | Ex: `200m` · `350m (03 pistas)` |
| `iluminacao` | text | Sim · Não |
| `estacionamento` | text | Sim · Não · Na Rua · Sim (Parque) · etc. |
| `fonte` | text | Velosolutions · Blue Pump Tracks · Governo SP · etc. |
| `google_maps_url` | text | Link direto ao Google Maps |
| `instagram` | text | Handle `@nome` · `N/I` |
| `status_validacao` | text | `Ativo - Homologado` · `Ativo - Base de Dados` · `Pendente - Revisão` |
| `created_at` | timestamptz | Auto |

---

### `condicoes_pumptrack`

Previsão do tempo por pump track, gerada pelo agente Python. Sem modelo de solo.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto |
| `pumptrack_id` | text FK | → `trilhas_pumptrack.id` CASCADE DELETE |
| `gerado_em` | timestamptz | Momento da última execução |
| `rain_mm` | numeric(6,1) | Chuva prevista próximas 24h (mm) |
| `pico_3h` | numeric(6,1) | Maior acumulado em janela de 3h nas próximas 48h (mm) |
| `wind_kmh` | numeric(6,1) | Vento máximo previsto 24h (km/h) |
| `temp_max` | numeric(5,1) | Temperatura máxima prevista 24h (°C) |
| `temp_min` | numeric(5,1) | Temperatura mínima prevista 24h (°C) |
| `pop_48h` | integer | Probabilidade máxima de chuva 48h (%) |

---

### `fotos_pumptrack`

Galeria de fotos enviadas por riders.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto |
| `pumptrack_id` | text FK | → `trilhas_pumptrack.id` CASCADE DELETE |
| `user_id` | uuid FK | → `profiles.id` CASCADE DELETE |
| `url` | text NOT NULL | URL pública no bucket `pumptrack-photos` |
| `created_at` | timestamptz | Auto |

---

### `observacoes_pumptrack`

Avaliações de riders com estrelas, texto e veredicto rápido.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto |
| `pumptrack_id` | text FK | → `trilhas_pumptrack.id` CASCADE DELETE |
| `user_id` | uuid FK | → `profiles.id` CASCADE DELETE |
| `estrelas` | integer | 1–5 (CHECK) |
| `texto` | text | Máx. 200 caracteres |
| `veredicto_rider` | text | `ROLOU TOP` · `ESTAVA MOLHADO` · `SECO E RÁPIDO` · `CHEIO DE PEDAL` · `BOM PRA FAMÍLIA` |
| `created_at` | timestamptz | Auto |

---

## Grupo 7 — Strava Condições

---

### `condicoes_strava`

Resultado do agente para segmentos Strava. Campos idênticos à tabela `condicoes`, com chave por `strava_segment_id`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `strava_segment_id` | bigint UNIQUE | Chave de negócio — um registro por segmento |
| *(demais campos)* | — | Idênticos a `condicoes` — incluindo as 4 novas colunas de auditoria (jun/2026) |

**Diferença de gravação:** `condicoes` faz DELETE+INSERT por `trilha_id`; `condicoes_strava` faz DELETE+INSERT por `strava_segment_id`.

---

## Resumo — Matriz de Uso por Arquivo

| Arquivo | Tabelas acessadas |
|---|---|
| `mtb-forecast.py` | `configuracoes_sistema`, `tabela_solo`, `threshold_sazonal`, `meia_vida_secagem`, `enso_config`, `enso_regional_mult`, `aderencia_thresholds`, `veredicto_pesos`, `veredicto_limiares`, `meia_vida_clima_mult`, `biomas`, `trail_type_config`, `solo_type_config`, `inclinacao_config`, `aderencia_descricoes`, `trilhas`, `localidades`, `mantenedores`, `condicoes`, `strava_segmentos_config`, `condicoes_strava`, `profiles`, `favoritos`, `trilhas_pessoais`, `trilhas_pumptrack`, `condicoes_pumptrack`, `observacoes_trilha` |
| `app/(app)/dashboard/page.tsx` | `profiles`, `favoritos`, `trilhas` + `condicoes`, `trilhas_pessoais`, `condicoes_strava`, `observacoes_trilha` |
| `app/(app)/trilhas/[id]/page.tsx` | `trilhas` + `condicoes`, `favoritos`, `profiles`, `trilhas_pessoais`, `condicoes_strava`, `mantenedores` |
| `app/(app)/trilhas/page.tsx` | `trilhas`, `favoritos`, `profiles`, `localidades`, `trilhas_pumptrack` + `condicoes_pumptrack`, `mantenedores` |
| `app/(app)/mantenedores/[id]/page.tsx` | `mantenedores`, `trilhas` + `condicoes` |
| `app/(app)/pump-track/[id]/page.tsx` | `trilhas_pumptrack`, `condicoes_pumptrack`, `fotos_pumptrack`, `observacoes_pumptrack`, `profiles` |
| `app/(app)/mapa/page.tsx` | `trilhas` + `condicoes`, `favoritos`, `trilhas_pumptrack` + `condicoes_pumptrack` |
| `app/(app)/trilhas/cadastrar/page.tsx` | `trilhas_pendentes`, `trilhas_pumptrack`, `localidades` |
| `app/(app)/admin/page.tsx` | `profiles`, `trilhas_pendentes`, `trilhas`, `strava_segmentos_config`, `strava_config_sugestoes`, `localidades`, `admin_aprovacoes` |
| `app/(app)/admin/tabelas/page.tsx` | `profiles`, `tabela_solo`, `threshold_sazonal`, `meia_vida_secagem`, `biomas`, `trail_type_config`, `admin_aprovacoes` |
| `app/(app)/perfil/page.tsx` | `profiles`, `trilhas_pendentes`, `favoritos`, `trilhas` |
| `app/(app)/perfil/strava/page.tsx` | `trilhas_pessoais`, `strava_segmentos_config` |
| `components/TrailObservations.tsx` | `observacoes_trilha`, `favoritos`, `profiles` |
| `components/LogoMantenedor.tsx` | `mantenedores` (via props da trilha) |
| `components/PumpTrackObservacoes.tsx` | `observacoes_pumptrack`, `fotos_pumptrack`, `profiles` |
| `components/Navbar.tsx` | `profiles` |
| `app/api/profile/avatar/route.ts` | `profiles` · Storage bucket `avatars` |
| `app/api/admin/upload-logo/route.ts` | `mantenedores` · Storage bucket `logos` |
| `app/api/pump-track/foto/route.ts` | `fotos_pumptrack` · Storage bucket `pumptrack-photos` |
| `app/api/telegram/webhook/route.ts` | `profiles` |
