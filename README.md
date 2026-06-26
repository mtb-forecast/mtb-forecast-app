# MTB Forecaster — Web App + Agente Python

Plataforma completa de monitoramento climático para **trilhas MTB (DH, Enduro, XCC e XCM) e pump tracks** no Brasil.

Composta por dois sistemas integrados:

- **Web App** — Next.js 14 App Router com autenticação (e-mail + Google OAuth via `@supabase/ssr`), favoritos, avaliações de riders, integração Strava, cadastro manual de trilhas e pump tracks, notificações por Telegram, compartilhamento por WhatsApp e PWA
- **Agente Python** — executa via GitHub Actions com schedule diferenciado por dia da semana (Seg–Qui: 7h · Sex/Sáb: 7h, 13h e 21h · Dom: 7h e 13h BRT), coleta dados de 2 fontes meteorológicas em batch, modela condição do solo com 15+ tabelas de configuração no Supabase e grava resultados no banco. Pump tracks processam apenas previsão (sem modelo de solo)

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
- [Web App — API Routes](#web-app--api-routes)
- [Web App — Componentes](#web-app--componentes)
- [PWA — Progressive Web App](#pwa--progressive-web-app)
- [Integração Strava](#integração-strava)
- [Integração Telegram](#integração-telegram)
- [Banco de dados — Supabase](#banco-de-dados--supabase)
- [Agente Python — Pipeline completo](#agente-python--pipeline-completo)
- [Modelo de solo e aderência](#modelo-de-solo-e-aderência)
- [Cálculo de veredicto](#cálculo-de-veredicto)
- [GitHub Actions — Workflows](#github-actions--workflows)
- [Configuração — Secrets e variáveis de ambiente](#configuração--secrets-e-variáveis-de-ambiente)
- [Desenvolvimento local](#desenvolvimento-local)
- [Como adicionar trilhas](#como-adicionar-trilhas)
- [Campos da trilha](#campos-da-trilha)
- [APIs utilizadas](#apis-utilizadas)
- [Dependências](#dependências)
- [Notas de versão](#notas-de-versão)

---

## Visão geral da arquitetura

```
┌──────────────────────────────────────────────────────────────────────────┐
│    GitHub Actions (schedule por dia da semana + dispatch manual)          │
│                                                                            │
│  OpenWeather One Call 3.0 ──┐                                             │
│  Open-Meteo Forecast BATCH  ├──► mtb-forecast.py ──────────► Supabase    │
│  Open-Meteo Archive BATCH   ─┘       Agente Python                        │
│  NOAA ONI (ENSO)            ──────────────────────────────────►           │
│  Anthropic Claude AI        ──────────────────────────────────►           │
│                                                                            │
│  OM: 2 chamadas batch (forecast + histórico) cobrem 133 trilhas/23 grupos │
│  OWM: ~46 day_summary + ~23 onecall forecast ≈ 69 chamadas/execução       │
│                                                                            │
│  15+ tabelas de config lidas do Supabase na inicialização:                │
│  enso_config · enso_regional_mult · aderencia_thresholds                  │
│  veredicto_pesos · veredicto_limiares · meia_vida_clima_mult              │
│  biomas · configuracoes_sistema · solo_type_config                        │
│  inclinacao_config · aderencia_descricoes · threshold_sazonal             │
│  meia_vida_secagem · tabela_solo · trail_type_config                      │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Supabase (PostgreSQL + Auth + Storage + RLS)            │
│                                                                            │
│  DADOS OPERACIONAIS                                                        │
│  trilhas · condicoes · condicoes_strava                                    │
│  favoritos · profiles · trilhas_pessoais                                   │
│  observacoes_trilha · strava_segmentos_config                              │
│  trilhas_pendentes · localidades · admin_aprovacoes                       │
│  mantenedores                                                              │
│                                                                            │
│  PUMP TRACKS                                                               │
│  trilhas_pumptrack · condicoes_pumptrack                                   │
│  fotos_pumptrack · observacoes_pumptrack                                   │
│                                                                            │
│  TABELAS DE CONFIGURAÇÃO DO MODELO (15+)                                   │
│  enso_config · enso_regional_mult · aderencia_thresholds                  │
│  veredicto_risco_pesos · meia_vida_clima_mult · biomas                    │
│  configuracoes_sistema · solo_type_config · inclinacao_config             │
│  score_config · aderencia_descricoes · threshold_sazonal                  │
│  meia_vida_secagem · tabela_solo · trail_type_config                      │
│  microclima_config (mantida no BD, supersedida por biomas)                │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      Web App (Next.js 14 App Router)                       │
│                                                                            │
│  /                        Landing page pública                             │
│  /login                   E-mail + Google OAuth                           │
│  /cadastro                Cadastro completo + Google OAuth                │
│  /dashboard               Favoritas + Strava pessoais + banner pump track │
│  /trilhas                 Trilhas MTB + pump tracks por estado/cidade     │
│  /trilhas/[id]            Detalhe: condição + avaliações + compartilhar   │
│  /trilhas/cadastrar       Formulário dual: Trilha MTB ou Pump Track       │
│  /pump-track/[id]         Detalhe pump track: previsão + fotos + reviews  │
│  /mapa                    Mapa Leaflet: pins trilhas + pins roxo "P" pump │
│  /t/[id]                  Preview público (sem login) para WhatsApp       │
│  /perfil                  Dados pessoais + foto de perfil + Telegram      │
│  /perfil/strava           Gerenciamento de segmentos Strava               │
│  /planos                  Planos de assinatura (Stripe)                   │
│  /admin                   Aprovações de trilhas + sugestões Strava        │
│  /admin/tabelas           Edição das tabelas mestras (dupla aprovação)    │
│  /mantenedores/[id]       Página pública do mantenedor + trilhas          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Middleware de autenticação

`middleware.ts` protege todas as rotas autenticadas usando `createServerClient` do `@supabase/ssr` com leitura/escrita de cookies via `getAll`/`setAll`. Chama `supabase.auth.getUser()` (verificação JWT no servidor, não apenas leitura de cookie).

**Rotas públicas** (sem autenticação):
```
/login · /cadastro · /auth/callback · /t/ · /api/telegram/ · /planos
/manifest.json · /sw.js · /icons/ · /mantenedores/
```

**Matcher:** exclui automaticamente `_next/static`, `_next/image`, `favicon.ico`, `manifest.json`, `sw.js` e `icons`.

Qualquer outra rota redireciona para `/login` se não houver sessão ativa.

---

## Web App — Páginas e rotas

### `/` — Landing page

Página pública de apresentação. Não requer autenticação.

**Seções:**
1. **Hero split-screen** — painel preto com CTA "Criar conta grátis" + painel com imagem de trilha e cards mockup de condições
2. **Faixa amarela** com ticker de stats (trilhas, chuva 48h, meia-vida, atualização)
3. **Seção Strava** (fundo `#111`, stripe laranja) — integração com Strava, 2 colunas: texto + cards mockup
4. **Como funciona** — 3 cards: Chuva acumulada · Tipo de solo · Janela de pedal
5. **CTA final** — link para `/cadastro`

**Design system:** preto `#111` + amarelo `#FFE000` + stripe amarela 3px + fundo `#f7f7f5` + cards brancos + font `WheatSmile` para títulos.

---

### `/login` — Autenticação

Formulário de login com suporte a **e-mail/senha** e **Google OAuth**.

**Fluxo e-mail:**
1. `supabase.auth.signInWithPassword({ email, password })`
2. Erro inline; sucesso redireciona para `/dashboard`

**Fluxo Google OAuth:**
1. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })`
2. Supabase redireciona para Google → usuário autentica → retorna para `/auth/callback`
3. `/auth/callback` é uma página client-side: chama `getSession()` (o `detectSessionInUrl` do `@supabase/ssr` já processou o code automaticamente) e redireciona para `/dashboard`. Fallback: `onAuthStateChange` com timeout de 10s → `/login?error=auth_failed`

---

### `/cadastro` — Cadastro de conta

Formulário com validação inline, máscara de telefone e suporte a Google OAuth.
Implementado com `Suspense` boundary para suportar `useSearchParams()`.

**Campos obrigatórios:**

| Campo | Validação |
|---|---|
| Nome completo | mínimo 3 caracteres |
| Apelido | mínimo 2 caracteres — exibido no app e avaliações |
| E-mail | formato válido |
| Senha | mínimo 6 caracteres |
| Telefone / WhatsApp | máscara `+55 (XX) XXXXX-XXXX`, mínimo 10 dígitos |
| Região | select com 27 estados + DF (`ESTADOS_BRASIL`) |

**Campo opcional:** Telegram (prefixo `@` automático)

**Steps internos:**
1. `validate()` — retorna objeto `Errors` com todos os campos inválidos
2. Botão desabilitado (`opacity: 0.5`) até formulário válido após primeiro submit
3. `supabase.auth.signUp({ email, password, options: { data: { nome, apelido, regiao, telegram_username } } })`
4. `supabase.from('profiles').upsert({ id, email, nome, apelido, telefone, telegram_username, regiao, is_admin: false })`
5. `localStorage.setItem('show-pwa-prompt', 'true')` — aciona prompt de instalação PWA
6. Redireciona para `/login` após 3 segundos

**Redirect via WhatsApp:** quando URL contém `?ref=whatsapp&trilha=[id]`, redireciona para `/login?redirect=/trilhas/[id]` após cadastro.

---

### `/dashboard` — Dashboard principal

Página autenticada. Mostra apenas trilhas pessoais do usuário.

**Steps de carregamento:**
1. `supabase.auth.getUser()` — redireciona para `/login` se não autenticado
2. `supabase.from('profiles').select('*')` — apelido, nome, região
3. `supabase.from('favoritos').select('trilha_id')` — IDs favoritos
4. Para cada favorito: `supabase.from('trilhas').select('*, condicoes(*)')` com condição mais recente
5. `supabase.from('trilhas_pessoais').select('*')` — segmentos Strava do usuário
6. Para cada trilha pessoal: `supabase.from('condicoes_strava').select(...)` — condição mais recente

**Seções:**
- **Banner de perfil incompleto** — quando `nome`, `apelido`, `telefone` ou `regiao` ausentes; link para `/perfil`
- **Minhas trilhas favoritas** — grid de `TrilhaCard`; link "Ver todas em [estado]" → `/trilhas`
- **Minhas trilhas Strava** — cards com borda laranja `#FC4C02`

**Saudação:** usa `apelido` → `nome.split(' ')[0]` → `email.split('@')[0]`

---

### `/trilhas` — Listagem de trilhas

Listagem autenticada com filtro obrigatório por estado.
Implementada com `Suspense` boundary (`TrilhasContent` + `TrilhasPage`) para `useSearchParams()`.
Estado selecionado persistido na URL: `/trilhas?estado=SP`.

**Com estado selecionado:**
1. `supabase.from('trilhas').select('*, condicoes(*), localidades(cidade, estado, localidade), mantenedores(*)')` com `aprovada = true`
2. Filtro client-side: `localidades.estado === estadoSelecionado` com fallback para `trilha.regiao`
3. `supabase.from('favoritos').select('trilha_id')` — prepopula Set de favoritos
4. Busca local por nome
5. **Ranking** por veredicto 12h (`DROP LIBERADO` → `DROP LIBERADO - Veja os alertas` → `MELHOR ESPERAR` → sem dados) com desempate por `aderencia_score` ASC

**Select "Mantenedores / Bike Park":** navega para `/mantenedores/[id]` quando a trilha tem mantenedor cadastrado.

---

### `/trilhas/[id]` — Detalhe da trilha

Página completa da condição da trilha, espelhando o card do e-mail do agente.

**Seções exibidas:**

| Seção | Dados |
|---|---|
| Cabeçalho preto | nome, trail_type, região, bioma, desnível, extensão, inclinação colorida, texture/clay/sand, badges Quadrilátero, LogoMantenedor |
| Aderência + veredicto | ADERÊNCIA ATUAL · ADERÊNCIA FUTURA [label] · veredicto + texto_dinamico |
| Mapa | iframe Google Maps satélite (ou StravaMap + ElevationProfile para Strava pessoal) |
| Condição do Solo | frase de secagem + chuva 48h bruto/efetivo + solo descansado/úmido + última chuva + meia-vida |
| Previsão 24h | 4 blocos de 6h com mm / % / m/s / °C |
| Pico 3h | só quando ≥ 5mm |
| Janela limpa | melhor janela calculada pelo agente |
| Alertas | rajada futura · vento histórico |
| Avaliações dos riders | timeline vertical com picker de condição (seco/grip/boa/baixa/lama), estrelas de experiência e texto 150 chars |
| Próximos 3 dias | 3 cards D+1/D+2/D+3 com emoji + veredicto + chuva/vento/temp |
| Fontes | OpenWeather / ENSO (ONI NOAA) / vento ERA5 |

---

### `/mantenedores/[id]` — Página pública do mantenedor

Página pública (sem autenticação) com informações do mantenedor e suas trilhas.

**Seções:**
- **Hero** — logo (se preenchido, exibido com `<img>` nativo à esquerda do nome), nome com cores dinâmicas (`cor_primaria`/`cor_secundaria`), link `↗ site_url` (se preenchido)
- **Grid de TrilhaCards** — todas as trilhas vinculadas ao mantenedor com condição atual

**Regras do `LogoMantenedor`:**
- `contexto='card'`: pill escuro `#1e2018` com `nome_primario + nome_secundario`
- `contexto='pagina'`: sem pill, sobre header escuro, com link `↗ site_url`
- `logo_url`: renderizado com `<img>` nativo — NUNCA `next/image` (domínio Supabase fora de `remotePatterns`)
- Mantenedor sempre opcional — `null` nunca quebra card ou página

---

### `/t/[id]` — Preview público (sem login)

Página acessível **sem autenticação** para compartilhamento via WhatsApp.

**Layout:**
- Navbar simplificada: logo + botão "Criar conta grátis"
- Header preto com nome, badges (tipo, região, bioma, Quadrilátero) e dados físicos
- Google Maps embed
- **Seção bloqueada:** ícone de cadeado + CTA "Criar conta grátis" → `/cadastro?ref=whatsapp&trilha=[id]`

---

### `/perfil` — Perfil do usuário

Formulário de edição de dados pessoais com 3 estados de salvamento (`idle` / `success` / `error`). Formulário único inline (sem bottom sheets).

**Campos editáveis:** nome, apelido, e-mail (read-only), telefone (máscara), checkbox WhatsApp, Telegram (prefixo `@` automático), região.

**Seção "Trilhas que cadastrei":** busca `trilhas_pendentes` do usuário com badges de 3 estados: `pendente` / `aprovada` / `rejeitada` (com `motivo_rejeicao` inline).

**Seção "Notificações por Email":** 3 toggles com auto-save:
- **Receber emails** — ativa/desativa todos os emails (`receber_email`)
- **Trilhas favoritas** — inclui condição das trilhas favoritadas (`email_trilhas_favoritas`)
- **Trilhas do Strava** — inclui condição dos segmentos Strava (`email_trilhas_strava`)

**Seção Telegram:** exibe status de conexão (`telegram_ativo`). Instruções para ativar notificações via bot.

**Seção Strava:**
- Se `trilhasPessoais.length > 0`: link para `/perfil/strava` + botão "Desconectar Strava"
- Caso contrário: botão "Conectar com Strava" → `/api/strava/auth`

---

### `/admin` — Painel administrativo

Rota protegida: verifica `is_admin` no banco + redireciona para `/dashboard` se falso.

**1. Trilhas pendentes (`AdminPanel`):**
- Busca `trilhas_pendentes` onde `status = 'pendente'`
- **Aprovar:** geocodifica lat/lon via Nominatim → salva `localidade_id`. **Fallback:** se geocoding falhar, cria localidade mínima usando o campo `regiao` da trilha → insert em `trilhas` com `aprovada = true`
- **Rejeitar:** modal com textarea de motivo → update `status = 'rejeitada', motivo_rejeicao`

**2. Sugestões Strava:**
- Cards comparativos: config atual vs. sugestão do agente
- Campos: solo_type · exposicao · trail_type · bioma

---

### `/admin/tabelas` — Tabelas Mestras

Painel de edição das tabelas mestras do modelo. **Todas as alterações requerem aprovação do outro admin** (fluxo dual-admin via `admin_aprovacoes`).

| Tab | Tabela Supabase | Campos editáveis |
|---|---|---|
| Solo | `tabela_solo` | clay_pct, sand_pct, texture_class |
| Thresholds Sazonais | `threshold_sazonal` | threshold_descansado, threshold_saturado |
| Meia-vida de Secagem | `meia_vida_secagem` | meia_vida_h |
| Biomas | `biomas` | chuva_penetracao, vento_penetracao, sol_penetracao, tolerancia_bioma, sazonalidade |
| Trail Type | `trail_type_config` | meia_vida_mult, score_mult |

---

## Web App — API Routes

### `GET /api/strava/auth`
Inicia o fluxo OAuth do Strava. Monta o `redirect_uri` dinamicamente a partir dos headers `x-forwarded-host`/`host` da requisição e redireciona para `strava.com/oauth/authorize`.

### `GET /api/strava/callback`
Callback OAuth do Strava (usuário).
1. Troca `code` por `access_token`
2. Busca segmentos favoritos starred (`/api/v3/segments/starred?per_page=50`)
3. Filtra (kom_rank != null OU distance > 500m), limita a 15
4. Seta cookie `strava_token` (httpOnly, 1h) e redireciona para `/perfil/strava?segments=[JSON]`

### `GET /api/strava/segments`
Busca metadados de um segmento Strava individual por `?id=[segment_id]`.

### `POST /api/strava/disconnect`
Remove cookies `strava_access_token` e `strava_refresh_token`.

### `GET /auth/callback` (página client-side)
Callback Google OAuth. O `detectSessionInUrl` do `@supabase/ssr` processa o `?code=` automaticamente. A página chama `getSession()` e redireciona para `/dashboard`. Fallback: `onAuthStateChange` com timeout 10s → `/login?error=auth_failed`.

### `POST /api/admin/upload-logo`
Upload de logo de mantenedor.
1. Recebe `multipart/form-data` com o arquivo de imagem
2. Valida tipo (jpeg/png/webp) e tamanho
3. Canvas comprime para WebP no frontend antes do envio
4. Upload via service role para bucket `logos` no Supabase Storage
5. Retorna `logo_url` pública

### `POST /api/openlandmap`
Proxy interno para consultas de composição de solo (rota mantida por compatibilidade — sem chamadas externas reais).

---

## Web App — Componentes

### `TrilhaCard`
Card de trilha usado em `/trilhas` e `/dashboard`.

**Exibe:** nome, região, bioma, trail_type, veredicto (borda colorida esquerda), aderência, chuva 48h, pico 3h, vento, frase de secagem, janela limpa, botão estrela de favorito, `LogoMantenedor` (quando `mantenedor_id` preenchido).

**Cor da borda (prioridade EVITAR > ALERTA > LIBERADO, case-insensitive):**
- `MELHOR ESPERAR` → vermelho
- Contém `ALERTA` → amarelo
- `DROP LIBERADO` → verde
- Sem condição → cinza `#e5e5e5`

A função `topBarColor()` e `verdictStyle()` aplicam prioridade correta: EVITAR supera ALERTA que supera LIBERADO.

---

### `CondicaoCard`
Card detalhado de condição de uma trilha. Usado na página `/trilhas/[id]`.

**Regras de badge:**
- `badgeSolo` retorna `null` para `GRIP PERFEITO` (badge oculto quando grip) — exibe "Solo seco" apenas quando `aderencia_status === 'SECO'` ou `acumuloAgora < 0.3mm`
- `isAlertaVeredicto` usa `.toUpperCase().includes('ALERTA')` (não comparação exata) para detectar veredicto de atenção

---

### `LogoMantenedor`
Exibe o mantenedor de uma trilha com cores dinâmicas.

- **`contexto='card'`**: pill escuro `#1e2018`, `nome_primario` + `nome_secundario` em cores dinâmicas
- **`contexto='pagina'`**: sem pill, sobre header escuro, com link `↗ site_url`
- `logo_url`: renderizado com `<img>` nativo — NUNCA usar `next/image`
- Se `logo_url` for `null`, apenas o nome é exibido (sem elemento gráfico)
- Mantenedor sempre opcional — componente aceita `null` sem quebrar

---

### `TrailObservations`
Timeline vertical de avaliações de riders.

**Gate:** usuário precisa ter favoritado a trilha para publicar.

**Publicar:** `supabase.from('observacoes_trilha').insert({ trilha_id, user_id, condicao_encontrada, estrelas, texto, veredicto_sistema })` — registra a condição objetiva e o veredicto do sistema no momento da avaliação. Avaliações são imutáveis após publicação.

**Picker de condição (`condicao_encontrada`):** campo obrigatório — 5 pills coloridos. Valores: `seco` · `grip` · `boa` · `baixa` · `lama`. Separa condição objetiva da trilha (usada pelo agente Python) da experiência subjetiva do ride (estrelas, apenas exibição).

---

### `Navbar`
Barra sticky. Oculta em `/`, `/login`, `/cadastro` e `/t/*`.

**Perfil assíncrono:** busca `is_admin`, `nome`, `apelido` e aprovações pendentes. Link Admin visível apenas quando `!loadingProfile && profile?.is_admin` — sem flicker. Badge vermelho se `pendingApprovals > 0`.

---

### `PWAInstallPrompt`
Gerencia o prompt de instalação do PWA.
- **Android/Chrome:** captura `beforeinstallprompt` → botão "Instalar"
- **iOS/Safari:** detecta `userAgent` → instrução "Safari → Compartilhar → Adicionar à Tela de Início"

---

## PWA — Progressive Web App

O app é instalável como PWA em Android e iOS.

**`public/manifest.json`:**
```json
{
  "name": "MTB Forecaster",
  "short_name": "MTB",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#111111",
  "theme_color": "#111111"
}
```

**`public/sw.js`:** Service Worker com cache-first strategy para assets estáticos (`/manifest.json`, `/icons/*.png`). Cache name: `mtb-forecaster-v2`. Navigation requests (`mode: 'navigate'`), rotas de auth (`/auth/`), `/api/`, `/login` e `/dashboard` são passadas diretamente sem cache.

**`app/layout.tsx`:** registra o SW e inclui meta tags Apple Web App.

---

## Integração Strava

### Fluxo OAuth completo

```
Rider clica "Conectar com Strava"
        │
        ▼
GET /api/strava/auth
  → redireciona para strava.com/oauth/authorize
        │
        ▼
Rider autoriza no Strava
        │
        ▼
GET /api/strava/callback?code=...
  1. POST /oauth/token → access_token
  2. GET /segments/starred?per_page=50
  3. Filtra e serializa segmentos relevantes
  4. Set-Cookie: strava_token (httpOnly, 1h)
  5. Redirect /perfil/strava?segments=[JSON]
        │
        ▼
/perfil/strava — rider configura solo, exposição, tipo, bioma
  └─ salva em trilhas_pessoais
```

### Dados salvos por segmento (`trilhas_pessoais`)

| Campo | Origem |
|---|---|
| `strava_segment_id` | `s.id` |
| `name` | `s.name` |
| `lat` / `lon` | `s.start_latlng[0]` / `[1]` |
| `distance` | `s.distance` (metros) |
| `desnivel_m` | `s.total_elevation_gain` |
| `altitude_m` | `s.elevation_high` |
| `polyline` | `s.map.summary_polyline` |
| `solo_type`, `exposicao`, `trail_type`, `bioma` | configurado pelo rider na UI |
| `regiao` | derivado de `s.state` |

---

## Integração Telegram

O agente Python envia notificações personalizadas por Telegram após cada processamento.

### Fluxo de ativação

1. Rider acessa o bot pelo link fornecido no `/perfil` e envia `/start`
2. Bot salva `telegram_chat_id` em `profiles` e ativa `telegram_ativo = true`
3. A cada execução do agente, notificações são enviadas via `Bot API → sendMessage`

### Endpoint `/start` no agente

O webhook `POST /telegram/webhook` captura a mensagem `/start`, lê o `chat_id` do payload e faz:
```python
supabase.from('profiles').update({ 'telegram_chat_id': chat_id, 'telegram_ativo': True })
```

### Conteúdo das notificações

Para cada usuário com `telegram_ativo = true`:
- Trilhas favoritadas com veredicto atual
- Condições críticas destacadas (MELHOR ESPERAR)
- Texto em Markdown com `parse_mode: "Markdown"`

### Variável de ambiente necessária

```env
TELEGRAM_BOT_TOKEN=seu_token_aqui
```

---

## Integração Instagram

O agente `scripts/post_instagram.py` publica automaticamente no Instagram Business após cada execução do pipeline principal. Publica em **Feed** (1080×1080) e **Stories** (1080×1920) com cards distintos.

### Fluxo

1. Busca trilhas com condições reais no Supabase (sem placeholders)
2. Seleciona trilha por `interest_score()` — ALERTA/ESPERAR têm peso maior + bônus por chuva
3. Warm-up do endpoint OG Feed (`GET /api/og/instagram?trilha_id=UUID`) — gera/cacheia imagem de fundo via Pollinations.ai no bucket `instagram-bg`
4. Publica no **Feed** via Graph API v21.0 com caption completa
5. Warm-up do endpoint OG Stories (`GET /api/og/instagram/stories?trilha_id=UUID`)
6. Publica no **Stories** via Graph API com card 1080×1920

### Geração de imagem de fundo — Pollinations.ai (Flux)

Prompts fixos por categoria climática — imagem gerada uma vez e cacheada em `instagram-bg/{categoria}.jpg` (5 imagens compartilhadas entre trilhas):

| Categoria | Gatilho |
|---|---|
| `sol` | rain < 0.5mm e pop_12h < 20% |
| `nublado` | pop_12h ≥ 20% |
| `garoa` | rain ≥ 0.5mm ou pop_12h ≥ 35% |
| `chuva` | rain ≥ 5mm ou pop_12h > 60% |
| `tempestade` | rain ≥ 15mm ou (rain ≥ 10mm e pop_12h ≥ 70%) |

Todos os prompts usam fotografia aérea (drone) de paisagem brasileira — sem pessoas, ciclistas, veículos ou objetos. `negative_prompt` reforça a exclusão de figuras humanas.

### Endpoints OG (Satori / `next/og`)

**`GET /api/og/instagram?trilha_id=UUID`** — Feed 1080×1080

Layout: header (MTB FORECASTER + data) · label + nome da trilha + localização · badges de veredicto e aderência · alerta de vento (condicional) · 3 métricas (MAXIMA / CHUVA 24H / VENTO) · rodapé.

**`GET /api/og/instagram/stories?trilha_id=UUID`** — Stories 1080×1920

Layout vertical: foto de fundo cobre o topo (1080×1080) com gradiente que faz o fade para área escura na metade inferior. Área escura exibe: label "CONDICOES AGORA" · badges veredicto e aderência · alerta de vento (condicional) · 3 métricas · rodapé.

Ambos os endpoints reutilizam o mesmo background do bucket `instagram-bg` — o Stories nunca re-gera a imagem de fundo.

### Caption gerada automaticamente

```
🚵 Nome da Trilha
📍 Cidade — Estado

⛔ MELHOR ESPERAR
Choveu 30.5mm nas últimas 48h. Com a secagem natural, o impacto
efetivo no solo é de 10.8mm... (texto_dinamico do agente Claude)
🌿 Solo muito úmido (10.7mm ef.)
🕐 24/06 21h–23h · 25/06 15h–22h · 26/06 08h–10h · pico 100%
🌧️ 1.5mm (24h)   💨 2.9m/s   🌡️ 9–13°C   💧 74%

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions ...
```

Campos incluídos: `texto_dinamico` (narrativa IA), `horarios_chuva` (janelas de chuva previstas), clima e hashtags por estado.

### Renovação automática de token

**Arquivo:** `scripts/refresh_instagram_token.py` + `.github/workflows/refresh-instagram-token.yml`

Roda no dia 1 de cada mês às 10h UTC. Chama `fb_exchange_token` com `META_APP_ID` + `META_APP_SECRET`, inspeciona o novo token via `debug_token` e atualiza o secret `INSTAGRAM_ACCESS_TOKEN` no GitHub via `gh secret set` (requer `GH_DISPATCH_TOKEN` com permissão de Secrets).

### Workflows GitHub Actions

**`.github/workflows/instagram-post.yml`** — disparado via `workflow_run` após conclusão do "Agent MTB Forecaster". Sem schedule próprio.

**`.github/workflows/refresh-instagram-token.yml`** — cron mensal (dia 1, 10h UTC) para renovar o token de longa duração (60 dias).

### Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `OG_API_BASE` | Sim | URL base do app (ex: `https://mtbforecaster.com.br`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave de serviço Supabase |
| `INSTAGRAM_ACCESS_TOKEN` | Sim | Token de longa duração (60 dias) |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Sim | ID da conta Business Instagram |
| `META_APP_ID` | Sim (renovação) | ID do app no Meta Developer Dashboard (Basic Settings) |
| `META_APP_SECRET` | Sim (renovação) | Secret do app (Basic Settings) |
| `GH_DISPATCH_TOKEN` | Sim (renovação) | Fine-grained PAT com permissão de Secrets read/write |
| `DRY_RUN=1` | Não | Simula sem postar |
| `TRAIL_ID=UUID` | Não | Força trilha específica |

### Execução manual / debug

```bash
# Dry run — mostra o que seria postado
DRY_RUN=1 python scripts/post_instagram.py

# Força trilha específica
TRAIL_ID=a5cf760b-f252-491f-829b-a5e16b238b75 DRY_RUN=1 python scripts/post_instagram.py

# Renovar token manualmente
META_APP_ID=... META_APP_SECRET=... INSTAGRAM_ACCESS_TOKEN=... python scripts/refresh_instagram_token.py
```

---

## Banco de dados — Supabase

O banco tem **34+ tabelas** organizadas em 7 grupos (inclui pump tracks e mantenedores).

Para o inventário completo de cada tabela, ver `docs/supabase-tabelas.md`.

### Grupo 1 — Configuração do modelo (15+ tabelas)

| Tabela | Descrição |
|---|---|
| `enso_config` | Fases ENSO, intervalos ONI e multiplicadores genéricos sobre threshold sazonal |
| `enso_regional_mult` | Multiplicadores ENSO por fase × macro-região (NORTE/NORDESTE têm lógica inversa) |
| `aderencia_thresholds` | Limites de ef_combinado para SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA |
| `veredicto_pesos` | Pesos de risco por condição (aderencia_baixa, pico_3h_alto, vento_alto, etc.) |
| `veredicto_limiares` | Limiares de decisão: ≤1 → DROP LIBERADO, ≤3 → Veja alertas, >3 → MELHOR ESPERAR |
| `meia_vida_clima_mult` | Multiplicadores de secagem por temperatura, vento, nebulosidade, umidade e combo garoa |
| `biomas` | Coeficientes de dossel (chuva_penetracao, vento_penetracao, sol_penetracao), tolerancia_bioma e sazonalidade |
| `configuracoes_sistema` | Chave-valor: parâmetros do modelo, coeficientes de scoring, credenciais email |
| `solo_type_config` | `fator_absorcao_base` e `score_mult` por tipo de solo |
| `inclinacao_config` | Penalizadores de absorção por inclinação calculada ou desnível bruto |
| `aderencia_descricoes` | 25 textos descritivos por (status × solo_type) |
| `threshold_sazonal` | Thresholds mensais por região (UF específico → macro-região → DEFAULT) |
| `meia_vida_secagem` | Taxa base de secagem por (solo_type, exposicao, regiao) — inclui coluna regional |
| `tabela_solo` | Composição do solo: clay_pct, sand_pct, texture_class |
| `trail_type_config` | Multiplicadores por trail_type × exposicao |
| `microclima_config` | Mantida no BD — **não mais lida pelo Python** (supersedida por `biomas`) |

### Grupo 2 — Dados operacionais principais (5 tabelas)

**`trilhas`**, **`trilhas_pendentes`**, **`localidades`**, **`condicoes`** (colunas de auditoria adicionadas em jun/2026: `cloud_pct`, `humidity_pct`, `temp_media_c`, `meia_vida_base_h`), **`mantenedores`**

### Grupo 3 — Pump Tracks (4 tabelas)
**`trilhas_pumptrack`**, **`condicoes_pumptrack`**, **`fotos_pumptrack`**, **`observacoes_pumptrack`**

### Grupo 4 — Strava (3 tabelas)
**`strava_segmentos_config`**, **`trilhas_pessoais`**, **`strava_config_sugestoes`**

### Grupo 5 — Usuários (2 tabelas)
**`profiles`**, **`favoritos`**

### Grupo 6 — Interações e moderação (2 tabelas)
**`observacoes_trilha`**, **`admin_aprovacoes`**

### Grupo 7 — Strava condições (1 tabela)
**`condicoes_strava`** — mesma estrutura de `condicoes`, chave por `strava_segment_id`

---

## Agente Python — Pipeline completo

O agente `mtb-forecast.py` executa via GitHub Actions com schedule diferenciado por dia da semana (horários BRT):

| Dia | Execuções BRT |
|---|---|
| Seg – Qui | 07h |
| Sex | 07h · 13h · 21h |
| Sáb | 07h · 13h · 21h |
| Dom | 07h · 13h |

### Arquitetura de chamadas de API (jun/2026)

O agente usa **Open-Meteo em batch**: uma única chamada de forecast e uma de histórico cobrem todos os 23 grupos de clima (multi-coordenada: `latitude=a,b,c&longitude=x,y,z`). A resposta é um array quando há múltiplas coordenadas ou um objeto único quando há apenas uma — o código trata ambos os casos.

**OWM One Call 3.0 Timemachine foi removido em jun/2026.** Clima histórico (temperatura, vento, nuvens, umidade) vem exclusivamente do batch histórico Open-Meteo Archive (ERA5). O shortcircuit zero-rain também foi removido — com o batch OM a economia de chamadas é irrelevante.

**Nowcast bridge ICON seamless (jun/2026):** 3ª chamada batch Open-Meteo — `past_hours=6&models=icon_seamless` — captura chuva convectiva recente que o ERA5 ainda não assimilou (lag ERA5: 4–6h; lag ICON seamless: ~1–2h). Overlay take-max por hora sobre os dados ERA5.

**Quota por execução (133 trilhas, 23 grupos):**
- Open-Meteo: **3 chamadas batch** (forecast 4d + histórico ERA5 48h + nowcast ICON 6h) — cobre todas as trilhas
- OWM: ~46 day_summary + ~23 onecall forecast ≈ **69 chamadas**
- Limite One Call 3.0 free: 1.000/dia · 4 execuções/dia ≈ 284 — folga confortável

### Fluxo resumido

```
GitHub Actions (schedule + workflow_dispatch)
        │
        ▼
1. _validar_env()
   Verifica OPENWEATHER_API_KEY + SUPABASE_SERVICE_KEY
        │
        ▼
2. Carregamento de tabelas de config (uma vez por execução)
   15+ caches globais carregados via Supabase REST
   Cada cache: if cache: return cache → fetch Supabase → fallback hardcoded
        │
        ▼
3. fetch_oni_atual() → NOAA oni.ascii.txt
   Lê coluna ANOM (partes[3]) — validação em 3 camadas
   Retorna: {oni, fase_raw, fase, mult, emoji}
        │
        ▼
4. _carregar_trilhas_supabase()
   Carrega trilhas com aprovada = true + JOIN localidades + JOIN mantenedores
   Fallback: lê trilhas.csv
        │
        ▼
5. fetch_batch_openmeteo_forecast() — 1 chamada cobre todos os grupos
   fetch_batch_openmeteo_historico() — 1 chamada ERA5 cobre todos os grupos
   _fetch_om_nowcast_bridge() — 1 chamada ICON seamless (past_hours=6) por grupo
   Formato multi-coordenada: latitude=a,b,c&longitude=x,y,z
        │
        ▼
6. Para cada trilha — processar_trilha():
   ├── _lookup_solo(solo_type, bioma, regiao) → clay_pct, sand_pct, texture_class
   │
   ├── fetch_onecall() — previsão horária 48h (OWM, fonte primária, 70%)
   │
   ├── fetch_onecall_day_summary() — OWM day_summary hoje + ontem
   │     Detector de lag OM:
   │     se ow_chuva_solo_mm > om_chuva_solo_48h_mm + 1.0mm → lag detectado
   │         → acumulo_ef += (ow_chuva_solo_mm - om_chuva_solo_48h_mm) × 0.9
   │
   ├── fetch_batch_openmeteo_historico() → clima histórico (batch)
   │     Temperatura, vento, nuvens, umidade → _ajustar_meia_vida_clima()
   │     OM entrega vento em km/h; converter para m/s antes
   │
   ├── fetch_historico_chuva_om() — ERA5 precipitação (do batch)
   │     Usa campo "precipitation" (= rain + showers + snow) — NUNCA só "rain"
   │     Overlay nowcast ICON: take-max por hora nos últimos 6h (corrige lag ERA5)
   │     Calcula acumulo_ef via decaimento exponencial: Σ p × 0.5^(t/τ)
   │     Aplica chuva_penetracao do bioma em AMBAS as fontes antes de comparar
   │
   ├── fetch_vento_historico() — ERA5 rajadas 48h → nível alerta 1/2/3
   │
   ├── _enso_mult_regional(enso, uf) → multiplicador ENSO regional
   │     Consulta enso_regional_mult por (fase_raw, macro_regiao)
   │     NORTE/NORDESTE: lógica inversa (El Niño = seca = threshold sobe)
   │
   ├── calcular_aderencia() → score + status + descrição
   │
   ├── calcular_aderencia_futura_oc() → pior bloco de 6h
   │
   ├── veredicto() → sistema de pontuação de risco
   │
   ├── calcular_janela_oc() → melhor janela limpa
   │
   └── Análise Claude AI → frase_secagem contextualizada
        │
        ▼
7. _aplicar_override_chuva_futura()
   SE previsao_24h[0] ou [1] > 3mm:
     SECO/GRIP PERFEITO → BOA ADERÊNCIA + DROP LIBERADO - Veja os alertas
        │
        ▼
7b. ajustar_por_observacoes()
    Consulta observacoes_trilha últimas 24h
    Acumula delta de risco (baixa=+1, lama=+2, cap=+2)
        │
        ▼
8. gravar_supabase()
   DELETE + INSERT em condicoes por trilha_id (~45 campos)
   Inclui: cloud_pct, humidity_pct, temp_media_c, meia_vida_base_h
        │
        ▼
9. processar_segmentos_strava()
   Mesmo pipeline → gravar_condicoes_strava()
        │
        ▼
9b. _processar_pumptracks()
   Sem modelo de solo — apenas previsão do tempo
   DELETE + INSERT em condicoes_pumptrack
        │
        ▼
10. Notificações personalizadas
    Email: profiles com receber_email = true
    Telegram: profiles com telegram_ativo = true
        │
        ▼
11. Log e artefato
    tee → debug_YYYY-MM-DD.log
    Upload como artifact GitHub Actions (retido 30 dias)
```

---

## Modelo de solo e aderência

Para a documentação completa das fórmulas, ver `docs/formulas-modelo.md`.

### Resumo do pipeline

1. **Composição do solo** via `tabela_solo` — lookup prioritário por (solo_type, bioma, regiao)
2. **Decaimento exponencial** — `acumulo_ef = Σ p_i × chuva_penetracao × 0.5^(t_i / τ)`
3. **Meia-vida base** por (solo_type, exposicao, regiao) — coluna `regiao` adicionada em jun/2026

| regiao | terra/fechada | fator vs DEFAULT |
|---|---|---|
| DEFAULT / SUDESTE | 36h | ×1.00 |
| SUL | 46h | +28% (frio/úmido) |
| NORTE | 56h | +55% (umidade amazônica) |
| NORDESTE | 23h | −35% (seco/quente) |
| CENTRO-OESTE | 31h | −15% (cerrado) |

4. **Multiplicadores climáticos** via `meia_vida_clima_mult` — temperatura, vento, nebulosidade, umidade
5. **Combo garoa** (jun/2026): `humidity ≥ 85% + cloud ≥ 70%` → multiplicador adicional × 1.10. Stack máximo: base × 1.25 × 1.20 × 1.10 ≈ × 1.65
6. **Multiplicador trail_type** via `trail_type_config`
7. **Clamp final:** `max(4h, min(72h, meia_vida))`
8. **Thresholds sazonais** via `threshold_sazonal` — cascata UF → macro-região → DEFAULT
9. **ENSO regional** via `enso_regional_mult` — consulta por (fase_raw, macro_regiao) com lógica inversa para NORTE/NORDESTE
10. **Tolerância de microclima** — `fator_tolerancia(trail) = tolerancia_bioma × sensibilidade` — multiplicador mestre aplicado a todas as camadas de threshold (descanso, saturação, grip)
11. **Limiar de descanso** — `limiar_descanso = threshold_solo_descansado(mes, enso, trail)`; `solo_descansado = acumulo_ef < limiar_descanso`
12. **Normalização para status de aderência** — `ef_normalizado = acumulo_ef / fator_tolerancia`, comparado contra `aderencia_thresholds` (SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA)

> Nomenclatura unificada em jun/2026 — ver [Notas de versão](#notas-de-versão) para o mapeamento completo nome-antigo → nome-atual.

---

## Cálculo de veredicto

Pontos de risco acumulados (pesos na tabela `veredicto_pesos`, limiares em `veredicto_limiares`):

| Condição | Pontos |
|---|---|
| BAIXA ADERÊNCIA | +3 |
| BOA ADERÊNCIA | +2 |
| GRIP PERFEITO | +1 |
| pico_3h ≥ 15mm | +2 |
| pico_3h ≥ 10mm | +1 |
| rain_mm ≥ 8mm | +1 |
| wind_ms ≥ 12 m/s | +1 |
| Inclinação > 30% com umidade | +2 |
| Inclinação > 20% com umidade | +1 |
| Natural inclinada + chuva + aderência ≤ BOA | +1 |
| Bikepark (redução) | −1 |
| Bikepark saturado | +2 |
| Vento histórico nível 3 (> 90 km/h) | +2 |
| Vento histórico nível 2 (65–90 km/h) | +1 |
| Vento histórico nível 2 + solo encharcado | +1 adicional |
| Vento histórico nível 1 (55–65 km/h) + encharcado | +1 |
| Rajada prevista ≥ 30 km/h (aberta) | risco mínimo = 2 |
| Rajada prevista ≥ 50 km/h (fechada) | risco mínimo = 2 |
| Aderência futura piora 2 graus | +2 |
| Aderência futura piora 1 grau | +1 |
| Aderência futura melhora | −1 |
| pico_proximas_3h ≥ 10mm (iminente alta) | +2 |
| pico_proximas_3h ≥ 5mm (iminente) | +1 |

| Total | Veredicto |
|---|---|
| ≤ 1 | DROP LIBERADO |
| 2–3 | DROP LIBERADO - Veja os alertas |
| ≥ 4 | MELHOR ESPERAR |

---

## GitHub Actions — Workflows

### Workflow principal

**Arquivo:** `.github/workflows/mtb-forecast-workflow.yml`

#### Gatilhos

```yaml
on:
  schedule:
    - cron: "0 10 * * *"      # 07h BRT — todos os dias (Seg–Dom)
    - cron: "0 16 * * 0,5,6"  # 13h BRT — Sex, Sáb, Dom
    - cron: "0 0 * * 0,6"     # 21h BRT — Sex (0h UTC Sáb) e Sáb (0h UTC Dom)
  workflow_dispatch:           # execução manual via UI do GitHub
```

#### Steps do job

```yaml
- actions/checkout@v4
- actions/setup-python@v5 (Python 3.11, cache: "pip")
- run: pip install -r requirements.txt
- run: python mtb-forecast.py 2>&1 | tee debug_$(date +%Y-%m-%d).log
- actions/upload-artifact@v4  # if: always() — log retido 30 dias
```

#### Variáveis de ambiente no job

```yaml
env:
  OPENWEATHER_API_KEY:       ${{ secrets.OPENWEATHER_API_KEY }}
  ANTHROPIC_API_KEY:         ${{ secrets.ANTHROPIC_API_KEY }}
  SUPABASE_SERVICE_KEY:      ${{ secrets.SUPABASE_SERVICE_KEY }}
  SUPABASE_URL:              https://[projeto].supabase.co
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
  TELEGRAM_BOT_TOKEN:        ${{ secrets.TELEGRAM_BOT_TOKEN }}
```

---

### Workflow Instagram

**Arquivo:** `.github/workflows/instagram-post.yml`

Disparado via `workflow_run` após conclusão do "Agent MTB Forecaster". Executa `scripts/post_instagram.py` — seleciona trilha, gera cards OG via Pollinations.ai + Satori e publica no Feed e Stories do Instagram Business via Graph API v21.0.

**Arquivo:** `.github/workflows/refresh-instagram-token.yml`

Cron mensal (dia 1, 10h UTC). Renova o `INSTAGRAM_ACCESS_TOKEN` via `fb_exchange_token` e atualiza o secret no GitHub.

#### Secrets necessários

```yaml
OG_API_BASE:                   ${{ vars.OG_API_BASE }}
NEXT_PUBLIC_SUPABASE_URL:      https://[projeto].supabase.co
SUPABASE_SERVICE_ROLE_KEY:     ${{ secrets.SUPABASE_SERVICE_KEY }}
INSTAGRAM_ACCESS_TOKEN:        ${{ secrets.INSTAGRAM_ACCESS_TOKEN }}
INSTAGRAM_BUSINESS_ACCOUNT_ID: ${{ secrets.INSTAGRAM_BUSINESS_ACCOUNT_ID }}
META_APP_ID:                   ${{ secrets.META_APP_ID }}
META_APP_SECRET:               ${{ secrets.META_APP_SECRET }}
GH_DISPATCH_TOKEN:             ${{ secrets.GH_DISPATCH_TOKEN }}
```

---

### Workflow de debug

**Arquivo:** `.github/workflows/mtb-forecast-debug.yml`

Workflow manual (`workflow_dispatch`) para debugar trilhas específicas sem notificações.

**Não possui** `GH_DISPATCH_TOKEN`, `TELEGRAM_BOT_TOKEN` nem `SEND_EMAIL_SECRET` — ausência intencional (zero notificações em debug).

#### Inputs

| Input | Tipo | Descrição |
|---|---|---|
| `estado` | dropdown | UF para filtrar (ex: SP, MG) |
| `cidade` | string | Texto parcial para filtro de cidade |
| `trilha` | string | Texto parcial para filtro por nome de trilha |
| `debug_model` | boolean | Ativa logs detalhados do modelo |

#### Variáveis de filtro injetadas como env

```yaml
MTB_ESTADO:    ${{ inputs.estado }}
CIDADE_DEBUG:  ${{ inputs.cidade }}
TRILHA_DEBUG:  ${{ inputs.trilha }}
DEBUG_MODEL:   ${{ inputs.debug_model }}
```

---

## Configuração — Secrets e variáveis de ambiente

### GitHub Actions Secrets

| Secret | Obrigatório | Uso |
|---|---|---|
| `OPENWEATHER_API_KEY` | Sim | One Call 3.0 forecast + day_summary histórico |
| `SUPABASE_SERVICE_KEY` | Sim | Leitura/gravação no Supabase (service_role) |
| `ANTHROPIC_API_KEY` | Recomendado | Claude AI — frases de secagem contextualizadas |
| `TELEGRAM_BOT_TOKEN` | Opcional | Notificações por Telegram (ausente no workflow de debug) |
| `INSTAGRAM_ACCESS_TOKEN` | Opcional | Token de longa duração (60 dias) para post no Instagram |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Opcional | ID da conta Business Instagram |
| `META_APP_ID` | Opcional | ID do app Meta (Basic Settings) — renovação mensal do token |
| `META_APP_SECRET` | Opcional | Secret do app Meta (Basic Settings) — renovação mensal |
| `GH_DISPATCH_TOKEN` | Opcional | Fine-grained PAT com Secrets read/write — atualiza token via `gh secret set` |

> Credenciais de email (`email_from`, `email_password`, `email_smtp_host`, `email_smtp_port`) são armazenadas em `configuracoes_sistema` no Supabase — sem necessidade de secret no Actions.

### Next.js — `.env.local`

```env
# Supabase (obrigatório)
NEXT_PUBLIC_SUPABASE_URL=https://[projeto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui

# Strava OAuth
NEXT_PUBLIC_STRAVA_CLIENT_ID=seu_client_id
NEXT_PUBLIC_STRAVA_REDIRECT_URI=https://www.mtbforecaster.com.br/api/strava/callback
STRAVA_CLIENT_SECRET=seu_client_secret

# Stripe (planos de assinatura)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_SECRET_KEY=sk_...
```

> O web app usa apenas a **anon key** com Row Level Security. A `service_role key` é usada exclusivamente pelo agente Python.

### Variáveis Vercel

Configure em **Vercel → Settings → Environment Variables** as mesmas do `.env.local`.

Para Google OAuth: configure em **Supabase → Authentication → Providers → Google** com Client ID e Secret do Google Cloud Console.

---

## Desenvolvimento local

### Pré-requisitos

- Node.js 18+
- Python 3.11+
- Conta no [Supabase](https://supabase.com)
- Conta no [Strava API](https://www.strava.com/settings/api) (opcional)

### Instalação

```bash
# 1. Clonar o repositório
git clone https://github.com/mtb-forecast/mtb-forecast-app.git
cd mtb-forecast-app

# 2. Instalar dependências Node
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env.local
# edite .env.local com suas chaves

# 4. Rodar em desenvolvimento
npm run dev
```

O app estará disponível em `http://localhost:3000`.

### Rodar o agente localmente

```bash
# Instalar dependências Python
pip install -r requirements.txt

# Configurar variáveis de ambiente
export OPENWEATHER_API_KEY=sua_chave
export SUPABASE_SERVICE_KEY=sua_service_key
export ANTHROPIC_API_KEY=sua_chave   # opcional

python mtb-forecast.py
```

### Aplicar migrações Supabase

```bash
# Via Supabase CLI
supabase db push

# Ou manualmente no SQL Editor do Supabase Dashboard
# Arquivos em supabase/migrations/ na ordem das fases
```

---

## Como adicionar trilhas

### Via painel admin (recomendado)

Riders autenticados cadastram trilhas em `/trilhas/cadastrar`. A trilha entra em `trilhas_pendentes` com `status = 'pendente'` e aguarda aprovação em `/admin`. Na aprovação:
1. Geocodificação reversa via Nominatim salva `localidade_id` na trilha
2. Registro inserido em `trilhas` com `aprovada = true`

### Via SQL direto no Supabase

```sql
INSERT INTO trilhas (name, lat, lon, solo_type, exposicao, altitude_m, trail_type, regiao,
                     desnivel_m, extensao_km, bioma, aprovada)
VALUES ('ZigZag - Campos do Jordão', -22.768683, -45.614767, 'preto', 'fechada',
        1630, 'natural', 'SP', 480, 32, 'Mata Atlântica', true);
```

### Via CSV (fallback do agente)

Se o Supabase estiver indisponível, o agente faz fallback para `trilhas.csv`:

```csv
name;lat;lon;solo_type;exposicao;altitude_m;trail_type;desnivel_m;extensao_km;regiao;bioma
ZigZag - Campos do Jordao - SP;-22.768683;-45.614767;preto;fechada;1630;natural;480;32;SP;Mata Atlântica
```

---

## Campos da trilha

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | Sim | Nome da trilha |
| `lat` | float | Sim | Latitude decimal (negativo para sul) |
| `lon` | float | Sim | Longitude decimal (negativo para oeste) |
| `solo_type` | string | Sim | Tipo de solo — ver tabela abaixo |
| `exposicao` | string | Sim | `aberta` ou `fechada` |
| `altitude_m` | int | Sim | Altitude média em metros |
| `trail_type` | string | Sim | `natural` ou `bikepark` |
| `regiao` | string | Sim | Sigla UF: SP, MG, RJ, RS... |
| `desnivel_m` | float | Não | Desnível total (m) — habilita cálculo de inclinação |
| `extensao_km` | float | Não | Extensão total (km) — habilita cálculo de inclinação |
| `bioma` | string | Não | Ex: `Mata Atlântica` — ativa ajuste microclimático |
| `mantenedor_id` | uuid | Não | FK para `mantenedores` — exibe LogoMantenedor |

### Valores de `solo_type`

| Valor | Meia-vida base (aberta / fechada) — DEFAULT | Quando usar |
|---|---|---|
| `terra` | 24h / 36h | Terra batida, barro, trilhas de mata |
| `misto` | 18h / 28h | Combinação de terra e pedra |
| `misto_mg` | 12h / 18h | Misto com minério — Quadrilátero Ferrífero |
| `preto` | 14h / 24h | Serapilheira sobre Cambissolos/quartzitos |
| `pedra` | 6h / 10h | Trilhas predominantemente rochosas |
| `ferro` | 8h / 14h | Solo ferruginoso — Quadrilátero Ferrífero |

> Valores variam por macro-região (`meia_vida_secagem.regiao`). Os valores acima são da região DEFAULT/SUDESTE.

> `ferro` e `misto_mg` exibem automaticamente o badge **Quadrilátero Ferrífero**.

### Valores de `exposicao`

| Valor | Quando usar |
|---|---|
| `fechada` | Mata densa, sombra, pouca ventilação |
| `aberta` | Campos, chapadas, cristas, bike parks sem cobertura |

> Threshold de alerta de rajada: ≥ 30 km/h (aberta) · ≥ 50 km/h (fechada).

---

## APIs utilizadas

| API | Uso | Requer cadastro |
|---|---|---|
| [OpenWeather One Call 3.0](https://openweathermap.org/api/one-call-3) | Previsão horária 48h (peso 70% na fusão) | Sim |
| [OpenWeather Day Summary](https://openweathermap.org/api/one-call-3#history_daily_aggregation) | `/data/3.0/onecall/day_summary` hoje+ontem — detector de lag de assimilação OM | Sim |
| [Open-Meteo Forecast](https://open-meteo.com) | Previsão horária 30% + batch multi-coordenada | Não |
| [Open-Meteo Archive (ERA5)](https://open-meteo.com/en/docs/historical-weather-api) | Precipitação, temperatura, vento e umidade históricos em batch multi-coordenada | Não |
| [NOAA CPC](https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt) | Índice ONI para classificação ENSO | Não |
| [Anthropic Claude](https://console.anthropic.com) | Frases de secagem contextualizadas por região e ENSO | Sim |
| [Supabase](https://supabase.com) | Banco de dados + Auth (e-mail + Google OAuth) + Storage | Sim |
| [Strava API v3](https://developers.strava.com) | OAuth + segmentos favoritos starred | Sim |
| [Nominatim (OpenStreetMap)](https://nominatim.openstreetmap.org) | Geocodificação reversa na aprovação de trilhas | Não |
| [Telegram Bot API](https://core.telegram.org/bots/api) | Notificações personalizadas por chat_id | Sim |
| [Stripe](https://stripe.com) | Planos de assinatura | Sim |
| [Pollinations.ai (Flux)](https://pollinations.ai) | Geração de backgrounds para cards Instagram — 5 prompts fixos por categoria climática, cacheados em `instagram-bg` | Não |
| [Meta Graph API v21.0](https://developers.facebook.com/docs/graph-api) | Publicação no Instagram Feed e Stories via `/{user_id}/media` + `/media_publish` | Sim |
| [Tabler Icons](https://tabler.io/icons) | Ícones vetoriais (webfont CDN) | Não |

> **Removido em jun/2026:** OpenWeather Timemachine (`/data/3.0/onecall/timemachine`) — retornava apenas 1 hora por chamada (diferente da API 2.5), causando amostras enviesadas de temperatura e meia-vida. Substituído pelo batch histórico OM.

---

## Dependências

### Web App

```json
"next": "14.2.29",
"react": "^18",
"@supabase/ssr": "^0.5.2",
"@supabase/supabase-js": "^2.49.4",
"leaflet": "^1.9.4",
"@types/leaflet": "^1.9.21",
"@stripe/stripe-js": "^9.5.0",
"stripe": "^22.1.1",
"tailwindcss": "^3.4.1",
"typescript": "^5"
```

**Externas (CDN):** `@tabler/icons-webfont@latest`

### Agente Python

```
# requirements.txt
pytest>=8.0.0
supabase>=2.0.0
```

Toda a lógica usa apenas stdlib Python 3.11 (`os`, `json`, `html`, `urllib`, `datetime`, `csv`, `time`, `smtplib`, `email.mime`). O SDK `supabase` é usado nos testes. `requirements-lock.txt` tem 24 dependências pinadas para reproducibilidade no CI.

---

## Notas de versão

### V10.2 — Instagram Feed + Stories com cards dedicados (jun/2026)

**Cards OG via Satori (`next/og`):**
- Feed 1080×1080: `/api/og/instagram` — background Pollinations.ai cacheado em `instagram-bg/{categoria}.jpg`
- Stories 1080×1920: `/api/og/instagram/stories` — layout vertical, foto no topo com gradiente fade, condições na área escura inferior
- 5 categorias climáticas com prompts fixos de fotografia aérea drone (sem pessoas, ciclistas ou objetos)
- Background compartilhado entre Feed e Stories — Stories nunca re-gera a imagem

**Caption aprimorada:**
- `texto_dinamico` (narrativa Claude AI) incluído após o veredicto
- `horarios_chuva` (janelas de chuva previstas: "24/06 21h–23h · 25/06 15h–22h...")
- Estrutura: nome + localização → veredicto + narrativa → solo → horários → clima → link → hashtags

**Renovação automática de token:**
- `scripts/refresh_instagram_token.py` + `.github/workflows/refresh-instagram-token.yml`
- Cron mensal (dia 1, 10h UTC) via `fb_exchange_token` com `META_APP_ID` + `META_APP_SECRET`
- Atualiza `INSTAGRAM_ACCESS_TOKEN` no GitHub via `gh secret set` (requer `GH_DISPATCH_TOKEN`)

**`pop_48h` → `pop_12h`:**
- Campo renomeado para refletir previsão máxima de 24h (não 48h)
- Migração adicionada em `condicoes_pumptrack`
- Atualizado em `mtb-forecast.py`, `pump-track/[id]`, `/trilhas` e endpoint OG

**Workflow:**
- Instagram post disparado por `workflow_run` após Agent MTB Forecaster (sem schedule próprio)
- Publica Feed → aguarda 3s → publica Stories (falha em Stories não cancela o Feed)

---

### V10.1 — Unificação de nomenclatura do modelo (jun/2026)

Renomeação de parâmetros no agente Python e no schema Supabase para eliminar ambiguidade entre fontes de chuva, dossel e camadas de threshold. Sem mudança de comportamento — apenas clareza de leitura. Tabela completa de mapeamento:

| Nome antigo | Nome atual | Onde |
|---|---|---|
| `chuva_pct` / `vento_pct` / `sol_pct` | `chuva_penetracao` / `vento_penetracao` / `sol_penetracao` | coluna `biomas`, código |
| `bruto` / `bruto_raw` (+ `_48h`) | `chuva_solo_mm` / `chuva_ceu_mm` (+ `_48h`) | `fetch_historico_chuva_om()` |
| `bruto_ow` / `bruto_ow_raw` | `ow_chuva_solo_mm` / `ow_chuva_ceu_mm` | blend OM/OW no pipeline |
| `om_bruto` / `om_bruto_48h` / `om_bruto_raw` | `om_chuva_solo_mm` / `om_chuva_solo_48h_mm` / `om_chuva_ceu_mm` | blend OM/OW no pipeline |
| `fator_threshold` | `tolerancia_bioma` | coluna `biomas` |
| `fator_microclima()` / `fator_mc` | `fator_tolerancia()` / `fator_tol` | função + variável local |
| `thresh_local` / `thresh` / `thresh_desc` / `threshold_descanso` (6 grafias) | `limiar_descanso` | coluna `condicoes`, variáveis, debug |
| `efetivo_threshold` | `ef_normalizado` | variável local em `calcular_aderencia()` |
| `efetivo_combinado` (alias morto) | removido — usa `acumulo_ef` direto | `calcular_aderencia()` |
| `acumulo_bruto` / `acumulo_efetivo` (debug) | `acumulo_48h` / `acumulo_ef` | bloco `debug_model` |

**Excluídos da renomeação (mantidos):** `sensibilidade` (coluna por trilha) e `saturado` (flag de bikepark) — nomes já claros, sem ambiguidade.

**Convenção solo vs céu:** `*_solo_mm` = precipitação **após** interceptação de dossel (o que chega ao solo); `*_ceu_mm` = precipitação bruta **antes** do dossel. Aplicada simetricamente a Open-Meteo e OpenWeather.

---

### V10.0 — Modelo Regional + Batch OM + Mantenedores (jun/2026)

**Arquitetura Open-Meteo em batch:**
- 1 chamada forecast + 1 chamada histórico cobrem todas as 133 trilhas / 23 grupos de clima
- Formato multi-coordenada: `latitude=a,b,c&longitude=x,y,z` — sem chamadas individuais por trilha
- OWM Timemachine removido completamente — causava amostras de 3 horas do mesmo horário, enviesando temperatura e meia-vida
- Zero-rain shortcircuit removido — com batch OM a economia de chamadas é irrelevante

**Detector de lag de assimilação:**
- OWM `day_summary` hoje + ontem como fonte secundária de precipitação
- Regra: se `ow_chuva_solo_mm > om_chuva_solo_48h_mm + 1.0mm` → lag detectado → adiciona `(ow_chuva_solo_mm - om_chuva_solo_48h_mm) × 0.9` ao acumulo_ef
- Flagrado em produção em 22 trilhas (11/06/2026): Reserva Natural Park OW=9.1mm vs OM=0.2mm

**Modelo regional:**
- `_UF_MACRO_REGIAO`: dict mapeia 27 UFs para 5 macro-regiões (NORTE, NORDESTE, CENTRO-OESTE, SUDESTE, SUL)
- `meia_vida_secagem`: nova coluna `regiao` com cascata exact → DEFAULT
- `threshold_sazonal`: entradas por macro-região além de UF específico
- `enso_regional_mult`: nova tabela — ENSO × macro-região com lógica inversa para NORTE/NORDESTE
- NORDESTE/NORTE: El Niño = seca = threshold sobe (inverso do sul do Brasil)

**Multiplicadores de garoa atualizados:**
- `umidade ≥ 95%` → 1.25 (era 1.15)
- `umidade 85–95%` → 1.18 (era 1.08)
- `nebulosidade ≥ 90%` → 1.20 (era 1.12)
- NOVA linha `umidade_nebulosidade_combo`: `humidity ≥ 85% AND cloud ≥ 70%` → × 1.10 adicional

**Feature Mantenedores:**
- Tabela `mantenedores` com FK em `trilhas`
- Componente `LogoMantenedor` (card: pill escuro; página: com link)
- `logo_url` sempre com `<img>` nativo — NUNCA `next/image`
- Upload via `/api/admin/upload-logo` → bucket `logos` Supabase Storage
- Página pública `/mantenedores/[id]`: hero + grid de TrilhaCards

**Colunas de auditoria em `condicoes`:**
- `cloud_pct` NUMERIC(5,1) — cobertura de nuvens no período histórico
- `humidity_pct` NUMERIC(5,1) — umidade média
- `temp_media_c` NUMERIC(5,1) — temperatura média
- `meia_vida_base_h` NUMERIC(5,1) — meia-vida base antes dos multiplicadores climáticos

**Correções frontend:**
- `TrilhaCard.tsx` + `DashboardTrailCard.tsx`: `topBarColor()` e `verdictStyle()` com prioridade EVITAR > ALERTA > LIBERADO, case-insensitive
- `CondicaoCard.tsx`: `badgeSolo` retorna null para GRIP PERFEITO; "Solo seco" apenas quando `aderencia_status === 'SECO'` ou `acumuloAgora < 0.3mm`
- `CondicaoCard.tsx`: `isAlertaVeredicto` usa `.toUpperCase().includes('ALERTA')` em vez de match exato

### V9.0 — Pump Tracks + Foto de perfil (2026)

- 15 pump tracks do Brasil cadastrados (SP, RJ, MG, ES, SC, CE)
- Tabelas: `trilhas_pumptrack`, `condicoes_pumptrack`, `fotos_pumptrack`, `observacoes_pumptrack`
- `PumpTrackCard` com Waze, previsão 24h, iluminação, estacionamento, Instagram
- Coluna `avatar_url` em `profiles`, bucket `avatars` (2 MB, público)
- Navbar: avatar circular 30px

### V8.0 — Migração Supabase principal

- Trilhas carregadas do Supabase (`aprovada = true`) com fallback para CSV
- 14 tabelas mestras editáveis via `/admin/tabelas` com dupla aprovação dual-admin
- Email personalizado por usuário com base em preferências

### V7.8

- Google OAuth: login e cadastro com Google
- PWA: manifest.json · service worker · `PWAInstallPrompt`
- Cadastro manual de trilhas + compartilhamento WhatsApp

### V5.22–V5.24 (agente)

- Sazonalidade: thresholds derivados de ERA5-Land 30 anos
- ENSO Nível 3 via ONI NOAA
- Campo `bioma` com microclima Mata Atlântica
- One Call API 3.0 como fonte primária
- Modelo de secagem por decaimento exponencial

---

*MTB Forecaster · Criado por Guilherme Leal e Douglas Santos · Saiba antes de pedalar*
