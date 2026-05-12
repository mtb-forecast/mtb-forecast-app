# 🚵 MTB Forecast — Web App + Agente Python

Plataforma completa de monitoramento climático para trilhas de **Mountain Bike — DH, Enduro, XCC e XCM** no Brasil.

Composta por dois sistemas integrados:
- **Web App** — interface Next.js com autenticação, favoritos, avaliações e integração Strava
- **Agente Python** — roda diariamente via GitHub Actions, coleta APIs meteorológicas, modela condição do solo e grava resultados no Supabase

---

## Autores

| Rider | Papel |
|---|---|
| **Guilherme Leal** | MTB Rider · Criador do projeto |
| **Douglas Santos** | MTB Rider · Co-criador do projeto |

---

## Sumário

- [Visão geral da arquitetura](#visão-geral-da-arquitetura)
- [Web App — Páginas e rotas](#web-app--páginas-e-rotas)
- [Web App — Componentes](#web-app--componentes)
- [Banco de dados — Supabase](#banco-de-dados--supabase)
- [Agente Python — Pipeline completo](#agente-python--pipeline-completo)
- [GitHub Actions — Workflow](#github-actions--workflow)
- [Configuração — Secrets](#configuração--secrets)
- [Desenvolvimento local](#desenvolvimento-local)
- [Como adicionar trilhas](#como-adicionar-trilhas)
- [Campos da trilha (CSV)](#campos-da-trilha-csv)
- [Lógica de análise do solo](#lógica-de-análise-do-solo)
- [Cálculo de veredicto](#cálculo-de-veredicto)
- [APIs utilizadas](#apis-utilizadas)
- [Notas de versão](#notas-de-versão)

---

## Visão geral da arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions (cron diário)                  │
│                                                                       │
│  OpenWeather One Call 3.0 ──┐                                        │
│  Open-Meteo Forecast        ├──► mtb-forecast.py ──► Supabase        │
│  Open-Meteo Archive         │       (agente Python)    (condicoes +   │
│  OpenLandMap                │                          condicoes_strava│
│  NOAA ONI (ENSO)            │                          trilhas)        │
│  Claude AI (Anthropic)  ────┘                                        │
│  GPT-3.5 (OpenAI)                                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Supabase (PostgreSQL + Auth)                      │
│                                                                       │
│  trilhas · condicoes · condicoes_strava · favoritos                  │
│  profiles · trilhas_pessoais · observacoes_trilha                    │
│  strava_segmentos_config                                              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Web App (Next.js 14 App Router)                  │
│                                                                       │
│  /               Landing page pública                                │
│  /login          Autenticação Supabase Auth                          │
│  /cadastro       Cadastro com perfil completo                        │
│  /dashboard      Favoritas + Strava + ranking da região              │
│  /trilhas        Listagem com filtro por região e busca              │
│  /trilhas/[id]   Detalhe: condição + previsão + avaliações           │
│  /perfil         Dados pessoais + integração Strava                  │
│  /admin          Painel de aprovação de trilhas e sugestões          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Web App — Páginas e rotas

### `/` — Landing page

Página pública de apresentação. Não requer autenticação.

**Conteúdo:**
- Split-screen hero: painel preto com CTA + painel com imagem e cards de exemplo de condições
- Faixa amarela com estatísticas (27 trilhas, chuva 48h, meia-vida, atualização)
- Seção "Como funciona" com 3 cards (chuva acumulada, tipo de solo, janela de pedal)
- CTA final com link para cadastro

**Design system:** preto `#111` + amarelo `#FFE000` + fundo `#f7f7f5` + cards brancos

---

### `/login` — Autenticação

Formulário de login via **Supabase Auth** (email + senha).

**Steps internos:**
1. `supabase.auth.signInWithPassword({ email, password })`
2. Em caso de erro, exibe mensagem inline
3. Em caso de sucesso, redireciona para `/dashboard`
4. Link para `/cadastro` para novos usuários

---

### `/cadastro` — Cadastro de conta

Formulário de 7 campos com validação inline e máscara de telefone.

**Campos:**
| Campo | Validação |
|---|---|
| Nome completo | obrigatório |
| Apelido | obrigatório (exibido no dashboard e avaliações) |
| Email | formato válido |
| Telefone | máscara `+55 (XX) XXXXX-XXXX`, máx. 13 dígitos |
| WhatsApp | checkbox vinculado ao telefone |
| Região | select com SP / MG / RJ / PR / SC / RS / outros |
| Senha | mínimo 6 caracteres |

**Steps internos:**
1. `validate()` — retorna objeto `Errors` com todos os campos inválidos
2. Botão "Criar conta" desabilitado (`opacity: 0.5`) até o formulário ser válido após primeira tentativa de submit
3. `supabase.auth.signUp({ email, password })`
4. `supabase.from('profiles').upsert({ id, email, nome, apelido, telefone, telefone_whatsapp, telegram_username, regiao, is_admin: false })`
5. Redireciona para `/dashboard`

---

### `/dashboard` — Dashboard principal

Página autenticada com três seções em grid.

**Steps de carregamento:**
1. `supabase.auth.getUser()` — verifica sessão; redireciona para `/login` se não autenticado
2. `supabase.from('profiles').select('*')` — carrega perfil (apelido, nome, região)
3. `supabase.from('favoritos').select('trilha_id')` — lista IDs favoritos do usuário
4. Para cada ID favorito: `supabase.from('trilhas').select('*, condicoes(*)')` — busca trilhas + condição mais recente
5. `supabase.from('trilhas').select('*, condicoes(*)')` filtrado por `regiao` do perfil — ranking regional (até 6 trilhas)
6. `supabase.from('trilhas_pessoais').select('*')` — trilhas Strava vinculadas ao usuário
7. Para cada trilha pessoal: `supabase.from('condicoes_strava').select(...)` — condição mais recente do segmento Strava

**Seções exibidas:**
- **Minhas trilhas favoritas** — grid de `TrilhaCard` com link para ver todas
- **Minhas trilhas Strava** — cards com borda laranja (#FC4C02), botão "Conectar com Strava" se vazio
- **Melhores em [região]** — ranking das 6 melhores trilhas da região do perfil

**Saudação:** usa `apelido` → `nome.split(' ')[0]` → `email.split('@')[0]`

---

### `/trilhas` — Listagem de trilhas

Listagem completa com busca e filtro por região.

**Steps de carregamento:**
1. Verifica autenticação; redireciona para `/login` se não autenticado
2. `supabase.from('trilhas').select('*, condicoes(*)')` com filtro `aprovada = true`, ordenado por nome
3. `supabase.from('favoritos').select('trilha_id')` — prepopula o `Set<string>` de favoritos
4. Filtro local por nome (busca `toLowerCase()`) e por região (select)

**Interação de favorito:**
- Clique na estrela chama `toggleFavorito(trilhaId)`
- Se já favorito: `supabase.from('favoritos').delete()` + remove do Set local
- Se não favorito: `supabase.from('favoritos').insert()` + adiciona ao Set local

---

### `/trilhas/[id]` — Detalhe da trilha

Página com condição completa da trilha, espelhando o card do email gerado pelo agente.

**Steps de carregamento:**
1. Verifica autenticação
2. `supabase.from('trilhas').select('*, condicoes(*)')` filtrado por `id` — trilha oficial
3. `supabase.from('favoritos')` — verifica se é favorita do usuário
4. Se não encontrada: tenta `supabase.from('trilhas_pessoais')` — trilha Strava pessoal
5. Se trilha Strava: `supabase.from('condicoes_strava')` — condição do segmento correspondente

**Seções exibidas (na mesma ordem do card do email):**

| Seção | Dados |
|---|---|
| Cabeçalho (preto) | nome, trail_type, região, bioma, características físicas (desnível + extensão + inclinação colorida), solo real (texture · arg% · ar%), badges Quadrilátero / Mata Atlântica |
| Aderência + veredicto | 3 linhas: ADERÊNCIA ATUAL · ADERÊNCIA FUTURA [label] · veredicto + texto_dinamico |
| Mapa | iframe Google Maps satélite (ou StravaMap + ElevationProfile para trilhas pessoais) |
| Condição do Solo | frase de secagem + chuva 48h bruto/efetivo + solo descansado/úmido + última chuva + meia-vida |
| Previsão 24h | 4 blocos de 6h (`00h→06h`, `06h→12h`, `12h→18h`, `18h→24h`) com 🌧mm / ☁️% / 💨m/s / 🌡°C; fallback para 12h/24h se coluna ainda vazia |
| Pico 3h | `⚡ Pico de chuva: Xmm em 3h` — só quando ≥ 5mm |
| Janela limpa | `🕐 Melhor janela: DD/MM XXh–XXh (Xh)` |
| Horários de chuva | `🌦 Chuva prevista: ...` |
| Alertas | 🟡 rajada futura por exposição · 🟡/🟠/🔴 vento histórico — só quando ativos |
| Avaliações dos riders | timeline vertical com estrelas, texto 150 chars, edição em 24h — requer favoritar |
| Próximos 3 dias | 3 cards com emoji + veredicto + 🌧mm · 💨m/s · 🌡°C |
| Fontes | linha de dados: OpenWeather / OpenLandMap / ENSO / vento histórico |

---

### `/perfil` — Perfil do usuário

Formulário de edição de dados pessoais com status de salvamento inline.

**Campos editáveis:** nome, apelido, email (somente leitura + 🔒), telefone (máscara `+55 (XX) XXXXX-XXXX`), checkbox WhatsApp, Telegram (prefixo `@` automático), região.

**Steps de salvamento:**
1. `supabase.from('profiles').upsert({ id, nome, apelido, telefone, telefone_whatsapp, telegram_username, regiao })`
2. Estado `saveStatus: 'idle' | 'success' | 'error'` controla feedback inline no botão
3. Após 2 segundos, retorna para `'idle'`

**Subseção Strava:** link para `/perfil/strava` se segmentos vinculados; botão "Conectar com Strava" caso contrário

---

### `/perfil/strava` — Integração Strava

Gerenciamento de segmentos Strava pessoais com sugestões do agente.

**Steps de carregamento:**
1. `supabase.from('trilhas_pessoais').select('*')` — segmentos já salvos pelo usuário
2. `supabase.from('strava_segmentos_config').select('*')` — sugestões geradas pelo agente com dados de slope/extensão/solo

**Interações:**
- **Adicionar segmento** por URL do Strava: extrai `segment_id` via regex, chama `/api/strava/segment/[id]` para buscar metadados e salvar em `trilhas_pessoais`
- **Remover segmento:** `supabase.from('trilhas_pessoais').delete()`
- **Aceitar sugestão do agente:** `supabase.from('trilhas_pessoais').insert()` com dados pré-preenchidos; remove da tabela de sugestões
- **Rejeitar sugestão:** `supabase.from('strava_segmentos_config').delete()`

**Badge de sugestão:** fundo amarelo `#FFE000` com texto `Sugerido pela API`

---

### `/admin` — Painel administrativo

Rota protegida — redireciona para `/dashboard` se `profile.is_admin !== true`.

**Seções:**
- **Estatísticas:** contagens de trilhas (total, aprovadas, pendentes), usuários cadastrados
- **Painel de aprovação** (`AdminPanel`): lista trilhas com `aprovada = false`, permite aprovar/rejeitar
- **Sugestões Strava:** cards comparativos — dados do rider (esquerda, fundo `#f7f7f5`) vs. sugestão do agente (direita, fundo `#fef9c3`)

---

## Web App — Componentes

### `TrilhaCard`

Card de trilha usado em `/trilhas`, `/dashboard` e ranking regional.

**Exibe:** nome, região, bioma, trail_type, veredicto (borda colorida à esquerda), aderência, chuva 48h, pico 3h, vento, frase de secagem, janela limpa, botão estrela de favorito.

**Cor da borda:** derivada do veredicto atual (12h preferido sobre 48h). Trilhas sem condição têm borda cinza.

---

### `TrailObservations`

Timeline vertical de avaliações de riders para uma trilha.

**Steps de carregamento:**
1. `supabase.from('observacoes_trilha').select('*, profiles(apelido, nome, email)')` ordenado por `created_at desc`
2. `supabase.from('favoritos').maybeSingle()` — verifica se usuário favoritou a trilha (gate para publicar)

**Interação — publicar avaliação:**
1. Usuário deve ter favoritado a trilha; se não, exibe botão "Favoritar trilha para avaliar"
2. Favoritar: `supabase.from('favoritos').insert()` + `podeComentar = true`
3. `StarSelector`: estado `hovered` local — estrela preenchida se `i < (hovered || value)`
4. Textarea 150 chars máx — contador fica vermelho acima de 130
5. `supabase.from('observacoes_trilha').insert({ trilha_id, user_id, estrelas, texto, veredicto_sistema })`
6. Atualiza lista local; exibe "Avaliação publicada!" por 3 segundos

**Edição (dentro de 24h):**
- Botão "Editar" substitui texto por textarea pré-preenchida com o conteúdo original
- `supabase.from('observacoes_trilha').update()` — salva alteração
- "Cancelar" restaura visualização sem salvar

**Visual da timeline:**
- Dot amarelo `#FFE000` com borda `#111` para avaliações com menos de 24h
- Dot cinza `#e5e5e5` para avaliações antigas
- Linha vertical contínua à esquerda dos dots

---

### `Navbar`

Barra de navegação sticky (não fixed) com `position: sticky; top: 0; z-index: 50`.

**Exibição:** oculta em `/`, `/login` e `/cadastro` (lógica no `layout.tsx`).

**Links:** Dashboard · Trilhas · Perfil · Logout

**Logout:** `supabase.auth.signOut()` → redireciona para `/login`

---

### `StravaMap` + `ElevationProfile`

Renderizados apenas para trilhas pessoais com polyline salvo.

- `StravaMap`: mapa Leaflet com polyline decodificado via `@mapbox/polyline`
- `ElevationProfile`: imagem estática da URL `strava_elevation_profile` salva no Supabase; fallback com desnível e extensão em texto

---

### `AdminPanel`

Lista trilhas pendentes de aprovação com botões Aprovar / Rejeitar.

- Aprovar: `supabase.from('trilhas').update({ aprovada: true })`
- Rejeitar: `supabase.from('trilhas').delete()`

---

## Banco de dados — Supabase

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `trilhas` | Cadastro de trilhas oficiais (aprovadas pelo admin) |
| `condicoes` | Condição atual de cada trilha — upsert por `trilha_id`, uma linha por trilha |
| `condicoes_strava` | Condição de segmentos Strava pessoais — upsert por `strava_segment_id` |
| `favoritos` | Trilhas favoritas do usuário (user_id + trilha_id) |
| `profiles` | Perfil público: apelido, telefone, região, is_admin |
| `trilhas_pessoais` | Segmentos Strava vinculados pelo rider (polyline, URLs, metadados) |
| `observacoes_trilha` | Avaliações de riders com estrelas, texto e veredicto do sistema no momento |
| `strava_segmentos_config` | Sugestões automáticas de configuração geradas pelo agente |

### Colunas da tabela `condicoes`

| Coluna | Tipo | Descrição |
|---|---|---|
| `trilha_id` | uuid | FK para `trilhas` — chave de upsert |
| `gerado_em` | timestamptz | Momento da geração (automático) |
| `aderencia_status` | text | SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA |
| `aderencia_score` | numeric | Score 0–100 do modelo |
| `aderencia_futura_status` | text | Status de aderência previsto para o pior bloco de 6h |
| `aderencia_futura_label` | text | Label do bloco futuro (ex: `06h→12h`) |
| `aderencia_futura_rain` | numeric | Chuva prevista no bloco futuro (mm) |
| `veredicto` | text | DROP LIBERADO / ATENÇÃO / MELHOR ESPERAR |
| `veredicto_12h` | text | Veredicto para as próximas 12h |
| `texto_dinamico` | text | Frase contextual do veredicto (ex: "Solo encharcado — aguarde secar") |
| `previsao_24h` | jsonb | Array de 4 blocos de 6h com `label`, `rain_mm`, `pop_max`, `wind_max`, `temp_med` |
| `rain_mm` | numeric | Chuva acumulada 24h (mm) |
| `rain_12h` | numeric | Chuva acumulada 12h (mm) |
| `pico_3h` | numeric | Maior acumulado em janela deslizante de 3h (mm) |
| `acumulo_48h` | numeric | Acúmulo bruto das últimas 48h (mm) |
| `acumulo_ef` | numeric | Acúmulo efetivo (decaimento exponencial, mm) |
| `wind_ms` | numeric | Velocidade máxima de vento 24h (m/s) |
| `wind_12h` | numeric | Velocidade máxima de vento 12h (m/s) |
| `gust_max_kmh` | numeric | Rajada máxima prevista 48h (km/h) |
| `temp_max` | numeric | Temperatura máxima prevista (°C) |
| `pop_48h` | numeric | Probabilidade de chuva 48h (%) |
| `pop_12h` | numeric | Probabilidade de chuva 12h (%) |
| `janela` | text | Melhor janela para pedal (texto formatado) |
| `horarios_chuva` | text | Horários com chuva prevista (JSON serializado) |
| `frase_secagem` | text | Descrição do estado do solo gerada pelo GPT-3.5 |
| `solo_descansado` | boolean | `true` se acumulo_ef < threshold |
| `thresh_desc` | numeric | Threshold de solo descansado calculado |
| `meia_vida_h` | numeric | Meia-vida de secagem ajustada (horas) |
| `clay_pct` | numeric | Teor de argila real via OpenLandMap (%) |
| `sand_pct` | numeric | Teor de areia real via OpenLandMap (%) |
| `texture_class` | text | Classificação textural USDA (ex: Argiloso, Franco) |
| `inclinacao` | numeric | Inclinação média calculada (%) |
| `ultima_chuva_h` | numeric | Horas desde a última chuva significativa |
| `enso_fase` | text | Fase ENSO atual (El Niño / Neutro / La Niña) |
| `enso_oni` | numeric | Índice ONI da NOAA |
| `fonte` | text | Fonte meteorológica principal (OpenWeather / Open-Meteo) |
| `alerta_vento_nivel` | numeric | Nível de alerta de vento histórico (1–3) |
| `alerta_vento_kmh` | numeric | Vento sustentado máximo histórico (km/h) |
| `alerta_rajada_kmh` | numeric | Rajada máxima futura (km/h) |
| `fds_d1_veredicto` | text | Veredicto D+1 |
| `fds_d1_rain` | numeric | Chuva prevista D+1 (mm) |
| `fds_d1_wind` | numeric | Vento máximo D+1 (m/s) |
| `fds_d1_temp` | numeric | Temperatura máxima D+1 (°C) |
| `fds_d2_veredicto` | text | Veredicto D+2 |
| `fds_d2_rain` | numeric | Chuva prevista D+2 (mm) |
| `fds_d2_wind` | numeric | Vento máximo D+2 (m/s) |
| `fds_d2_temp` | numeric | Temperatura máxima D+2 (°C) |
| `fds_d3_veredicto` | text | Veredicto D+3 |
| `fds_d3_rain` | numeric | Chuva prevista D+3 (mm) |
| `fds_d3_wind` | numeric | Vento máximo D+3 (m/s) |
| `fds_d3_temp` | numeric | Temperatura máxima D+3 (°C) |

> A tabela `condicoes_strava` tem a mesma estrutura de colunas, com `strava_segment_id` como chave de upsert em vez de `trilha_id`.

---

## Agente Python — Pipeline completo

O agente `mtb-forecast.py` é executado diariamente pelo GitHub Actions e **não envia emails** — apenas grava no Supabase.

```
GitHub Actions (cron 05:00 BRT ou sexta 21:00 BRT)
        │
        ▼
Step 1 — _carregar_trilhas()
  Lê trilhas.csv (UTF-8 ou Latin-1, separador ; ou ,)
  Normaliza coordenadas e campos
        │
        ▼
Step 2 — _validar_env()
  Verifica variáveis de ambiente obrigatórias:
  • OPENWEATHER_API_KEY (única obrigatória)
  Lança EnvironmentError se ausente
        │
        ▼
Step 3 — proximos_dias()
  Calcula datas de D+1, D+2, D+3 em BRT
  Formata labels para exibição (ex: "Sáb 14/06")
        │
        ▼
Step 4 — buscar_solo_openlandmap() — por trilha
  API: openlandmap.org/api/v0.1
  Retorna: clay_pct, sand_pct, silt_pct, texture_class
  Calcula fator de absorção base: 0.20 + (clay_pct/100) × 1.60
  Limita ao intervalo [0.25, 0.90]
  Fallback: usa solo_type manual do CSV se API indisponível
        │
        ▼
Step 5 — ENSO: fetch_oni_noaa()
  Fonte: https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
  Extrai ONI do mês atual → determina fase ENSO
  Multiplicador sobre threshold de solo descansado:
    El Niño Forte (≥1.5) → ×0.75
    El Niño (≥0.5)       → ×0.85
    Neutro               → ×1.00
    La Niña (≤−0.5)      → ×1.15
    La Niña Forte (≤−1.5)→ ×1.25
        │
        ▼
Step 6 — processar_trilha() — por trilha
  ├── fetch_onecall()
  │   OpenWeather One Call 3.0 — previsão horária 48h (fonte principal 70%)
  │
  ├── fetch_onecall_historico()
  │   /timemachine em 3 offsets (−48h, −24h, 0h)
  │   Deduplicação por timestamp antes do acúmulo
  │   Cobertura completa sem janela cega na madrugada
  │
  ├── fetch_openmeteo()
  │   Open-Meteo Forecast — previsão horária 48h (fonte secundária 30%)
  │   Failsafe: usa apenas OpenWeather se Open-Meteo falhar
  │
  ├── fetch_vento_historico()
  │   Open-Meteo Archive — rajadas ERA5 das últimas 48h por coordenada
  │   Cruza com vento sustentado do timemachine → nível de alerta 1/2/3
  │
  ├── Fusão 70/30
  │   rain_mm, pico_3h, wind_ms, pop, gust_max_kmh = média ponderada OW/OM
  │
  ├── calcular_aderencia()
  │   Modelo de decaimento exponencial:
  │   acumulo_ef = Σ precip_hora × 0.5^(horas_atras / meia_vida)
  │   meia_vida ajustada por temp, vento, nebulosidade, umidade, bioma
  │   score de impacto → status SECO/GRIP PERFEITO/BOA ADERÊNCIA/BAIXA ADERÊNCIA
  │
  ├── calcular_aderencia_futura_oc()
  │   Avalia os próximos 4 blocos de 6h
  │   Retorna o pior status futuro com label (ex: "06h→12h") e rain_mm previsto
  │
  ├── calcular_blocos_24h_oc()
  │   4 blocos de 6h: label + rain_mm + pop_max + wind_max + temp_med
  │   Alimenta a seção "Previsão 24h" do web app
  │
  ├── veredicto()
  │   Acúmulo de pontos de risco (aderência + chuva + vento + inclinação + ENSO)
  │   Calcula texto_dinamico contextual
  │   Retorna DROP LIBERADO / ATENÇÃO / MELHOR ESPERAR
  │
  ├── calcular_janela_oc()
  │   Maior bloco contínuo com pop < 30%, precip < 1mm/h, vento < 15m/s
  │
  ├── calcular_horarios_chuva_oc()
  │   Blocos com precip ≥ 1mm/h ou pop ≥ 40%
  │   Separados quando gap > 3h
  │
  ├── resumo_dia_oc() × 3
  │   D+1: One Call 3.0 (horário)
  │   D+2: One Call 3.0 (horário)
  │   D+3: fallback Open-Meteo quando OC não cobre
  │   Cada dia: rain, pop, temp_max, wind, veredicto, debug_model
  │
  └── gerar_analise_secagem_gpt() (GPT-3.5, opcional)
      Frase descritiva do estado do solo com ground truth de aderência
      Fallback local se OPENAI_API_KEY ausente ou API falhar
        │
        ▼
Step 7 — gravar_supabase() — por trilha
  POST /rest/v1/condicoes?on_conflict=trilha_id
  Prefer: return=minimal,resolution=merge-duplicates
  Grava todos os campos da tabela condicoes (ver schema acima)
  Falha silenciosa — nunca interrompe o fluxo principal
        │
        ▼
Step 8 — processar_segmentos_strava()
  Busca strava_segmentos_config no Supabase (segmentos únicos)
  Para cada segmento: executa o mesmo pipeline meteorológico
  Grava em condicoes_strava?on_conflict=strava_segment_id
        │
        ▼
Step 9 — Log e artefato
  Saída completa via tee → debug_YYYY-MM-DD.log
  Artefato enviado para GitHub Actions (retention: 30 dias)
  Mensagem: "[MTB] Envio de email desativado — dados gravados no Supabase."
```

---

## GitHub Actions — Workflow

Arquivo: [.github/workflows/mtb-forecast-workflow.yml](.github/workflows/mtb-forecast-workflow.yml)

### Gatilhos

```yaml
on:
  schedule:
    - cron: "0 8 * * *"    # 05:00 BRT todos os dias
    - cron: "0 0 * * 6"    # Sexta às 21:00 BRT (sábado 00:00 UTC)
  workflow_dispatch:         # execução manual via UI do GitHub
```

### Steps do job

**Step 1 — `actions/checkout@v4`**
Faz checkout do repositório no runner `ubuntu-latest`.

**Step 2 — `actions/setup-python@v5`**
Instala Python 3.11. Nenhum `pip install` necessário — o agente usa apenas a biblioteca padrão.

**Step 3 — Run Agent MTB Forecast**
```bash
python mtb-forecast.py 2>&1 | tee debug_$(date +%Y-%m-%d).log
```
- `2>&1` redireciona stderr para stdout
- `tee` grava o output no arquivo de log E exibe no terminal (visível nos logs do GitHub Actions)
- Nome do arquivo: `debug_2025-06-14.log` (data UTC do runner)

**Step 4 — Upload debug log**
```yaml
if: always()
uses: actions/upload-artifact@v4
with:
  name: debug-log-${{ github.run_id }}
  path: debug_*.log
  retention-days: 30
```
- `if: always()` — o log é salvo mesmo se o script falhar (essencial para diagnóstico)
- Nome único por `run_id` evita colisões
- Retido por 30 dias, disponível em **Actions → selecionar run → Artifacts**

### Variáveis de ambiente

| Secret | Obrigatório | Uso |
|---|---|---|
| `OPENWEATHER_API_KEY` | ✅ Sim | One Call 3.0 (previsão + timemachine) |
| `ANTHROPIC_API_KEY` | ⚠️ Recomendado | Análise textual por região (Claude AI) |
| `OPENAI_API_KEY` | ➕ Opcional | Frases de secagem GPT-3.5; fallback local se ausente |
| `SUPABASE_SERVICE_KEY` | ✅ Sim | Gravação no Supabase (role service) |
| `SUPABASE_URL` | ➕ Opcional | URL do projeto Supabase; usa fallback hardcoded se ausente |

> Para executar manualmente: **GitHub → Actions → Agent MTB Forecast → Run workflow**

---

## Configuração — Secrets

### GitHub Actions

Vá em **Settings → Secrets and variables → Actions → New repository secret**:

```
OPENWEATHER_API_KEY   → chave OpenWeatherMap One Call 3.0
ANTHROPIC_API_KEY     → chave Anthropic Console (claude-sonnet-4-5)
OPENAI_API_KEY        → chave OpenAI (gpt-3.5-turbo)
SUPABASE_SERVICE_KEY  → service_role key do projeto Supabase
SUPABASE_URL          → https://[projeto].supabase.co (opcional — tem fallback)
```

### Next.js (web app local)

Crie `.env.local` na raiz do projeto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[projeto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

> O web app usa apenas a **anon key** (autenticação via Row Level Security do Supabase). A `service_role key` é usada exclusivamente pelo agente Python.

---

## Desenvolvimento local

### Pré-requisitos

- Node.js 18+
- npm ou pnpm
- Conta no [Supabase](https://supabase.com) com projeto criado

### Instalação

```bash
# 1. Clonar o repositório
git clone https://github.com/mtb-forecast/mtb-forecast-app.git
cd mtb-forecast-app

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env.local
# editar .env.local com suas chaves Supabase

# 4. Rodar em desenvolvimento
npm run dev
```

O app estará disponível em `http://localhost:3000`.

### Rodar o agente localmente

```bash
# Exportar variáveis de ambiente necessárias
export OPENWEATHER_API_KEY=sua_chave
export SUPABASE_SERVICE_KEY=sua_service_key
export ANTHROPIC_API_KEY=sua_chave   # opcional
export OPENAI_API_KEY=sua_chave      # opcional

# Executar
python mtb-forecast.py
```

O agente não tem dependências externas — usa apenas Python 3.11+ stdlib.

---

## Como adicionar trilhas

As trilhas são carregadas de `trilhas.csv` na raiz do repositório.

### Formato do CSV

```csv
name;lat;lon;solo_type;exposicao;altitude_m;trail_type;desnivel_m;extensao_km;regiao;bioma
ZigZag - Campos do Jordao - SP;-22.768683;-45.614767;preto;fechada;1630;natural;480;32;SP;Mata Atlântica
DH Heineken short - Itabirito - MG;-20.224394;-43.971293;ferro;aberta;1445;bikepark;93;0.40;MG;
```

- Separador `;` ou `,` (detectado automaticamente)
- Encoding UTF-8 ou Latin-1 (detectado automaticamente)
- Coordenadas no formato decimal — obtenha clicando com botão direito no Google Maps

**Nome sugerido:** `"Trilha Principal - Cidade - UF"` — aparece no card do email e no web app.

Após adicionar ao CSV e fazer commit, o agente processará a trilha na próxima execução e precisará ser aprovada no painel de admin do web app para aparecer na listagem pública.

---

## Campos da trilha (CSV)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | ✅ | Nome da trilha |
| `lat` | float | ✅ | Latitude decimal (negativo para sul) |
| `lon` | float | ✅ | Longitude decimal (negativo para oeste) |
| `solo_type` | string | ✅ | Tipo de solo — ver tabela abaixo |
| `exposicao` | string | ✅ | `"aberta"` ou `"fechada"` |
| `altitude_m` | int | ✅ | Altitude média em metros |
| `trail_type` | string | ✅ | `"natural"` ou `"bikepark"` |
| `regiao` | string | ✅ | Sigla: SP / MG / RJ / PR / SC / RS / outros |
| `desnivel_m` | float | ➕ | Desnível total em metros |
| `extensao_km` | float | ➕ | Extensão total em km (com desnivel_m calcula inclinação) |
| `bioma` | string | ➕ | Ex: `"Mata Atlântica"` — ativa ajuste de microclima |

### Valores de `solo_type`

Fallback quando OpenLandMap não retorna `clay_pct`. Com dado real, o fator é calculado diretamente da argila.

| Valor | Fator base | Meia-vida (aberta / fechada) | Quando usar |
|---|---|---|---|
| `"terra"` | 0.80 | 24h / 36h | Terra batida, barro, trilhas de mata |
| `"misto"` | 0.55 | 18h / 28h | Combinação de terra e pedra |
| `"misto_mg"` | 0.45 | 12h / 18h | Misto com minério — Quadrilátero Ferrífero |
| `"preto"` | 0.60 | 14h / 24h | Serapilheira sobre Cambissolos/quartzitos |
| `"pedra"` | 0.25 | 6h / 10h | Trilhas predominantemente rochosas |
| `"ferro"` | 0.30 | 8h / 14h | Solo ferruginoso — Quadrilátero Ferrífero |

> `"ferro"` e `"misto_mg"` exibem automaticamente o badge **⛏ Quadrilátero Ferrífero**.

### Valores de `exposicao`

| Valor | Efeito | Quando usar |
|---|---|---|
| `"fechada"` | Meia-vida maior (embutida na tabela) | Mata atlântica densa, sombra, pouca ventilação |
| `"aberta"` | Meia-vida menor | Campos, chapadas, cristas, bike parks sem cobertura |

> Threshold de alerta de rajada: ≥ 30 km/h (aberta) · ≥ 50 km/h (fechada)

### Valores de `trail_type`

| Valor | Ajuste no modelo |
|---|---|
| `"natural"` | Sem ajuste — risco por inclinação aplicado integralmente |
| `"bikepark"` | Fator absorção −0.20 (aberta) ou −0.10 (fechada) · score ×0.90 · −1 ponto de risco |

---

## Lógica de análise do solo

### 1. Solo real via OpenLandMap

```python
# Fator de absorção base derivado de argila real
base = 0.20 + (clay_pct / 100) × 1.60
base = max(0.25, min(0.90, base))
# clay 10% → 0.36 | clay 40% → 0.84 | clay 70% → 1.12 (limitado a 0.90)
```

### 2. Modelo de secagem — decaimento exponencial

```python
acumulo_ef = Σ precip_hora × 0.5 ^ (horas_atras / meia_vida)
```

A meia-vida base (por `solo_type × exposicao`) é ajustada dinamicamente:

| Fator | Condição | Efeito |
|---|---|---|
| Temperatura | ≥ 30°C | ×0.78 |
| Temperatura | ≥ 26°C | ×0.86 |
| Temperatura | ≤ 16°C | ×1.12 |
| Temperatura | ≤ 10°C | ×1.22 |
| Vento | ≥ 6 m/s | ×0.84 |
| Vento | ≥ 3 m/s | ×0.92 |
| Vento | ≤ 1 m/s | ×1.05 |
| Nebulosidade | ≥ 90% | ×1.12 |
| Nebulosidade | ≥ 70% | ×1.06 |
| Nebulosidade | ≤ 25% | ×0.94 |
| Umidade rel. | ≥ 95% | ×1.15 |
| Umidade rel. | ≥ 85% | ×1.08 |
| Umidade rel. | ≤ 45% | ×0.93 |
| Mata Atlântica | alt ≥ 600m + fechada | ×1.20 |
| Mata Atlântica | demais | ×1.10 |

> Meia-vida final limitada ao intervalo `[4h, 72h]`.

### 3. Cálculo de aderência

```python
# Solo descansado (acumulo_ef < threshold)
impacto = pico_3h × 0.7   se pico_3h ≥ 10mm
impacto = rain_mm × 0.6   se pico_3h < 10mm

# Solo já úmido (acumulo_ef ≥ threshold)
impacto = pico_3h × 1.0               se pico_3h ≥ 10mm
impacto = rain_mm + acumulo_ef × 0.3  se pico_3h < 10mm

impacto × fator_absorcao × mult_bikepark (×0.90 se bikepark)
score = max(0, min(100, impacto × 10))
```

| Score | Status | Emoji |
|---|---|---|
| < 10 | SECO | 🟡 |
| 10–35 | GRIP PERFEITO | 🟢 |
| 35–70 | BOA ADERÊNCIA | 🟠 |
| ≥ 70 | BAIXA ADERÊNCIA | 🔴 |

---

## Cálculo de veredicto

Pontos de risco acumulados:

| Condição | Pontos |
|---|---|
| BAIXA ADERÊNCIA | +3 |
| BOA ADERÊNCIA | +2 |
| GRIP PERFEITO | +1 |
| pico_3h ≥ 15mm | +2 |
| pico_3h ≥ 10mm | +1 |
| rain_mm ≥ 8mm | +1 |
| wind_ms ≥ 12 m/s | +1 |
| Inclinação > 30% (com umidade) | +2 |
| Inclinação > 20% (com umidade) | +1 |
| Natural inclinado + chuva + aderência ≤ BOA | +1 |
| Bikepark | −1 |
| Bikepark saturado | +2 |
| Vento histórico nível 3 (>90 km/h) | +2 |
| Vento histórico nível 2 (65–90 km/h) | +1 |
| Vento histórico nível 2 + solo encharcado | +1 adicional |
| Vento histórico nível 1 (55–65 km/h) + encharcado | +1 |
| Rajada prevista ≥ 30 km/h (aberta) | risco mínimo = 2 |
| Rajada prevista ≥ 50 km/h (fechada) | risco mínimo = 2 |
| Aderência futura pior (BAIXA, +2 graus) | +2 |
| Aderência futura pior (+1 grau) | +1 |
| Aderência futura melhor | −1 |

| Total | Veredicto |
|---|---|
| ≤ 1 | ✅ DROP LIBERADO |
| 2–3 | ⚠️ ATENÇÃO |
| ≥ 4 | 🛑 MELHOR ESPERAR |

### Ranking no web app

Ordenado pelo **veredicto 12h**, desempate por status de aderência:
```
DROP LIBERADO → ATENÇÃO → MELHOR ESPERAR
SECO → GRIP PERFEITO → BOA ADERÊNCIA → BAIXA ADERÊNCIA
```

---

## APIs utilizadas

| API | Uso | Requer cadastro |
|---|---|---|
| [OpenWeather One Call 3.0](https://openweathermap.org/api/one-call-3) | Previsão horária 48h + timemachine 3× por trilha | Sim (chave gratuita pós-cadastro) |
| [Open-Meteo Forecast](https://open-meteo.com) | Previsão horária 30% + rajada futura | Não |
| [Open-Meteo Archive](https://open-meteo.com/en/docs/historical-weather-api) | Rajadas históricas ERA5 últimas 48h | Não |
| [OpenLandMap](https://openlandmap.org) | Composição real do solo (clay%, sand%, texture) | Não |
| [NOAA CPC](https://www.cpc.ncep.noaa.gov) | Índice ONI para classificação ENSO | Não |
| [Anthropic Claude](https://console.anthropic.com) | Análise textual por região | Sim (créditos) |
| [OpenAI GPT-3.5](https://platform.openai.com) | Frases de secagem por trilha | Sim (créditos) |
| [Supabase](https://supabase.com) | Banco de dados + autenticação do web app | Sim (plano gratuito disponível) |

---

## Dependências

### Web App

```json
"next": "14.x",
"react": "18.x",
"@supabase/auth-helpers-nextjs": "latest",
"@supabase/supabase-js": "latest",
"leaflet": "latest",
"@mapbox/polyline": "latest",
"tailwindcss": "3.x"
```

### Agente Python

Apenas stdlib do Python 3.11 — **nenhum `pip install` necessário**:

`os`, `json`, `html`, `urllib.request`, `urllib.error`, `datetime`, `csv`, `pathlib`, `time`, `struct`, `zlib`

---

## Notas de versão

### V7.7 — atual (Web App)
- **Envio de email desativado** — agente grava exclusivamente no Supabase
- `_validar_env()` exige apenas `OPENWEATHER_API_KEY`
- Workflow limpo: sem vars de email, com `OPENAI_API_KEY` e `SUPABASE_URL`
- Rodapé do HTML atualizado para `MTB Agent V7.7 — Web App`

### V7.6
- **Sync web app ↔ email**: página `/trilhas/[id]` espelha exatamente o card do email
- Aderência futura com label de bloco (ex: `06h→12h`) e chuva prevista
- Previsão 24h em 4 blocos de 6h substituindo linhas 12h/24h
- `texto_dinamico` exibido após o veredicto
- D+1/D+2/D+3 com vento e temperatura além da chuva
- Clay/sand inline nas características do cabeçalho
- `gravar_supabase` grava 11 novos campos em `condicoes` e `condicoes_strava`

### V7.5 — Strava única + sugestão admin
- Segmentos Strava processados como entidade única (não por usuário)
- `strava_segmentos_config`: sugestões de configuração geradas pelo agente
- Painel admin com comparação rider vs. sugestão agente

### V7.1
- Alertas de rajadas futuras por exposição (`_alerta_rajada_futura_html`)
- Threshold diferenciado: ≥ 30 km/h (aberta) · ≥ 50 km/h (fechada)
- Seção "⚠️ Alertas" agrupa rajada futura + vento histórico

### V7.0
- Refatoração interna — logs e prints padronizados
- Sistema de alertas de vento preparado para múltiplos tipos por card

### V6.5
- `trail_drainage` removido — drenagem capturada por `solo_type`, `exposicao`, `trail_type` e `inclinacao`
- Correção: bloco `DEBUG_MODEL` fora do `except`

### V5.24
- Campo `bioma` lido do CSV (coluna opcional)
- `fator_microclima()`: threshold conservador para Mata Atlântica

### V5.23
- One Call API 3.0 substitui `/data/2.5/forecast` como fonte principal
- Três chamadas `/timemachine` por trilha — sem janela cega
- Média ponderada 70% OpenWeather / 30% Open-Meteo

### V5.22
- Sazonalidade: thresholds derivados de ERA5-Land por região (SP / MG)
- ENSO: multiplicador sobre threshold sazonal via ONI NOAA

### V5.21
- Modelo de secagem por decaimento exponencial
- Meia-vida ajustada dinamicamente por temperatura, vento, nebulosidade, umidade

---

*MTB Forecast V7.7 · Criado por Guilherme Leal e Douglas Santos · 🚵 Saiba antes de pedalar*
