# 🚵 Agent MTB Forecast

Agente automático de monitoramento climático para trilhas de **Mountain Bike — DH e Enduro**.

Roda diariamente via GitHub Actions, consulta as APIs do OpenWeather One Call 3.0 e Open-Meteo para cada trilha cadastrada, modela a condição real do solo com decaimento exponencial de umidade, aplica sazonalidade e fase ENSO, gera análise textual com Claude AI e envia emails HTML segmentados por região com ranking e previsão dos próximos 3 dias.

---

## Autores

| Rider | Papel |
|---|---|
| **Guilherme Leal** | MTB Rider · Criador do projeto |
| **Douglas Santos** | MTB Rider · Co-criador do projeto |

---

## Sumário

- [Como funciona](#como-funciona)
- [Configuração](#configuração)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Como adicionar trilhas](#como-adicionar-trilhas)
- [Campos da trilha](#campos-da-trilha)
- [Envio por região](#envio-por-região)
- [Lógica de análise](#lógica-de-análise)
- [Estrutura do email](#estrutura-do-email)
- [Apoie o projeto (Pix)](#apoie-o-projeto-pix)
- [Notas de versão](#notas-de-versão)

---

## Como funciona

```
GitHub Actions (cron diário 07:00 BRT)
        │
        ▼
OpenLandMap API   ──►  buscar_solo_openlandmap() por trilha (clay%, sand%, silt%, texture_class)
                        Fallback automático para solo_type manual se API indisponível
        │
        ▼
OpenWeather One Call 3.0  ──►  fetch_onecall() por trilha (previsão horária 48h)
                          ──►  fetch_onecall_historico() por trilha (timemachine 48h, 24h, 0h)
Open-Meteo API            ──►  fetch_openmeteo() por trilha (previsão horária 48h — fonte 30%)
Open-Meteo Archive API    ──►  fetch_vento_historico() por trilha (rajadas históricas 48h)
        │
        ▼
Média ponderada 70/30     ──►  chuva, vento, probabilidade, pico_3h
Histórico timemachine     ──►  acúmulo bruto e efetivo das últimas 48h (sem janela cega)
Modelo de secagem         ──►  decaimento exponencial por meia-vida ajustada ao clima real
ENSO ONI NOAA             ──►  multiplicador sazonal sobre thresholds de solo descansado
        │
        ▼
Análise local  ──►  aderência + veredicto por trilha
                    (solo_type + bioma + exposicao + altitude + trail_type +
                     acumulo_ef + pico_3h + inclinacao + clay_pct + ENSO +
                     vento_hist + gust_max_kmh)
        │
        ▼
Claude AI  ──►  análise textual em 3 parágrafos por região
GPT-3.5   ──►  frase de secagem por trilha (com ground truth de aderência e veredicto)
        │
        ▼
Gmail SMTP  ──►  email HTML segmentado por região para emails_{REGIAO}.txt
                 + BCC global (EMAIL_BCC) adicionado silenciosamente em todos os envios
```

---

## Configuração

### 1. Secrets no GitHub

Vá em **Settings → Secrets and variables → Actions → New repository secret** e adicione:

| Secret | Obrigatório | Descrição |
|---|---|---|
| `OPENWEATHER_API_KEY` | ✅ Sim | Chave da API [OpenWeatherMap One Call 3.0](https://openweathermap.org/api/one-call-3) |
| `ANTHROPIC_API_KEY` | ⚠️ Recomendado | Chave da API [Anthropic Console](https://console.anthropic.com) |
| `OPENAI_API_KEY` | ➕ Opcional | Chave da API OpenAI — habilita frases de secagem por GPT-3.5. Se ausente, usa fallback local |
| `EMAIL_FROM` | ✅ Sim | Endereço Gmail que envia o email |
| `EMAIL_PASSWORD` | ✅ Sim | Senha de app do Gmail (não a senha da conta) |
| `EMAIL_TO` | ✅ Sim | Destinatário(s) principal(is) — separar por vírgula se mais de um |
| `EMAIL_BCC` | ➕ Opcional | BCC global adicionado silenciosamente a **todos** os envios (monitoramento/auditoria) |

> **Gmail — senha de app:** acesse [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), crie uma senha de app para "Email" e use esse valor em `EMAIL_PASSWORD`.

> **Open-Meteo** não requer cadastro nem API key — é consultada automaticamente como fonte secundária de previsão (30%) e para histórico de rajadas via archive API.

> **OpenLandMap** não requer cadastro nem API key — é consultada automaticamente para enriquecer o fator de absorção com dados reais de argila. Se indisponível, o script usa o `solo_type` configurado no CSV como fallback.

### 2. Workflow

O arquivo `.github/workflows/mtb-forecast-workflow.yml` agenda a execução automática:

```yaml
on:
  schedule:
    - cron: "0 10 * * *"   # 07:00 BRT todos os dias
    - cron: "0 0 * * 6"    # Sexta às 21:00 BRT (sábado 00:00 UTC)
  workflow_dispatch:         # permite rodar manualmente
```

Para rodar manualmente: **Actions → Agent MTB Forecast → Run workflow**.

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `OPENWEATHER_API_KEY` | ✅ Sim | Chave de acesso à API One Call 3.0 do OpenWeather |
| `ANTHROPIC_API_KEY` | ⚠️ Recomendada | Chave da API Claude AI. Se ausente, exibe mensagem de fallback |
| `OPENAI_API_KEY` | ➕ Opcional | Chave da API OpenAI para frases de secagem via GPT-3.5 |
| `EMAIL_FROM` | ✅ Sim | Conta Gmail remetente |
| `EMAIL_PASSWORD` | ✅ Sim | Senha de app do Gmail |
| `EMAIL_TO` | ✅ Sim | Destinatário(s) principal(is), separados por vírgula |
| `EMAIL_BCC` | ➕ Opcional | BCC global — adicionado a todos os envios, nunca visível no email recebido |
| `DEBUG_MODEL` | ➕ Opcional | `true` para imprimir detalhes internos do modelo no log (acúmulo, score, motivo) |

---

## Como adicionar trilhas

As trilhas são carregadas de um arquivo CSV chamado `trilhas.csv`, na mesma pasta do script.

### Formato do CSV

```csv
name;lat;lon;solo_type;exposicao;altitude_m;trail_type;desnivel_m;extensao_km;regiao;bioma
ZigZag - Campos do Jordao - SP;-22.768683;-45.614767;preto;fechada;1630;natural;480;32;SP;Mata Atlântica
DH Heineken short - Itabirito - MG;-20.224394;-43.971293;ferro;aberta;1445;bikepark;93;0.40;MG;
```

> O script detecta automaticamente o encoding do arquivo (UTF-8 ou Latin-1) e o separador (`,` ou `;`). Coordenadas com separador de milhar brasileiro (ex: `-23.315.261`) são normalizadas automaticamente.

**Como obter as coordenadas:**
1. Abra o [Google Maps](https://maps.google.com)
2. Clique com o botão direito no ponto exato da trilha
3. Clique nas coordenadas que aparecem no topo do menu — elas são copiadas automaticamente
4. Cole em `lat` e `lon`

---

## Campos da trilha

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | `string` | ✅ | Nome da trilha no email. Padrão sugerido: `"Nome - Cidade - UF"` |
| `lat` | `float` | ✅ | Latitude em graus decimais (negativo para sul) |
| `lon` | `float` | ✅ | Longitude em graus decimais (negativo para oeste) |
| `solo_type` | `string` | ✅ | Tipo de solo — ver tabela abaixo |
| `exposicao` | `string` | ✅ | `"aberta"` ou `"fechada"` — ver tabela abaixo |
| `altitude_m` | `int` | ✅ | Altitude média em metros |
| `trail_type` | `string` | ✅ | `"natural"` ou `"bikepark"` |
| `regiao` | `string` | ✅ | Sigla da região — ex: `SP`, `MG`. Controla qual email recebe as trilhas |
| `desnivel_m` | `float` | ➕ | Desnível total em metros (opcional) |
| `extensao_km` | `float` | ➕ | Extensão total em km (opcional) — combinado com `desnivel_m` calcula inclinação % |
| `bioma` | `string` | ➕ | Bioma da trilha — ex: `"Mata Atlântica"`. Ativa ajuste de microclima quando preenchido |

### Valores de `solo_type`

Usado como **fallback** quando a OpenLandMap não retorna dados. Quando a API retorna `clay_pct`, o fator de absorção é calculado diretamente a partir da argila real.

| Valor | Fator de absorção base | Meia-vida secagem (aberta/fechada) | Quando usar |
|---|---|---|---|
| `"terra"` | 0.80 | 24h / 36h | Solo de terra batida, barro, trilhas de mata |
| `"misto"` | 0.55 | 18h / 28h | Combinação de terra e pedra |
| `"misto_mg"` | 0.45 | 12h / 18h | Misto com presença de minério — Quadrilátero Ferrífero |
| `"preto"` | 0.60 | 14h / 24h | Serapilheira da Mata Atlântica sobre Cambissolos/quartzitos |
| `"pedra"` | 0.25 | 6h / 10h | Trilhas predominantemente rochosas, granito |
| `"ferro"` | 0.30 | 8h / 14h | Solo ferruginoso — Quadrilátero Ferrífero |

> Solos `"ferro"` e `"misto_mg"` exibem automaticamente o badge **⛏ Quadrilátero Ferrífero** no card do email.

### Valores de `exposicao`

| Valor | Efeito na meia-vida | Quando usar |
|---|---|---|
| `"fechada"` | Meia-vida maior (já embutida na tabela `solo_type × exposicao`) | Mata atlântica densa, sombra constante, pouca ventilação |
| `"aberta"` | Meia-vida menor (já embutida na tabela `solo_type × exposicao`) | Campos, chapadas, cristas expostas, bike parks sem cobertura |

> A exposição também define o **threshold de rajada futura** para ativar alerta: ≥ 30 km/h em trilhas abertas; ≥ 50 km/h em trilhas fechadas.

### Valores de `trail_type`

| Valor | Ajuste no modelo | Quando usar |
|---|---|---|
| `"natural"` | sem ajuste — risco por inclinação aplicado integralmente | Trilhas naturais sem infraestrutura de drenagem |
| `"bikepark"` | fator de absorção −0.20 (aberta) ou −0.10 (fechada) + score ×0.90 + −1 ponto de risco | Bike parks com alguma infraestrutura de drenagem |

> Bike parks com `acumulo_ef` acima do threshold de saturação perdem o benefício e podem atingir ATENÇÃO.

### Valores de `bioma`

| Valor | Efeito no modelo | Badge no email |
|---|---|---|
| `"Mata Atlântica"` + altitude ≥ 600m + `"fechada"` | threshold 25% mais conservador · meia-vida base ×1.20 | 🌿 Mata Atlântica |
| `"Mata Atlântica"` demais casos | threshold 10% mais conservador · meia-vida base ×1.10 | 🌿 Mata Atlântica |
| Qualquer outro valor ou vazio | sem ajuste | sem badge |

> O ajuste conservador existe porque precipitação orográfica, evapotranspiração da mata e chuva oculta tornam essas trilhas sistematicamente mais úmidas do que a API indica.

### Campos opcionais: `desnivel_m` e `extensao_km`

Quando ambos estão preenchidos, o script calcula a **inclinação média** da trilha:

```
inclinacao_pct = (desnivel_m / (extensao_km × 1000)) × 100
```

A inclinação impacta dois aspectos:

**1. Fator de absorção** — trilhas íngremes escoam mais rápido:

| Inclinação | Ajuste no fator de absorção |
|---|---|
| < 10% | sem ajuste |
| 10–20% | −0.08 |
| 20–30% | −0.15 |
| > 30% | −0.22 |

**2. Risco no veredicto** — trilhas naturais íngremes acumulam pontos de risco adicionais (apenas quando há chuva ou umidade residual):

| Inclinação | Pontos de risco adicionais |
|---|---|
| > 20% | +1 |
| > 30% | +2 |

> Bike parks não sofrem agravamento por inclinação.

### Ajuste por altitude

Trilhas acima de **1200m** recebem um acréscimo de `+0.05` no fator de absorção, simulando maior umidade por névoa e temperatura mais baixa.

> O fator de absorção final é sempre limitado ao intervalo `[0.05, 1.0]` após todos os ajustes.

---

## Envio por região

O envio é segmentado por região. Cada região recebe um email separado contendo apenas as trilhas cadastradas com aquela sigla na coluna `regiao`.

### Arquivos de destinatários

Crie um arquivo `emails_{REGIAO}.txt` na mesma pasta do script para cada região:

```
emails_SP.txt   → destinatários que recebem trilhas de SP
emails_MG.txt   → destinatários que recebem trilhas de MG
```

### Formato do arquivo

```
# Comentários com # são ignorados
# Um ou mais endereços por linha, separados por vírgula
rider1@email.com,
rider2@email.com, rider3@email.com,
```

### Regras de envio

| Situação | Comportamento |
|---|---|
| `emails_{REGIAO}.txt` existe e tem endereços | Email enviado para essa região |
| `emails_{REGIAO}.txt` não existe | Região ignorada — aviso no log |
| `emails_{REGIAO}.txt` existe mas está vazio | Região ignorada — aviso no log |
| Nenhum arquivo de região encontrado | Fallback para `emails.txt` global |
| `EMAIL_BCC` definido no Secret | Adicionado como BCC em **todos** os envios |

> O assunto do email inclui a região: `Monitoramento de Trilhas MTB — SP — DD/MM/YYYY`

---

## Lógica de análise

### Solo real via OpenLandMap

Antes de processar as previsões, o script consulta a **OpenLandMap API** para cada trilha:

- `clay_pct` — teor de argila em %
- `sand_pct` — teor de areia em %
- `silt_pct` — teor de silte em %
- `texture_class` — classificação textural USDA (Argiloso, Franco, Arenoso, etc.)

Quando `clay_pct` está disponível, o fator de absorção base é calculado diretamente:

```python
base = 0.20 + (clay_pct / 100) × 1.60   # Clay 40% → 0.84 | Clay 10% → 0.36
base = max(0.25, min(0.90, base))
```

Se a API falhar, o script usa o `solo_type` do CSV como fallback, sem interrupção.

Quando `clay_pct` está disponível, os multiplicadores manuais por `solo_type` são ignorados no cálculo de score — o dado real prevalece.

### Fusão de fontes meteorológicas

Para cada trilha, o script consulta **OpenWeather One Call 3.0** (70%) e **Open-Meteo** (30%) em paralelo. Chuva acumulada, velocidade máxima de vento, probabilidade de chuva e `pico_3h` são calculados como média ponderada entre as duas fontes. Se o Open-Meteo falhar, o script usa apenas o OpenWeather.

### Histórico real de chuva (últimas 48h) — sem janela cega

O script faz **três chamadas ao endpoint `/timemachine`** da One Call 3.0 por trilha (offsets de 48h, 24h e 0h), cobrindo integralmente as madrugadas anteriores ao relatório das 07:00 BRT. Entradas duplicadas entre chamadas são deduplicadas por timestamp antes do acúmulo.

### Modelo de secagem do solo

A umidade residual no solo é modelada por **decaimento exponencial** com meia-vida ajustada em tempo real:

```python
efetivo = Σ precipitacao_hora × 0.5^(horas_atras / meia_vida)
```

A meia-vida base (por `solo_type` e `exposicao`) é ajustada dinamicamente por:

| Fator climático | Condição | Efeito na meia-vida |
|---|---|---|
| Temperatura | ≥ 30°C | ×0.78 (seca muito mais rápido) |
| Temperatura | ≥ 26°C | ×0.86 |
| Temperatura | ≤ 16°C | ×1.12 (seca mais devagar) |
| Temperatura | ≤ 10°C | ×1.22 |
| Vento | ≥ 6 m/s | ×0.84 |
| Vento | ≥ 3 m/s | ×0.92 |
| Vento | ≤ 1 m/s | ×1.05 |
| Nebulosidade | ≥ 90% | ×1.12 |
| Nebulosidade | ≥ 70% | ×1.06 |
| Nebulosidade | ≤ 25% | ×0.94 |
| Umidade relativa | ≥ 95% | ×1.15 |
| Umidade relativa | ≥ 85% | ×1.08 |
| Umidade relativa | ≤ 45% | ×0.93 |
| Bioma Mata Atlântica | altitude ≥ 600m + fechada | ×1.20 sobre meia-vida base |
| Bioma Mata Atlântica | demais casos | ×1.10 sobre meia-vida base |

> A meia-vida ajustada é limitada ao intervalo `[4h, 72h]`.

### Sazonalidade e ENSO

Os thresholds de "solo descansado" variam por **mês**, **região** (SP vs MG) e **fase ENSO** via índice ONI da NOAA:

| Fase ENSO | Multiplicador sobre threshold |
|---|---|
| El Niño Forte (ONI ≥ 1.5) | ×0.75 — threshold menor, solo considerado úmido mais cedo |
| El Niño (ONI ≥ 0.5) | ×0.85 |
| Neutro | ×1.00 |
| La Niña (ONI ≤ −0.5) | ×1.15 |
| La Niña Forte (ONI ≤ −1.5) | ×1.25 — threshold maior, solo aguenta mais chuva |

### Pico de intensidade (`pico_3h`)

Maior acumulado em janela deslizante de 3 horas consecutivas nas próximas 48h, com granularidade horária (48 pontos). Quando `pico_3h ≥ 10mm`, é usado como fator principal em vez do acumulado total.

### Cálculo de aderência

```python
# Quando solo descansado (acumulo_ef < threshold):
impacto = pico_3h × 0.7    (se pico_3h ≥ 10mm)
impacto = rain_mm × 0.6    (se pico_3h < 10mm)

# Quando solo já úmido (acumulo_ef ≥ threshold):
impacto = pico_3h × 1.0    (se pico_3h ≥ 10mm)
impacto = rain_mm + acumulo_ef × 0.3   (se pico_3h < 10mm)

impacto × fator_absorcao × solo_mult (se clay_pct ausente) × 0.90 (se bikepark)
score = max(0, min(100, impacto × 10))
```

| Score | Status | Emoji | Cor da borda |
|---|---|---|---|
| < 10 | SECO | 🟡 | Amarelo |
| 10 – 35 | GRIP PERFEITO | 🟢 | Verde |
| 35 – 70 | BOA ADERÊNCIA | 🟠 | Laranja |
| ≥ 70 | BAIXA ADERÊNCIA | 🔴 | Vermelho |

### Veredicto

O veredicto é calculado por acúmulo de pontos de risco:

| Condição | Pontos |
|---|---|
| BAIXA ADERÊNCIA | +3 |
| BOA ADERÊNCIA | +2 |
| GRIP PERFEITO | +1 |
| pico_3h ≥ 15mm | +2 |
| pico_3h ≥ 10mm | +1 |
| Chuva acumulada ≥ 8mm | +1 |
| Vento ≥ 12 m/s | +1 |
| Inclinação > 30% (com umidade) | +2 |
| Inclinação > 20% (com umidade) | +1 |
| Natural inclinado (>20%) com chuva e aderência ≤ BOA | +1 |
| Bikepark | −1 |
| Bikepark saturado | +2 |
| Vento histórico nível 3 (>90 km/h) | +2 |
| Vento histórico nível 2 (65–90 km/h) | +1 |
| Vento histórico nível 2 + solo encharcado | +1 adicional |
| Vento histórico nível 1 (55–65 km/h) + solo encharcado | +1 |
| **Rajada prevista ≥ 30 km/h (trilha aberta)** | risco mínimo = 2 |
| **Rajada prevista ≥ 50 km/h (trilha fechada)** | risco mínimo = 2 |

| Total de pontos | Veredicto |
|---|---|
| ≤ 1 | ✅ DROP LIBERADO |
| 2 – 3 | ⚠️ ATENÇÃO |
| ≥ 4 | 🛑 MELHOR ESPERAR |

### Janela limpa e horários de chuva

**Janela limpa** (`🕐 Melhor janela`): maior bloco contínuo nas próximas 48h onde probabilidade < 30%, precipitação < 1mm/h e vento < 15 m/s. Se nenhum bloco existir, exibe "Sem janela limpa nas próximas 48h".

**Horários de chuva** (`🌦 Chuva prevista`): blocos com precipitação ≥ 1mm/h ou probabilidade ≥ 40%, separados quando o gap entre blocos supera 3h. Exibe o pico de probabilidade ao final.

### Previsão D+1 / D+2 / D+3

Para cada dia futuro, o acúmulo efetivo projeta o decaimento da umidade atual até aquele momento:

```python
ef_decaido = acumulo_ef × 0.5^(horas_ate_alvo / meia_vida_h)
acumulo_ate_alvo = ef_decaido + chuva_prevista_anterior
```

D+1 e D+2 usam dados horários One Call 3.0. D+3 faz fallback para Open-Meteo quando os dados One Call não cobrem esse dia.

### Monitoramento de vento histórico (últimas 48h)

O script cruza vento sustentado máximo (OpenWeather timemachine, convertido para km/h) com rajadas máximas (Open-Meteo archive) das últimas 48h. Quando detectado vento forte, um **alerta colorido** é exibido no card:

| Nível | Condição | Alerta | Impacto no veredicto |
|---|---|---|---|
| 1 — Amarelo | Sustentado > 55 km/h OU rajada > 60 km/h | 🟡 Vento moderado a forte | +1 ponto (só se solo encharcado) |
| 2 — Laranja | Sustentado > 65 km/h OU rajada > 80 km/h | 🟠 Ventos fortes | +1 ponto (sempre) + +1 se solo encharcado |
| 3 — Vermelho | Sustentado > 90 km/h OU rajada > 90 km/h | 🔴 Risco alto — tempestade | +2 pontos |

### Alertas de rajadas futuras (V7.1)

Além do vento histórico, o script avalia as **rajadas previstas para as próximas 48h** (máxima entre OpenWeather e Open-Meteo). Thresholds diferenciados por exposição da trilha:

| Exposição | Threshold | Alerta ativado |
|---|---|---|
| `"aberta"` | ≥ 30 km/h | 🟡 Alerta amarelo + veredicto mínimo ATENÇÃO |
| `"fechada"` | ≥ 50 km/h | 🟡 Alerta amarelo + veredicto mínimo ATENÇÃO |

> Em trilhas abertas (cristas, campos, bike parks expostos), rajadas a partir de 30 km/h já representam risco de perda de controle em descidas, saltos e trechos de crista. Em trilhas fechadas, o dossel atenua o vento — o alerta só é ativado em rajadas mais intensas que possam atingir clareiras.

### Ranking

Ordenado pelo **veredicto das próximas 12h**, com desempate pelo status de aderência:

```
DROP LIBERADO → ATENÇÃO → MELHOR ESPERAR
  (desempate): SECO → GRIP PERFEITO → BOA ADERÊNCIA → BAIXA ADERÊNCIA
```

---

## Estrutura do email

```
┌─────────────────────────────────────┐
│  🚵 MTB DH & Enduro — Região SP     │  Cabeçalho escuro com região
│  Monitoramento de Trilhas           │
│  DD/MM/YYYY                         │
├─────────────────────────────────────┤
│  🏆 Melhor trilha do momento        │  Destaque verde
│  Nome da trilha                     │  (1º no ranking — melhor veredicto 12h)
│  Solo X · Xmm · Xm/s · Janela: ... │
├─────────────────────────────────────┤
│  Análise técnica — SP               │  3 parágrafos gerados pelo Claude AI
├─────────────────────────────────────┤
│  Ranking de trilhas                 │  Card por trilha, ordenado por veredicto 12h
│  #01 🟢 Nome — GRIP PERFEITO        │  Borda colorida por status de aderência
│  🏟 Bike Park / 🏔 Trilha Natural   │
│  ⛰ Xm · Xkm · X% inclinação        │  Características físicas (quando preenchido)
│  🪨 Franco (arg X% · ar X%)         │  Solo real OpenLandMap (quando disponível)
│  ⛏ Quadrilátero Ferrífero           │  Badge automático para ferro/misto_mg
│  🌿 Mata Atlântica                  │  Badge quando bioma preenchido
│  ── Condição do Solo ──             │
│  [frase de secagem GPT/local]       │  Texto colorido por condição
│  🕰 Chuva 48h: Xmm bruto · Xmm ef. │  Histórico real + acúmulo efetivo
│  ⏱ Última chuva: Xh atrás          │
│  ⏳ Meia-vida secagem: Xh           │
│  ── Previsão 48h ──                 │
│  12h: 🌧 Xmm ☁️ X% 💨 Xm/s 🌡 X°C │
│  24h: 🌧 Xmm ☁️ X% 💨 Xm/s 🌡 X°C │
│  ⚡ Pico de chuva: Xmm em 3h        │  (só quando pico ≥ 5mm)
│  🕐 Melhor janela: DD/MM XXh–XXh    │
│  🌦 Chuva prevista: DD/MM XXh–XXh   │
│  [descrição de aderência]           │
│  ── ⚠️ Alertas ──                   │  (só quando há alertas)
│  🟡 Rajadas previstas: Xkm/h 48h   │  Rajada futura por exposição (V7.1)
│  🟠/🔴 Ventos fortes hist. Xkm/h   │  Vento histórico + rajadas últimas 48h
│  📡 Fonte: OpenWeather + Open-Meteo │
│  🌱 Solo: OpenLandMap / manual      │
│  📈 ENSO: NOAA ONI                  │
│  💨 Vento hist.: OW + OM archive    │
├─────────────────────────────────────┤
│  ☕ Apoie o projeto                 │  Seção de doação Pix
│  QR Code · dsantos83.mtb@gmail.com  │
├─────────────────────────────────────┤
│  Previsão — Próximos 3 dias         │  Tabela D+1 / D+2 / D+3
│  Trilha A │ ✅ 0.2mm │ ✅ 0mm │ ⚠️  │
│  Trilha B │ ⚠️ 3mm  │ 🛑 12mm│ 🛑  │
├─────────────────────────────────────┤
│  MTB Agent V7.1 · OW + OM + AI     │  Rodapé
│  🚵 Guilherme Leal · MTB Rider      │
│  🚵 Douglas Santos · MTB Rider      │
└─────────────────────────────────────┘
```

---

## Apoie o projeto (Pix)

O email inclui uma **seção de doação Pix** entre o ranking de trilhas e a tabela de previsão.

- **Chave Pix:** `dsantos83.mtb@gmail.com`
- **Valor:** livre — o doador escolhe
- **QR code:** gerado dinamicamente via `api.qrserver.com` com payload BR Code padrão Bacen (EMV/CRC16)
- **Fallback:** se a geração do QR code falhar, apenas a chave Pix em texto é exibida

---

## Dependências

O script usa apenas bibliotecas da biblioteca padrão do Python 3.11 — **nenhum `pip install` necessário**:

`os`, `json`, `html`, `urllib.request`, `urllib.error`, `smtplib`, `email`, `datetime`, `csv`, `pathlib`, `time`

---

## APIs utilizadas

| API | Uso | Plano gratuito |
|---|---|---|
| [OpenWeather One Call 3.0](https://openweathermap.org/api/one-call-3) | Previsão horária 48h + histórico timemachine por coordenada | Não — requer assinatura (1.000 calls/dia gratuitas após cadastro) |
| [Open-Meteo Forecast](https://open-meteo.com) | Previsão horária (30%) + rajada máxima prevista | Sim (sem cadastro) |
| [Open-Meteo Archive](https://open-meteo.com/en/docs/historical-weather-api) | Rajadas históricas ERA5 últimas 48h por coordenada | Sim (sem cadastro) |
| [OpenLandMap](https://openlandmap.org) | Composição real do solo por coordenada (clay%, sand%, silt%) | Sim (sem cadastro) |
| [NOAA CPC](https://www.cpc.ncep.noaa.gov) | Índice ONI para classificação ENSO | Sim (sem cadastro) |
| [Anthropic Claude](https://console.anthropic.com) | Análise textual por região (claude-sonnet-4-5) | Não — requer créditos |
| [OpenAI GPT-3.5](https://platform.openai.com) | Frase de secagem por trilha (fallback local se ausente) | Não — requer créditos |
| [api.qrserver.com](https://api.qrserver.com) | QR code Pix (payload BR Code Bacen) | Sim (sem cadastro) |

---

## Notas de versão

### V7.1 — atual
- **Alertas de rajadas futuras por exposição** — `_alerta_rajada_futura_html()` exibe alerta amarelo quando rajadas previstas nas próximas 48h superam o threshold da trilha
- **Threshold diferenciado por exposição:** trilhas abertas alertam a partir de 30 km/h; trilhas fechadas a partir de 50 km/h
- **Impacto no veredicto:** quando rajada prevista atinge o threshold, o risco mínimo sobe para 2 (⚠️ ATENÇÃO), independente da aderência ao solo
- Seção "⚠️ Alertas" no card agrupa alertas de rajada futura (topo) e vento histórico (base), aparecendo apenas quando há ao menos um alerta ativo

### V7.0
- Refatoração interna: logs e prints atualizados para versão V7.0
- Sistema de alertas de vento preparado para suporte a múltiplos tipos de alerta por card

### V6.5
- **Campo `trail_drainage` removido** — drenagem já capturada por `solo_type`, `exposicao`, `trail_type` e `inclinacao`. Remoção elimina dupla contagem de benefício de drenagem
- Bikepark mantém fator fixo ×0.90 no score (equivalente ao comportamento `medium` anterior)
- **Correção:** bloco `DEBUG_MODEL` estava dentro do `except` — agora imprime corretamente para todas as trilhas quando `DEBUG_MODEL=true`

### V6.4
- Refatoração interna do modelo de score — `calcular_score_trilha()` centraliza cálculo de impacto
- Multiplicadores por `solo_type` aplicados diretamente no score em vez de no veredicto
- Bikepark com multiplicador de drenagem por `trail_drainage` (removido na V6.5)

### V5.24
- Campo `bioma` lido do `trilhas.csv` (coluna opcional)
- `fator_microclima()`: threshold conservador para Mata Atlântica
  - Altitude ≥ 600m + fechada → threshold 25% menor · meia-vida base ×1.20
  - Demais casos Mata Atlântica → threshold 10% menor · meia-vida base ×1.10
- Badge 🌿 Mata Atlântica exibido no card quando bioma identificado

### V5.23
- **One Call API 3.0** substitui `/data/2.5/forecast` como fonte principal
- Três chamadas `/timemachine` por trilha (48h, 24h, 0h) — elimina janela cega na madrugada
- Deduplicação de entradas sobrepostas entre chamadas timemachine por timestamp
- Média ponderada **70% OpenWeather / 30% Open-Meteo** (era 50/50)
- `pico_3h` calculado com granularidade horária (48 pontos vs 16 anteriores)
- Cron ajustado para **07:00 BRT** (`0 10 * * *`)

### V5.22
- Sazonalidade: thresholds de acúmulo derivados de ERA5-Land por região (SP / MG)
- ENSO: multiplicador sobre threshold sazonal via ONI NOAA
- Prompt Claude inclui fase ENSO para análise contextualizada

### V5.21
- Modelo de secagem do solo por **decaimento exponencial**
- Meia-vida ajustada dinamicamente por temperatura, vento, nebulosidade e umidade (bandas múltiplas)
- Tabela `_MEIA_VIDA_SECAGEM` por `(solo_type, exposicao)`

### V5.20
- Badge automático **⛏ Quadrilátero Ferrífero** para solos `ferro` e `misto_mg`
- Novo `solo_type` `"misto_mg"`: misto com presença de minério de ferro
- Novo `solo_type` `"ferro"`: solo ferruginoso do Quadrilátero Ferrífero

---

*MTB Agent V7.1 · Criado por Guilherme Leal e Douglas Santos*
