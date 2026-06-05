# MTB Forecast — Inventário Completo de Tabelas Supabase

> Documento de referência gerado a partir de `mtb-forecast.py`, migrations SQL e código Next.js.
> Cobre todas as **31 tabelas** do sistema, seus campos, valores válidos e onde cada uma é consumida.
> Atualizado em 2026-06 com Grupo 6 (Pump Tracks) e coluna `historico_atualizado_em`.

---

## Visão Geral por Grupo

| Grupo | Tabelas | Propósito |
|---|---|---|
| [Configuração do Modelo](#grupo-1--configuração-do-modelo) | 15 | Dados de negócio que alimentam o algoritmo Python |
| [Trilhas e Condições](#grupo-2--trilhas-e-condições) | 4 | Cadastro de trilhas e resultados de previsão |
| [Strava](#grupo-3--strava) | 4 | Segmentos pessoais via integração Strava |
| [Usuários](#grupo-4--usuários) | 2 | Perfis e preferências de usuários |
| [Interações](#grupo-5--interações) | 2 | Avaliações de riders e aprovações administrativas |
| [Pump Tracks](#grupo-6--pump-tracks) | 4 | Locais pump track com previsão, fotos e avaliações |

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
| `bikepark_acumulo_threshold` | `5.0` | `scoring` | Gatilho de saturação para o desconto de score do bikepark. Se `acumulo_ef < 5.0mm`, a drenagem projetada ainda está funcionando e o `score_mult` de `trail_type_config` (0.90) é aplicado — reduzindo 10% do impacto calculado. Se `acumulo_ef >= 5.0mm`, o bikepark está saturado, a drenagem perdeu eficácia e o desconto não é aplicado (score cheio). Calibrável: valores menores = desconto só em bikeparks muito secos; valores maiores = desconto mais liberal. |
| ~~`bikepark_score_mult`~~ | ~~`0.90`~~ | `scoring` | **Obsoleto** — migrado para `trail_type_config.score_mult` (ainda no banco, não é mais lido) |
| `bikepark_saturado_threshold` | `10.0` | `scoring` | Limiar de saturação de emergência para bikepark — usado como fallback quando a tabela `threshold_sazonal` está indisponível no Supabase. Quando `acumulo_ef > 10.0mm`, o bikepark é considerado saturado: libera BAIXA ADERÊNCIA (normalmente bloqueada para bikeparks) e adiciona pontos extras de risco no veredicto. Em operação normal este valor nunca é atingido pois `threshold_sazonal` fornece o limiar real ajustado por mês e região. |
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

Tabela mestra de composição do solo por tipo, bioma e região. Base para `clay_pct` e `sand_pct`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `solo_type` | text | Tipo de solo: `terra`, `preto`, `misto`, `misto_mg`, `pedra`, `ferro` |
| `bioma` | text | Ex: `Mata Atlântica`, `Cerrado` — `NULL` = wildcard (qualquer bioma) |
| `regiao` | text | Sigla do estado: `SP`, `MG` — `NULL` = wildcard (qualquer região) |
| `clay_pct` | numeric | % de argila (0–100) |
| `sand_pct` | numeric | % de areia (0–100) |
| `texture_class` | text | Ex: `Franco-argiloso`, `Argiloso` |

**Prioridade de lookup (3 níveis):**
1. Match exato: `solo_type + bioma + regiao`
2. Match: `solo_type + bioma + regiao=NULL` (wildcard de região)
3. Fallback: `solo_type + bioma=NULL + regiao=NULL` (wildcard universal)

**Nota:** `bioma` e `regiao` são nullable (NOT NULL removido na Fase 5). Índice único usa `COALESCE(bioma,'')` e `COALESCE(regiao,'')` para tratar NULLs como wildcards únicos.

**Crítica:** Sem fallback hardcoded — se indisponível, `clay_pct` não será calculado (`[ERRO CRÍTICO]`).

**Usado em:**
- `mtb-forecast.py` → `_carregar_tabela_solo()` / `_lookup_solo()` → `buscar_solo_openlandmap()`
- `mtb-forecast.py` → `fator_absorcao()` — `clay_pct` define a base de absorção
- `mtb-forecast.py` → `gravar_supabase()` — grava `clay_pct`, `sand_pct`, `texture_class` em `condicoes`
- `app/(app)/admin/tabelas/page.tsx` → painel admin de edição com dupla aprovação

---

### `threshold_sazonal`

Thresholds mensais de saturação por região. Define quando o solo está "descansado" vs. "saturado".

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `regiao` | text | Sigla do estado: `SP`, `MG`, `RJ`, etc. |
| `mes` | integer | Mês (1–12) |
| `threshold_descansado` | numeric | mm de `acumulo_ef` acima do qual o solo está saturado |
| `threshold_saturado` | numeric | mm para considerar bikepark saturado |

**Crítica:** Sem fallback hardcoded — se indisponível, retorna `{}` e usa `(5.0, 10.0)` como última saída.

**Usado em:**
- `mtb-forecast.py` → `_carregar_threshold_sazonal()` → `threshold_solo_descansado()`
- `mtb-forecast.py` → `threshold_bikepark_saturado()` — limiar de saturação do bikepark
- `mtb-forecast.py` → `calcular_score_trilha()` — define `solo_descansado`
- `mtb-forecast.py` → `calcular_aderencia()` — fator de recuperação usa `thresh_local`
- `app/(app)/admin/tabelas/page.tsx` → painel admin de edição

---

### `meia_vida_secagem`

Taxa de secagem base por tipo de solo e exposição ao sol. Ponto de partida do pipeline de meia-vida.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `solo_type` | text | `terra`, `preto`, `misto`, `misto_mg`, `pedra`, `ferro` |
| `exposicao` | text | `aberta` ou `fechada` |
| `meia_vida_h` | numeric | Horas para perder 50% da umidade (base, antes de ajustes) |

**Valores atuais:**

| solo_type | aberta | fechada |
|---|---|---|
| `ferro` | 8h | 14h |
| `pedra` | 6h | 10h |
| `preto` | 14h | 24h |
| `misto_mg` | 12h | 18h |
| `misto` | 18h | 28h |
| `terra` | 24h | 36h |

**Crítica:** Sem fallback hardcoded — se indisponível retorna `{}`, `_meia_vida()` usa literal `24` (`[ERRO CRÍTICO]`).

**Usado em:**
- `mtb-forecast.py` → `_carregar_meia_vida()` → `_meia_vida(trail)` — busca `tabela[(solo_type, exposicao)]`
- `mtb-forecast.py` → `calcular_acumulo_ef()` — `meia_vida_h` alimenta o peso exponencial
- `app/(app)/admin/tabelas/page.tsx` → painel admin de edição

---

### `enso_config`

Fases do ENSO (El Niño / La Niña) e seus multiplicadores sobre o threshold sazonal.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `fase` | text | `el_nino_forte`, `el_nino`, `neutro`, `la_nina`, `la_nina_forte` |
| `oni_min` | numeric | Limite inferior do ONI (null = sem limite) |
| `oni_max` | numeric | Limite superior do ONI (null = sem limite) |
| `multiplicador` | numeric | Fator aplicado sobre o threshold sazonal |
| `emoji` | text | Emoji exibido no resultado |
| `ativo` | boolean | Controle de ativação |
| `created_at` | timestamptz | Timestamp de criação |

**Valores atuais (avaliados em ordem de id):**

| fase | oni_min | oni_max | mult | emoji |
|---|---|---|---|---|
| `el_nino_forte` | 1.5 | — | 0.75 | 🔥 |
| `el_nino` | 0.5 | 1.5 | 0.85 | ☀️ |
| `neutro` | -0.5 | 0.5 | 1.00 | 🌤️ |
| `la_nina` | -1.5 | -0.5 | 1.15 | 🌧️ |
| `la_nina_forte` | — | -1.5 | 1.25 | ⛈️ |

**Nota:** El Niño usa `lower-inclusive`, La Niña usa `upper-inclusive` — espelha o if/elif original.

**Fallback:** `[{"fase": "neutro", "multiplicador": 1.00, ...}]`

**Usado em:**
- `mtb-forecast.py` → `_carregar_enso_config()` → `classificar_enso(oni)`
- `mtb-forecast.py` → `threshold_solo_descansado()` → `thresh = base * enso["mult"] * fator_microclima()`
- `mtb-forecast.py` → `threshold_bikepark_saturado()`

---

### `aderencia_thresholds`

Faixas de `efetivo_combinado` que mapeiam para os status de aderência do rider.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `status` | text | `SECO`, `GRIP PERFEITO`, `BOA ADERÊNCIA`, `BAIXA ADERÊNCIA` |
| `ef_min` | numeric | Limite inferior do efetivo_threshold (null = desde 0) |
| `ef_max` | numeric | Limite superior (null = sem teto) |
| `ativo` | boolean | Controle de ativação |

**Nota:** o campo `ordem` foi removido na Fase 5 — redundante com os intervalos naturais de `ef_min`. A query ordena por `ef_min asc nulls first`.

**Valores atuais** (`efetivo_threshold = efetivo_combinado / fator_microclima`):**

| status | ef_min | ef_max | Semântica |
|---|---|---|---|
| SECO | — | 0.0 | `ef <= 0.0` (inclusivo — captura ef==0) |
| GRIP PERFEITO | 0.0 | **3.0** | `0 ≤ ef < 3.0` |
| BOA ADERÊNCIA | **3.0** | 7.0 | `3.0 ≤ ef < 7.0` |
| BAIXA ADERÊNCIA | 7.0 | — | `ef ≥ 7.0` |

**Thresholds efetivos por bioma** (após divisão por `fator_threshold`):

| Bioma / config | fator_threshold | GRIP→BOA em | BOA→BAIXA em |
|---|---|---|---|
| Outros (padrão) | 1.00 | 3.0 mm | 7.0 mm |
| Mata Atlântica geral | 0.90 | 2.7 mm | 6.3 mm |
| Mata Atlântica alta fechada | 0.50 | 1.5 mm | 3.5 mm |

**Fallback:** lista hardcoded com os valores atuais (3.0 / 3.0 / 7.0).

**Usado em:**
- `mtb-forecast.py` → `_carregar_aderencia_thresholds()` → `calcular_aderencia()` — loop sobre thresholds

---

### `veredicto_pesos`

Pesos de risco do sistema de pontuação que gera o veredicto final. Separada de `veredicto_limiares` na Fase 5.

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

**Nota:** a condição de ativação de cada fator é avaliada integralmente no Python — alterar `fator` no banco sem atualizar o código não tem efeito.

**Fallback:** lista hardcoded com os 12 registros acima.

**Usado em:**
- `mtb-forecast.py` → `_carregar_veredicto_pesos()` → `veredicto()`

---

### `veredicto_limiares`

Limiares de decisão que mapeiam o risco acumulado para o texto de veredicto. Separada de `veredicto_pesos` na Fase 5.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `limiar_max` | integer | Risco máximo para este veredicto |
| `texto_veredicto` | text | Texto exibido ao rider |
| `ordem` | integer | Ordem de avaliação (menor limiar primeiro) |
| `ativo` | boolean | Controle de ativação |

**Registros atuais (2 linhas — avaliados em ordem crescente de `limiar_max`):**

| ordem | limiar_max | texto_veredicto |
|---|---|---|
| 1 | 1 | DROP LIBERADO |
| 2 | 3 | DROP LIBERADO - Veja os alertas |
| — | > 3 | MELHOR ESPERAR (implícito, sem linha necessária) |

**Fallback:** `[{"limiar_max": 1, ...}, {"limiar_max": 3, ...}]`

**Usado em:**
- `mtb-forecast.py` → `_carregar_veredicto_limiares()` → `veredicto()`

---

### `meia_vida_clima_mult`

Multiplicadores climáticos que ajustam a meia-vida de secagem com base no clima histórico das últimas 48h.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento — define a ordem de avaliação |
| `variavel` | text | `temperatura`, `vento`, `nebulosidade`, `umidade`, `combo`, `bikepark` |
| `valor_min` | numeric | Limite inferior da variável (null = sem limite) |
| `valor_max` | numeric | Limite superior da variável (null = sem limite) |
| `exposicao` | text | `aberta` / `fechada` — só relevante para `variavel=bikepark` |
| `multiplicador` | numeric | Fator multiplicado sobre a meia_vida atual |
| `ativo` | boolean | Controle de ativação |

**Nota:** o campo `condicao` (documentação textual) foi removido na Fase 5 — nunca era lido pelo código. A linha `temp <= 10` (ativo=false) também foi deletada. As linhas `variavel=bikepark` foram desativadas (`ativo=false`) ao criar `trail_type_config` — os multiplicadores de bikepark agora vivem nessa nova tabela.

**Registros ativos por variável (15 linhas):**

| variavel | valor_min | valor_max | exposicao | mult |
|---|---|---|---|---|
| `temperatura` | 35 | — | — | 0.65 |
| `temperatura` | 30 | 35 | — | 0.75 |
| `temperatura` | 26 | 30 | — | 0.86 |
| `temperatura` | — | 16 | — | 1.12 |
| `vento` | 40 | — | — | 0.75 |
| `vento` | 20 | 40 | — | 0.85 |
| `vento` | 10.8 | 20 | — | 0.92 |
| `vento` | — | 3.6 | — | 1.05 |
| `combo` | — | — | — | 0.80 |
| `nebulosidade` | 90 | — | — | 1.12 |
| `nebulosidade` | 70 | 90 | — | 1.06 |
| `nebulosidade` | — | 25 | — | 0.94 |
| `umidade` | 95 | — | — | 1.15 |
| `umidade` | 85 | 95 | — | 1.08 |
| `umidade` | — | 45 | — | 0.93 |
| ~~`bikepark`~~ | — | — | `fechada` | ~~0.60~~ | desativado — ver `trail_type_config` |
| ~~`bikepark`~~ | — | — | `aberta` | ~~0.35~~ | desativado — ver `trail_type_config` |

**Nota:** Vento em km/h (`wind_ms × 3.6`). `combo` é condição multi-variável tratada separadamente.

**Fallback:** lista hardcoded com os 15 registros ativos.

**Usado em:**
- `mtb-forecast.py` → `_carregar_meia_vida_clima_mult()` → `_ajustar_meia_vida_clima()`

---

### `biomas`

Fonte única de verdade para coeficientes físicos de dossel por bioma e exposição. Substituiu `microclima_config` como fonte lida pelo Python.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `bioma` | text | Ex: `Mata Atlântica`, `Cerrado`, `Amazônia`, `Caatinga`, `Pantanal`, `Pampa` |
| `exposicao` | text | `aberta` ou `fechada` |
| `altitude_min` | int | NULL = qualquer altitude; preenchido quando há linha específica para altitude |
| `chuva_pct` | float | Fração da chuva da estação que atinge o solo (0–1) — interceptação de dossel |
| `vento_pct` | float | Fração do vento da estação que prevalece ao nível do solo (0–1) |
| `sol_pct` | float | Fração da radiação solar que chega ao solo (0–1) — modula nebulosidade efetiva |
| `mes_sazonal_inicio` | int | Mês de início da sazonalidade (1–12) — NULL se sem sazonalidade |
| `mes_sazonal_fim` | int | Mês de fim da sazonalidade |
| `chuva_pct_sazonal` | float | Valor de `chuva_pct` durante a estação seca |
| `vento_pct_sazonal` | float | Valor de `vento_pct` durante a estação seca |
| `sol_pct_sazonal` | float | Valor de `sol_pct` durante a estação seca |
| `fator_threshold` | float DEFAULT 1.0 | Divisor do `efetivo_combinado` antes dos thresholds de aderência — < 1.0 = mais rígido |
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

**Sazonalidade:** Cerrado fechado (abr–set): chuva=0.75, vento=0.55, sol=0.45. Caatinga fechada (jun–set): chuva=0.85, vento=0.65, sol=0.55.

**Lookup Python `_lookup_bioma(trail, mes)`:**
1. Filtra por bioma + exposicao
2. Prioriza linha com `altitude_min` preenchido quando `trail.altitude_m >= altitude_min`
3. Se mês atual está no intervalo sazonal, sobrescreve os três coeficientes pelos valores sazonais
4. Fallback: `{chuva_pct: 1.0, vento_pct: 1.0, sol_pct: 1.0, fator_threshold: 1.0}` (neutro)

**Fallback Python:** valores de Mata Atlântica fechada hardcoded se Supabase indisponível.

**Usado em:**
- `mtb-forecast.py` → `_carregar_biomas()` / `_lookup_bioma()` — lookup por trilha no pipeline
- `mtb-forecast.py` → `fetch_historico_chuva_om()` — aplica `chuva_pct` sobre precipitação bruta
- `mtb-forecast.py` → `_ajustar_meia_vida_clima()` — aplica `vento_pct` e `sol_pct`
- `mtb-forecast.py` → `fator_microclima()` — retorna `fator_threshold` para ajuste de thresholds
- `app/(app)/admin/tabelas/page.tsx` → aba "Biomas" com dupla aprovação

---

### `microclima_config`

Fatores de retenção de umidade por bioma, altitude e exposição. Afeta threshold e meia-vida.

> ⚠️ **Esta tabela foi supersedida pela tabela `biomas`.** O Python não lê mais `microclima_config` — todas as funções que usavam esta tabela (`fator_microclima()`, `_meia_vida()`) foram migradas para `_lookup_bioma()`. A tabela é **mantida no banco por conservadorismo** mas não tem efeito no modelo.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento — define a ordem de avaliação |
| `bioma` | text | Ex: `Mata Atlântica` |
| `altitude_min` | integer | Altitude mínima (null = sem requisito) |
| `exposicao` | text | `aberta` / `fechada` (null = qualquer) |
| `fator_threshold` | numeric | Divisor aplicado ao `efetivo_combinado` antes da comparação com thresholds — valores < 1.0 tornam os limites mais rígidos |
| `fator_secagem` | numeric | Multiplicador aplicado à `meia_vida` base — valores > 1.0 = seca mais devagar |
| `ativo` | boolean | Controle de ativação |

**Nota:** renomeado de `mult_threshold`/`mult_meia_vida` na Fase 5 para deixar explícito que `fator_threshold` é um divisor e `fator_secagem` é um multiplicador — sentidos opostos com nomes anteriores simétricos criavam confusão.

**Valores atuais:**

| bioma | altitude_min | exposicao | fator_threshold | fator_secagem |
|---|---|---|---|---|
| Mata Atlântica | 600m | fechada | **0.50** | 1.20 |
| Mata Atlântica | — | — | 0.90 | 1.10 |

**Semântica:** primeiro match vence (mais restritivo primeiro). Biomas não cadastrados → neutro (fator_threshold=1.0, sem divisão).

**Guia de calibração:**
- `fator_threshold` menor → thresholds efetivos mais apertados → GRIP PERFEITO em menos mm
- `fator_secagem` maior → meia-vida mais longa → solo demora mais para "descansar"

**Fallback:** lista hardcoded com as 2 linhas acima (fator_threshold=0.50/0.90, fator_secagem=1.20/1.10).

**Usado em:**
- `mtb-forecast.py` → `_carregar_microclima_config()` → `fator_microclima()` — retorna `fator_threshold`
- `mtb-forecast.py` → `_carregar_microclima_config()` → `_meia_vida()` — multiplica base por `fator_secagem`

---

### `trail_type_config`

Multiplicadores de meia-vida de secagem e de score de impacto por `trail_type` × `exposicao`. Centraliza valores que antes estavam espalhados em `meia_vida_clima_mult` (variavel=bikepark, agora desativadas) e `configuracoes_sistema` (natural_meia_vida_mult, removida).

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

| trail_type | exposicao | meia_vida_mult | score_mult | Interpretação |
|---|---|---|---|---|
| `natural` | `aberta` | 1.08 | 1.00 | Sem drenagem, mas sol/vento diretos — leve penalização |
| `natural` | `mista` | 1.15 | 1.00 | Cobertura parcial, retém mais umidade |
| `natural` | `fechada` | 1.30 | 1.00 | Mata densa sem drenagem — secagem muito lenta (ex: trilha Macaco) |
| `bikepark` | `aberta` | 0.35 | 0.90 | Terra compactada + sol/vento diretos — seca muito rápido |
| `bikepark` | `mista` | 0.48 | 0.90 | Drenagem projetada com alguma sombra |
| `bikepark` | `fechada` | 0.60 | 0.90 | Drenagem projetada + cobertura vegetal |

**Os dois `score_mult` — origens distintas, propósitos distintos:**

O campo `score_mult` existe em duas tabelas com significados diferentes:

| Tabela | Representa | Condição de aplicação |
|---|---|---|
| `solo_type_config.score_mult` | Quanto o **material do solo** amplifica o impacto da chuva (pedra drena melhor que terra) | Apenas quando `clay_pct` ausente na trilha |
| `trail_type_config.score_mult` | Desconto de **infraestrutura de drenagem** do bikepark (valetas projetadas reduzem impacto real) | Apenas bikepark + solo não saturado (`acumulo_ef < bk_acumulo_thr`) |

São mantidas em tabelas separadas porque representam conceitos independentes: um admin que quer calibrar "pedra drena melhor" não deve mexer na mesma tabela que controla "bikepark tem infraestrutura". Os dois podem se acumular para bikepark/terra sem `clay_pct`: `impacto × 1.05 (terra) × 0.90 (bikepark) = × 0.945`.

**Prioridade de lookup Python `_lookup_trail_type(trail)`:**
1. Match exato: `trail_type + exposicao`
2. Fallback: row com `exposicao = NULL` (genérico por trail_type)
3. Padrão neutro: `{meia_vida_mult: 1.0, score_mult: 1.0}`

**Fallback:** lista hardcoded com os 6 registros acima.

**Usado em:**
- `mtb-forecast.py` → `_carregar_trail_type_config()` / `_lookup_trail_type()` → `_ajustar_meia_vida_clima()` e `calcular_score_trilha()`
- `app/(app)/admin/tabelas/page.tsx` → aba "Trail Type" com dupla aprovação

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

**Nota:** `altitude_bonus_min` e `altitude_bonus` foram removidos na Fase 5 — idênticos em todos os 6 tipos, eram constantes globais repetidas. Agora vivem em `configuracoes_sistema` como `altitude_bonus_min=1200` e `altitude_bonus=0.05`.

**Valores atuais:**

| solo_type | fator_absorcao_base | score_mult |
|---|---|---|
| `terra` | 0.80 | 1.05 |
| `preto` | 0.60 | 0.95 |
| `misto` | 0.55 | 1.00 |
| `misto_mg` | 0.45 | 0.92 |
| `pedra` | 0.25 | 0.80 |
| `ferro` | 0.30 | 0.85 |

**Fallback:** lista hardcoded com os 6 registros acima.

**Usado em:**
- `mtb-forecast.py` → `_carregar_solo_type_config()` → `fator_absorcao()` — `fator_absorcao_base`
- `mtb-forecast.py` → `calcular_score_trilha()` — `score_mult` quando `clay_pct is None`

---

### `inclinacao_config`

Penalizadores do fator de absorção conforme a inclinação da trilha.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Ordem de avaliação — menor id avaliado primeiro |
| `tipo` | text | `inclinacao` (graus %) ou `desnivel` (metros brutos, fallback) |
| `valor_min` | numeric | Limite inferior — graus % quando `tipo=inclinacao`, metros quando `tipo=desnivel` |
| `valor_max` | numeric | Limite superior (null = sem limite) |
| `delta_fator` | numeric | Valor subtraído da base (negativo = penalizador) |
| `ativo` | boolean | Controle de ativação |

**Nota:** renomeado de `grau_min`/`grau_max` na Fase 5 — o nome anterior sugeria graus em ambos os tipos, mas para `desnivel` a unidade é metros. `valor_min`/`valor_max` é agnóstico à unidade.

**Valores atuais:**

| tipo | valor_min | valor_max | delta_fator | Condição |
|---|---|---|---|---|
| `inclinacao` | 30 | — | −0.22 | inclinacao% >= 30 |
| `inclinacao` | 20 | 30 | −0.15 | 20 <= inclinacao% < 30 |
| `inclinacao` | 10 | 20 | −0.08 | 10 <= inclinacao% < 20 |
| `desnivel` | 800 | — | −0.18 | desnivel_m >= 800 |
| `desnivel` | 500 | 800 | −0.10 | 500 <= desnivel_m < 800 |
| `desnivel` | 300 | 500 | −0.05 | 300 <= desnivel_m < 500 |

**Semântica:** `tipo=inclinacao` prioritário quando `extensao_km` disponível; `tipo=desnivel` é fallback.

**Fallback:** lista hardcoded com os 6 registros acima.

**Usado em:**
- `mtb-forecast.py` → `_carregar_inclinacao_config()` → `fator_absorcao()`

---

### ~~`score_config`~~ — absorvida pela Fase 5

> **Esta tabela foi eliminada.** Os 9 coeficientes de score foram migrados para `configuracoes_sistema` com `grupo='scoring'`. Ver seção `configuracoes_sistema` acima para os valores atuais.
>
> `_carregar_score_config()` agora consulta `configuracoes_sistema?grupo=eq.scoring`.

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
| — | UNIQUE | `(status, solo_type)` — garante idempotência |

**25 registros:** 4 status × 6 solo_types + 1 entrada `BIKEPARK_SATURADO/default`.

**Cadeia de lookup:**
```
1. (status, solo_type)         → match exato
2. (status, "default")         → fallback genérico
3. f"Solo em condição de ..."  → fallback literal
```

**Fallback:** `{}` — `_descricao_aderencia()` usa a cadeia acima + fallback string.

**Usado em:**
- `mtb-forecast.py` → `_carregar_aderencia_descricoes()` → `_descricao_aderencia()` → `calcular_aderencia()`
- `mtb-forecast.py` → `gravar_supabase()` — grava `aderencia_desc` em `condicoes`

---

## Grupo 2 — Trilhas e Condições

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
| `created_at` | timestamptz | Timestamp de criação |

**Usado em:**
- `mtb-forecast.py` → `_carregar_trilhas_supabase()` — carrega trilhas aprovadas para o agente processar
- `mtb-forecast.py` → `gravar_supabase()` — busca `trilha_id` pelo nome para gravar `condicoes`
- `app/(app)/trilhas/page.tsx` — listagem pública com filtros
- `app/(app)/trilhas/[id]/page.tsx` — página de detalhe com `condicoes(*)`
- `app/(app)/dashboard/page.tsx` — trilhas favoritas do usuário com `condicoes(*)`
- `app/(app)/admin/page.tsx` → `insert` na aprovação de `trilhas_pendentes`
- `app/(app)/dashboard/comparar/page.tsx` — comparação de trilhas

---

### `trilhas_pendentes`

Trilhas submetidas por usuários aguardando aprovação pelo admin.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `name` | text | Nome da trilha |
| `lat` | numeric | Latitude |
| `lon` | numeric | Longitude |
| `solo_type` | text | Tipo de solo |
| `exposicao` | text | `aberta` ou `fechada` |
| `altitude_m` | integer | Altitude em metros |
| `trail_type` | text | `natural` ou `bikepark` |
| `regiao` | text | Sigla do estado |
| `desnivel_m` | numeric | Desnível (opcional) |
| `extensao_km` | numeric | Extensão (opcional) |
| `bioma` | text | Bioma (opcional) |
| `polyline` | text | Encoded polyline |
| `localidade_id` | uuid FK | Referência para `localidades.id` |
| `status` | text | `pendente`, `aprovada`, `rejeitada` |
| `motivo_rejeicao` | text | Motivo da rejeição (opcional) |
| `user_id` | uuid FK | Usuário que submeteu |
| `created_at` | timestamptz | Timestamp de criação |

**Usado em:**
- `app/(app)/trilhas/cadastrar/page.tsx` → `insert` ao cadastrar nova trilha
- `app/(app)/admin/page.tsx` → listagem, aprovação (`status=aprovada`) e rejeição (`status=rejeitada`)
- `app/(app)/admin/importar-strava/page.tsx` → importação de segmentos Strava como trilha pendente
- `app/(app)/perfil/page.tsx` → trilhas pendentes do usuário logado

---

### `localidades`

Resultado do geocoding reverso — garante consistência de cidade/estado entre trilhas.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `pais` | text DEFAULT `Brasil` | País |
| `estado` | text | Sigla do estado (ex: `SP`) |
| `cidade` | text DEFAULT `''` | Nome da cidade |
| `localidade` | text | Sub-distrito / bairro (opcional) |
| `created_at` | timestamptz | Timestamp de criação |
| — | UNIQUE INDEX | `(estado, cidade, COALESCE(localidade, ''))` |

**RLS:** leitura pública + insert autenticado.

**Comportamento de fallback na aprovação:** se o geocoding Nominatim falhar, `admin/page.tsx` cria uma entrada mínima com `estado = trilha.regiao` e `cidade = ''` para garantir que `localidade_id` nunca fique nulo. Trilhas com essa entrada mínima aparecem no filtro por estado (via `t.localidades?.estado || t.regiao`) mas sem cidade/localidade.

**Usado em:**
- `mtb-forecast.py` → `geocodeLatLon()` → salva `localidade_id` ao aprovar trilha
- `app/(app)/trilhas/page.tsx` → filtro por estado com fallback `|| t.regiao`
- `app/(app)/trilhas/[id]/page.tsx` → exibe cidade/estado no card
- `app/(app)/dashboard/page.tsx` → cidade/estado das trilhas favoritas
- `app/(app)/admin/page.tsx` → lookup/criação de localidade na aprovação (com fallback mínimo se Nominatim falhar)
- `app/(app)/admin/importar-strava/page.tsx` → geocoding ao importar segmento
- `app/(app)/trilhas/cadastrar/page.tsx` → geocoding ao cadastrar
- `scripts/migrate-localidades.ts` → script de migração retroativa

---

### `condicoes`

Resultado do processamento do agente Python por trilha. Uma linha por trilha (DELETE + INSERT a cada rodada).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `trilha_id` | uuid FK | Referência para `trilhas.id` |
| `gerado_em` | timestamptz | Quando o agente gerou este registro |
| `aderencia_status` | text | `SECO` / `GRIP PERFEITO` / `BOA ADERÊNCIA` / `BAIXA ADERÊNCIA` |
| `aderencia_score` | numeric | Score numérico 0–100 |
| `aderencia_desc` | text | Texto descritivo do status |
| `veredicto` | text | `DROP LIBERADO` / `DROP LIBERADO - Veja os alertas` / `MELHOR ESPERAR` |
| `veredicto_12h` | text | Veredicto para janela de 12h |
| `rain_mm` | numeric | Precipitação prevista 24h (mm) |
| `rain_12h` | numeric | Precipitação prevista 12h (mm) |
| `wind_ms` | numeric | Vento sustentado previsto 24h (m/s) |
| `wind_12h` | numeric | Vento sustentado previsto 12h (m/s) |
| `pop_48h` | numeric | Prob. máxima de chuva 24h (%) — nome legado |
| `pop_12h` | numeric | Prob. máxima de chuva 12h (%) |
| `temp_max` | numeric | Temperatura máxima prevista (°C) |
| `pico_3h` | numeric | Maior acumulado em 3h consecutivas nas próximas 48h (mm) |
| `acumulo_48h` | numeric | Precipitação bruta das últimas 48h (mm) |
| `acumulo_ef` | numeric | Umidade efetiva retida no solo agora (mm) |
| `ultima_chuva_h` | numeric | Horas desde última chuva >= 0.5mm |
| `meia_vida_h` | numeric | Meia-vida de secagem calculada (horas) |
| `gust_max_kmh` | numeric | Rajada máxima prevista 24h (km/h) |
| `janela` | integer | Maior bloco limpo (horas) nas próximas 48h |
| `horarios_chuva` | text | Horários previstos de chuva |
| `frase_secagem` | text | Texto resumo de secagem |
| `solo_descansado` | boolean | Se o solo estava descansado no momento do cálculo |
| `thresh_desc` | numeric | Threshold de solo descansado usado |
| `clay_pct` | numeric | % de argila do solo |
| `sand_pct` | numeric | % de areia do solo |
| `texture_class` | text | Classe textural do solo |
| `inclinacao` | numeric | Inclinação calculada (% de graus) |
| `enso_fase` | text | Fase ENSO no momento do cálculo |
| `enso_oni` | numeric | Valor ONI no momento do cálculo |
| `fonte` | text | APIs usadas no cálculo |
| `alerta_vento_nivel` | integer | Nível de vento histórico (0–3) |
| `alerta_vento_kmh` | numeric | Vento sustentado histórico máx. 48h (km/h) |
| `alerta_rajada_kmh` | numeric | Rajada histórica máx. 48h (km/h) |
| `aderencia_futura_status` | text | Status de aderência previsto próximas 24h |
| `aderencia_futura_label` | text | Label do bloco de aderência futura |
| `aderencia_futura_rain` | numeric | Chuva prevista no bloco de aderência futura |
| `texto_dinamico` | text | Texto contextual dinâmico do veredicto |
| `motivo_veredicto` | text | Fatores que elevaram o risco (ex: "Pico 3h elevado, BOA ADERÊNCIA") — exibido como "Fatores de atenção" quando não há alertas específicos no CondicaoCard |
| `previsao_24h` | jsonb | Blocos de previsão hora a hora |
| `fds_d1_veredicto` | text | Veredicto para sábado próximo |
| `fds_d1_rain` | numeric | Chuva prevista no sábado |
| `fds_d1_wind` | numeric | Vento previsto no sábado |
| `fds_d1_temp` | numeric | Temp. máxima no sábado |
| `fds_d2_veredicto` | text | Veredicto para domingo |
| `fds_d2_rain` | numeric | Chuva prevista no domingo |
| `fds_d2_wind` | numeric | Vento previsto no domingo |
| `fds_d2_temp` | numeric | Temp. máxima no domingo |
| `fds_d3_veredicto` | text | Veredicto para segunda-feira |
| `fds_d3_rain` | numeric | Chuva prevista na segunda |
| `fds_d3_wind` | numeric | Vento previsto na segunda |
| `fds_d3_temp` | numeric | Temp. máxima na segunda |
| `dados_json` | jsonb | `{bioma, trail_type, exposicao}` — metadados da trilha no momento do cálculo |
| `historico_atualizado_em` | timestamptz | Timestamp do último **pipeline completo** (OWM timemachine + OM archive). Atualizado apenas quando `_usou_shortcircuit = False`. Shortcircuit preserva o valor anterior. NULL = trilha nunca processada por pipeline completo |

> **Gatilho 72h:** quando `historico_atualizado_em ≥ 72h` atrás E forecast = 0mm, o agente força pipeline completo para recalibrar `meia_vida` com as condições climáticas atuais. Ver seção "Otimização zero-chuva" em `docs/formulas-modelo.md`.

**Usado em:**
- `mtb-forecast.py` → `gravar_supabase()` — DELETE + INSERT a cada execução (07h e 13h BRT)
- `app/(app)/trilhas/[id]/page.tsx` → via join: `trilhas.select("*, condicoes(*)")`
- `app/(app)/dashboard/page.tsx` → condicoes das trilhas favoritas
- `app/(app)/dashboard/comparar/page.tsx` — comparação lado a lado

---

## Grupo 3 — Strava

---

### `strava_segmentos_config`

Configuração de solo/exposição/tipo para cada segmento Strava. Compartilhada entre riders do mesmo segmento.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial / uuid PK | Identificador |
| `strava_segment_id` | bigint UNIQUE | ID do segmento na API Strava |
| `owner_user_id` | uuid FK | Usuário que cadastrou primeiro |
| `name` | text | Nome do segmento |
| `lat` | numeric | Latitude do ponto inicial |
| `lon` | numeric | Longitude do ponto inicial |
| `extensao_km` | numeric | Extensão em km |
| `desnivel_m` | numeric | Desnível total (opcional) |
| `altitude_m` | integer | Altitude máxima |
| `solo_type` | text | Tipo de solo |
| `exposicao` | text | `aberta` ou `fechada` |
| `trail_type` | text | `natural` ou `bikepark` |
| `bioma` | text | Bioma |
| `regiao` | text | Sigla do estado |
| `created_at` | timestamptz | Timestamp de criação |

**Usado em:**
- `mtb-forecast.py` → `buscar_segmentos_strava_unicos()` — carrega lista para processar condições
- `app/(app)/perfil/strava/page.tsx` → insert ao vincular segmento (verifica duplicata)
- `app/(app)/admin/page.tsx` → update ao aprovar sugestão de configuração
- `lib/domain.ts` → lookup de configuração por `strava_segment_id`

---

### `trilhas_pessoais`

Trilhas Strava vinculadas a um usuário específico. Um rider pode ter vários segmentos vinculados.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `user_id` | uuid FK | Usuário dono |
| `strava_segment_id` | bigint | ID do segmento Strava |
| `name` | text | Nome exibido |
| `lat` | numeric | Latitude |
| `lon` | numeric | Longitude |
| `extensao_km` | numeric | Extensão em km |
| `desnivel_m` | numeric | Desnível (opcional) |
| `altitude_m` | integer | Altitude |
| `solo_type` | text | Tipo de solo |
| `exposicao` | text | `aberta` ou `fechada` |
| `trail_type` | text | `natural` ou `bikepark` |
| `bioma` | text | Bioma |
| `regiao` | text | Sigla do estado |
| `strava_url` | text | URL do segmento no Strava |
| `polyline` | text | Encoded polyline |
| `strava_elevation_profile` | jsonb | Perfil de elevação |
| `created_at` | timestamptz | Timestamp de criação |

**Usado em:**
- `mtb-forecast.py` → `_buscar_strava_com_condicoes()` — recupera trilhas Strava do usuário para notificações
- `mtb-forecast.py` → `_buscar_strava_usuario()` — busca para envio de e-mail
- `app/(app)/perfil/strava/page.tsx` → insert ao vincular, listagem
- `app/(app)/perfil/page.tsx` → listagem e deleção
- `app/(app)/dashboard/page.tsx` → trilhas Strava do usuário com condições

---

### `condicoes_strava`

Resultado do agente para segmentos Strava. Atualizado a cada rodada via upsert por `strava_segment_id`.

Campos idênticos à tabela `condicoes`, mas com chave primária diferente:

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial PK | Auto-incremento |
| `strava_segment_id` | bigint UNIQUE | Chave de negócio — um registro por segmento |
| *(demais campos)* | — | Idênticos a `condicoes` — ver tabela acima |

**Diferença de gravação:** `condicoes` faz DELETE+INSERT por `trilha_id`; `condicoes_strava` faz DELETE+INSERT por `strava_segment_id`.

**Usado em:**
- `mtb-forecast.py` → `gravar_condicoes_strava()` — DELETE + INSERT a cada execução
- `mtb-forecast.py` → `_buscar_strava_com_condicoes()` — lê condições para notificações Telegram
- `app/(app)/trilhas/[id]/page.tsx` → condições do segmento Strava no detalhe
- `app/(app)/dashboard/page.tsx` → condições das trilhas Strava do usuário

---

### `strava_config_sugestoes`

Sugestões de alteração de configuração de segmento enviadas por riders não-donos.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `strava_segment_id` | bigint | Segmento alvo |
| `user_id` | uuid FK | Usuário que sugeriu |
| `solo_type` | text | Novo tipo de solo sugerido |
| `exposicao` | text | Nova exposição sugerida |
| `trail_type` | text | Novo tipo de trilha sugerido |
| `bioma` | text | Novo bioma sugerido |
| `status` | text | `pendente`, `aprovada`, `rejeitada` |
| `created_at` | timestamptz | Timestamp de criação |

**Usado em:**
- `app/(app)/perfil/strava/sugestao/[segment_id]/page.tsx` → insert ao sugerir alteração
- `app/(app)/admin/page.tsx` → listagem, aprovação (update `strava_segmentos_config`) e rejeição

---

## Grupo 4 — Usuários

---

### `profiles`

Perfil estendido de cada usuário autenticado. Espelha `auth.users` com dados adicionais do app.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Mesmo UUID do `auth.users` |
| `email` | text | E-mail do usuário |
| `nome` | text | Nome completo |
| `apelido` | text | Apelido exibido no app |
| `regiao` | text | Sigla do estado preferida |
| `plano` | text | `gratuito`, `pro`, `elite` |
| `is_admin` | boolean | Acesso ao painel admin |
| `receber_email` | boolean | Opt-in de alertas por e-mail |
| `email_trilhas_favoritas` | boolean | Inclui trilhas favoritas no e-mail |
| `email_trilhas_strava` | boolean | Inclui trilhas Strava no e-mail |
| `telegram_ativo` | boolean | Opt-in de alertas Telegram |
| `telegram_chat_id` | text | Chat ID do usuário no Telegram |
| `avatar_url` | text | URL pública da foto de perfil no bucket `avatars` · inclui `?t=<timestamp>` para cache-bust |
| `stripe_customer_id` | text | ID do cliente no Stripe |
| `stripe_subscription_id` | text | ID da assinatura no Stripe |
| `promo_code_used` | text | Código promocional usado |
| `created_at` | timestamptz | Timestamp de criação |

**Usado em:**
- `mtb-forecast.py` → `_buscar_usuarios_telegram()` — busca riders com Telegram ativo
- `mtb-forecast.py` → `_buscar_usuarios_email()` — busca riders com e-mail ativo
- `app/(app)/dashboard/page.tsx` → perfil do usuário logado
- `app/(app)/perfil/page.tsx` → exibição e edição do perfil
- `app/(app)/admin/page.tsx` → listagem de usuários e verificação `is_admin`
- `app/auth/callback/route.ts` → upsert no primeiro login (OAuth)
- `app/(auth)/cadastro/page.tsx` → upsert no cadastro por e-mail
- `app/api/stripe/webhook/route.ts` → atualiza `plano` e IDs do Stripe
- `app/api/telegram/webhook/route.ts` → salva `telegram_chat_id`
- `components/Navbar.tsx` → exibe nome/apelido e verifica admin

---

### `favoritos`

Trilhas marcadas como favoritas por cada usuário.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `user_id` | uuid FK | Referência para `profiles.id` |
| `trilha_id` | uuid FK | Referência para `trilhas.id` |
| `created_at` | timestamptz | Timestamp de criação |

**Regra de negócio:** plano `gratuito` limitado a 5 favoritos.

**Usado em:**
- `mtb-forecast.py` → `_buscar_favoritos_usuario()` — favoritos para filtrar notificações
- `app/(app)/trilhas/page.tsx` → toggle de favorito na listagem
- `app/(app)/trilhas/[id]/page.tsx` → verifica se é favorito para exibir formulário de avaliação
- `app/(app)/dashboard/page.tsx` → trilhas favoritas do usuário
- `app/(app)/perfil/page.tsx` → contagem e listagem de favoritos
- `components/TrailObservations.tsx` → favoritar via observações

---

## Grupo 5 — Interações

---

### `observacoes_trilha`

Avaliações de riders sobre condições reais da trilha. Pode referenciar trilha pública ou segmento Strava.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `trilha_id` | uuid FK | Referência para `trilhas.id` (null se Strava) |
| `strava_segment_id` | bigint | ID do segmento Strava (null se trilha pública) |
| `user_id` | uuid FK | Referência para `profiles.id` |
| `estrelas` | integer | Avaliação de 1 a 5 |
| `texto` | text | Comentário (máx. 150 caracteres) |
| `veredicto_sistema` | text | Veredicto do sistema no momento da avaliação |
| `created_at` | timestamptz | Timestamp de criação |

**Regra:** rider pode avaliar apenas trilhas favoritas ou que é `isOwner` (no caso Strava).

**Usado em:**
- `components/TrailObservations.tsx` → CRUD completo (list, insert, update)
- `app/(app)/dashboard/page.tsx` → avaliações do usuário
- Join com `profiles` para exibir `apelido`, `nome`, `email`

---

### `admin_aprovacoes`

Workflow de dupla aprovação para alterações nas tabelas de configuração do modelo.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Gerado via `gen_random_uuid()` |
| `solicitante_id` | uuid FK | Admin que solicitou a alteração |
| `aprovador_id` | uuid FK | Outro admin que deve aprovar |
| `tabela` | text | Tabela alvo: `tabela_solo`, `threshold_sazonal`, `meia_vida_secagem`, `biomas`, `trail_type_config` |
| `operacao` | text | `update` ou `insert` |
| `dados_anteriores` | jsonb | Snapshot do registro antes da alteração |
| `dados_novos` | jsonb | Dados que serão aplicados se aprovado |
| `status` | text | `pendente`, `aprovada`, `rejeitada` |
| `motivo_rejeicao` | text | Motivo (opcional) |
| `motivo` | text | Justificativa do solicitante (mín. 20 chars) |
| `created_at` | timestamptz | Timestamp de criação |

**Fluxo:** Admin A edita tabela → cria `admin_aprovacoes` (status=pendente) → Admin B aprova → alteração aplicada na tabela alvo.

**Usado em:**
- `app/(app)/admin/tabelas/page.tsx` → CRUD completo do workflow
- Tabelas que requerem aprovação: `tabela_solo`, `threshold_sazonal`, `meia_vida_secagem`, `biomas`, `trail_type_config`

---

## Grupo 6 — Pump Tracks (4 tabelas)

Todas com RLS: `SELECT` público, `INSERT/UPDATE/DELETE` apenas para `auth.uid() = user_id` (onde aplicável).

---

### `trilhas_pumptrack`

Cadastro de pump tracks do Brasil. Populado via CSV inicial (`pumptracks_brasil.csv`) + formulário `/trilhas/cadastrar` (tipo "Pump Track").

| Coluna | Tipo | Valores / Notas |
|---|---|---|
| `id` | text PK | `BR-001` a `BR-015` (dados iniciais) · `PT-<timestamp>` (cadastros de riders) |
| `nome` | text NOT NULL | Nome do pump track |
| `cidade` | text | Cidade do município |
| `uf` | text | Sigla do estado (SP, RJ, MG...) — usado como chave de filtro no web app |
| `endereco` | text | Endereço completo (opcional) |
| `latitude` / `longitude` | numeric(10,6) | Coordenadas decimais — usadas no mapa Leaflet e link Waze |
| `tipo_superficie` | text | Asfalto · Terra · Terra/Saibro · Concreto · Asfalto/Terra · Terra/Madeira · Concreto/Asf. |
| `comprimento_estimado` | text | Ex: `200m` · `350m (03 pistas)` |
| `iluminacao` | text | Sim · Não |
| `estacionamento` | text | Sim · Não · Na Rua · Sim (Parque) · Sim (Privado) · Sim (Camping) · Sim (Hotel) · Sim (Complexo) |
| `fonte` | text | Velosolutions · Blue Pump Tracks · Governo SP · Mobai · Sesc SC · etc. |
| `google_maps_url` | text | Link direto (ex: `https://maps.google.com/?q=-23.5992,-46.6575`) |
| `instagram` | text | Handle `@nome` · `N/I` quando não identificado |
| `status_validacao` | text | `Ativo - Homologado` · `Ativo - Base de Dados` · `Pendente - Revisão` |
| `created_at` | timestamptz | Auto |

**Políticas RLS:**
```
SELECT: público (leitura livre)
INSERT: usuário autenticado (qualquer) — status = 'Pendente - Revisão'
```

**Usado em:**
- `mtb-forecast.py` → `_carregar_pumptracks_supabase()` — carrega todos para o loop do agente
- `app/(app)/trilhas/page.tsx` → query com `condicoes_pumptrack(...)` — listagem
- `app/(app)/pump-track/[id]/page.tsx` → query individual
- `app/(app)/mapa/page.tsx` → marcadores roxo "P" no Leaflet
- `app/(app)/trilhas/cadastrar/page.tsx` → INSERT novos pump tracks

---

### `condicoes_pumptrack`

Previsão do tempo por pump track, gerada pelo agente Python. **Sem modelo de solo** — apenas dados meteorológicos das próximas 24–48h.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto (`gen_random_uuid()`) |
| `pumptrack_id` | text FK | → `trilhas_pumptrack.id` CASCADE DELETE |
| `gerado_em` | timestamptz | Momento da última execução |
| `rain_mm` | numeric(6,1) | Chuva prevista **próximas 24h** (mm) — `resumo_onecall(data["hourly"][:24])` |
| `pico_3h` | numeric(6,1) | Maior acumulado em janela de 3h nas próximas 48h (mm) |
| `wind_kmh` | numeric(6,1) | Vento máximo previsto 24h (km/h) — `wind_ms × 3.6` |
| `temp_max` | numeric(5,1) | Temperatura máxima prevista 24h (°C) |
| `temp_min` | numeric(5,1) | Temperatura mínima prevista 24h (°C) |
| `pop_48h` | integer | Probabilidade máxima de chuva 48h (%) |

> Índice UNIQUE por `pumptrack_id` → estratégia DELETE + INSERT a cada execução.
> **Não existe otimização zero-chuva** para pump tracks — pipeline sempre completo (sem modelo de solo a economizar).

**Fluxo de escrita (Python):**
```
fetch_onecall({"lat": pt["latitude"], "lon": pt["longitude"]})
fetch_openmeteo({"lat": ..., "lon": ...})
Fusão 70/30
_gravar_condicao_pumptrack(pt["id"], dados)
  DELETE condicoes_pumptrack WHERE pumptrack_id = pt_id
  POST   condicoes_pumptrack (INSERT novo)
```

**Usado em:**
- `app/(app)/trilhas/page.tsx` → `PumpTrackCard` exibe rain/wind/temp
- `app/(app)/pump-track/[id]/page.tsx` → grid 3 colunas: Chuva 24h · Vento 24h · Temperatura
- `app/(app)/mapa/page.tsx` → emoji de tempo no popup do marcador

---

### `fotos_pumptrack`

Galeria de fotos enviadas por riders via `/pump-track/[id]`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto |
| `pumptrack_id` | text FK | → `trilhas_pumptrack.id` CASCADE DELETE |
| `user_id` | uuid FK | → `profiles.id` CASCADE DELETE |
| `url` | text NOT NULL | URL pública no bucket `pumptrack-photos` (Supabase Storage) |
| `created_at` | timestamptz | Auto |

**Bucket Storage:** `pumptrack-photos` — público, 5 MB máx, jpeg/png/webp.

**Path de upload:** `{user_id}/{pumptrack_id}_{timestamp}.{ext}`

**RLS:**
```
SELECT: público
INSERT: authenticated, auth.uid() = user_id
DELETE: authenticated, auth.uid() = user_id
```

**API route:** `POST /api/pump-track/foto` — valida tipo/tamanho, faz upload via service role, insere referência.

---

### `observacoes_pumptrack`

Avaliações de riders com estrelas, texto e veredicto rápido.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Auto |
| `pumptrack_id` | text FK | → `trilhas_pumptrack.id` CASCADE DELETE |
| `user_id` | uuid FK | → `profiles.id` CASCADE DELETE |
| `estrelas` | integer | 1–5 (CHECK) |
| `texto` | text | Máx. 200 caracteres (CHECK `char_length <= 200`) |
| `veredicto_rider` | text | `ROLOU TOP` · `ESTAVA MOLHADO` · `SECO E RÁPIDO` · `CHEIO DE PEDAL` · `BOM PRA FAMÍLIA` |
| `created_at` | timestamptz | Auto |

**RLS:**
```
SELECT: público
INSERT: authenticated, auth.uid() = user_id
UPDATE: authenticated, auth.uid() = user_id AND created_at > now() - interval '24 hours'
DELETE: authenticated, auth.uid() = user_id
```

**Usado em:** `components/PumpTrackObservacoes.tsx` — tabs Avaliações / Fotos na página de detalhe.

---

## Resumo — Matriz de Uso por Arquivo

| Arquivo | Tabelas acessadas |
|---|---|
| `mtb-forecast.py` | `configuracoes_sistema`, `tabela_solo`, `threshold_sazonal`, `meia_vida_secagem`, `enso_config`, `aderencia_thresholds`, `veredicto_pesos`, `veredicto_limiares`, `meia_vida_clima_mult`, `biomas`, `trail_type_config`, `solo_type_config`, `inclinacao_config`, `aderencia_descricoes`, `trilhas`, `condicoes`, `strava_segmentos_config`, `condicoes_strava`, `profiles`, `favoritos`, `trilhas_pessoais`, `trilhas_pumptrack`, `condicoes_pumptrack` |
| `app/(app)/dashboard/page.tsx` | `profiles`, `favoritos`, `trilhas` + `condicoes`, `trilhas_pessoais`, `condicoes_strava`, `observacoes_trilha` |
| `app/(app)/trilhas/[id]/page.tsx` | `trilhas` + `condicoes`, `favoritos`, `profiles`, `trilhas_pessoais`, `condicoes_strava` |
| `app/(app)/trilhas/page.tsx` | `trilhas`, `favoritos`, `profiles`, `localidades`, `trilhas_pumptrack` + `condicoes_pumptrack` |
| `app/(app)/pump-track/[id]/page.tsx` | `trilhas_pumptrack`, `condicoes_pumptrack`, `fotos_pumptrack`, `observacoes_pumptrack`, `profiles` |
| `app/(app)/mapa/page.tsx` | `trilhas` + `condicoes`, `favoritos`, `trilhas_pumptrack` + `condicoes_pumptrack` |
| `app/(app)/trilhas/cadastrar/page.tsx` | `trilhas_pendentes` (trilha MTB) · `trilhas_pumptrack` (pump track) · `localidades` |
| `app/(app)/admin/page.tsx` | `profiles`, `trilhas_pendentes`, `trilhas`, `strava_segmentos_config`, `strava_config_sugestoes`, `localidades`, `admin_aprovacoes` |
| `app/(app)/admin/tabelas/page.tsx` | `profiles`, `tabela_solo`, `threshold_sazonal`, `meia_vida_secagem`, `biomas`, `trail_type_config`, `admin_aprovacoes` |
| `app/(app)/perfil/page.tsx` | `profiles` (inclui `avatar_url`), `trilhas_pendentes`, `favoritos`, `trilhas` |
| `app/(app)/perfil/strava/page.tsx` | `trilhas_pessoais`, `strava_segmentos_config` |
| `components/TrailObservations.tsx` | `observacoes_trilha`, `favoritos`, `profiles` |
| `components/PumpTrackObservacoes.tsx` | `observacoes_pumptrack`, `fotos_pumptrack`, `profiles` |
| `components/Navbar.tsx` | `profiles` (inclui `avatar_url`) |
| `app/api/profile/avatar/route.ts` | `profiles` (avatar_url) · Storage bucket `avatars` |
| `app/api/pump-track/foto/route.ts` | `fotos_pumptrack` · Storage bucket `pumptrack-photos` |
| `lib/domain.ts` | `tabela_solo`, `strava_segmentos_config` |
