# MTB Forecaster — Web App + Agente Python

Plataforma completa de monitoramento climático para trilhas de **Mountain Bike — DH, Enduro, XCC e XCM** no Brasil.

Composta por dois sistemas integrados:

- **Web App** — Next.js 14 App Router com autenticação (e-mail + Google OAuth via `@supabase/ssr`), favoritos, avaliações de riders, integração Strava, cadastro manual de trilhas, notificações por Telegram, compartilhamento por WhatsApp e PWA
- **Agente Python** — executa via GitHub Actions com schedule diferenciado por dia da semana (Seg–Qui: 7h · Sex/Sáb: 7h, 13h e 21h · Dom: 7h e 13h BRT), coleta dados de 3 fontes meteorológicas, modela condição do solo com 14 tabelas de configuração no Supabase e grava resultados no banco

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
- [Migração Supabase — Fases 1 a 5](#migração-supabase--fases-1-a-5)
- [GitHub Actions — Workflow](#github-actions--workflow)
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
┌──────────────────────────────────────────────────────────────────────┐
│    GitHub Actions (schedule por dia da semana + dispatch manual)       │
│                                                                        │
│  OpenWeather One Call 3.0 ──┐                                         │
│  Open-Meteo Forecast         ├──► mtb-forecast.py ──────► Supabase    │
│  Open-Meteo Archive (ERA5)  ─┘       Agente Python                    │
│  NOAA ONI (ENSO)            ─────────────────────────────►            │
│  Anthropic Claude AI        ─────────────────────────────►            │
│                                                                        │
│  14 tabelas de config lidas do Supabase na inicialização:             │
│  enso_config · aderencia_thresholds · veredicto_pesos                 │
│  veredicto_limiares · meia_vida_clima_mult · biomas                   │
│  configuracoes_sistema · solo_type_config · inclinacao_config         │
│  aderencia_descricoes · threshold_sazonal · meia_vida_secagem         │
│  tabela_solo                                                           │
└──────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Supabase (PostgreSQL + Auth + RLS)                   │
│                                                                        │
│  DADOS OPERACIONAIS                                                    │
│  trilhas · condicoes · condicoes_strava                                │
│  favoritos · profiles · trilhas_pessoais                               │
│  observacoes_trilha · strava_segmentos_config                          │
│  trilhas_pendentes · localidades · admin_aprovacoes                   │
│                                                                        │
│  TABELAS DE CONFIGURAÇÃO DO MODELO (14)                                │
│  enso_config · aderencia_thresholds · veredicto_risco_pesos           │
│  meia_vida_clima_mult · biomas · configuracoes_sistema                 │
│  solo_type_config · inclinacao_config · score_config                  │
│  aderencia_descricoes · threshold_sazonal · meia_vida_secagem         │
│  tabela_solo · microclima_config (mantida no BD, supersedida)         │
└──────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Web App (Next.js 14 App Router)                    │
│                                                                        │
│  /                    Landing page pública                             │
│  /login               E-mail + Google OAuth                           │
│  /cadastro            Cadastro completo + Google OAuth                │
│  /dashboard           Favoritas + Strava pessoais                     │
│  /trilhas             Listagem por estado (27 UFs) + busca + ranking  │
│  /trilhas/[id]        Detalhe: condição + avaliações + compartilhar   │
│  /trilhas/cadastrar   Cadastro manual de trilha pelo rider            │
│  /t/[id]              Preview público (sem login) para WhatsApp       │
│  /perfil              Dados pessoais + email + Telegram               │
│  /perfil/strava       Gerenciamento de segmentos Strava               │
│  /planos              Planos de assinatura (Stripe)                   │
│  /admin               Aprovações de trilhas + sugestões Strava        │
│  /admin/tabelas       Edição das tabelas mestras (dupla aprovação)    │
└──────────────────────────────────────────────────────────────────────┘
```

### Middleware de autenticação

`middleware.ts` protege todas as rotas autenticadas usando `createServerClient` do `@supabase/ssr` com leitura/escrita de cookies via `getAll`/`setAll`. Chama `supabase.auth.getUser()` (verificação JWT no servidor, não apenas leitura de cookie).

**Rotas públicas** (sem autenticação):
```
/login · /cadastro · /auth/callback · /t/ · /api/telegram/ · /planos · /manifest.json · /sw.js · /icons/
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

**Sem estado selecionado:**
- Seção de dicas com fotos MTB (hover mostra dica)
- 4 cards "Como usar o app": Selecione estado · Favorite · Importe do Strava · Avalie
- Banner Strava com ícone e texto explicativo

**Com estado selecionado:**
1. `supabase.from('trilhas').select('*, condicoes(*), localidades(cidade, estado, localidade)')` com `aprovada = true`
2. Filtro client-side: `localidades.estado === estadoSelecionado` com fallback para `trilha.regiao` (para trilhas aprovadas sem geocoding)
3. `supabase.from('favoritos').select('trilha_id')` — prepopula Set de favoritos
4. Busca local por nome
5. **Ranking** por veredicto 12h (`DROP LIBERADO` → `DROP LIBERADO - Veja os alertas` → `MELHOR ESPERAR` → sem dados) com desempate por `aderencia_score` ASC

**Header:** botão "+ Cadastrar trilha" e seletor de estado.

---

### `/trilhas/cadastrar` — Cadastro manual de trilha

Formulário em 5 seções para riders cadastrarem novas trilhas, submetidas para aprovação pelo admin.

**Seções:**

| Seção | Campos |
|---|---|
| Identificação | Nome, Estado (27 UFs) |
| Localização | URL Google Maps (extração automática de lat/lon), lat, lon |
| Características | Solo, Exposição, Tipo de trilha, Bioma, Altitude |
| Métricas | Desnível (m), Extensão (km) |
| Informações extras | Link referência (Trailforks, Wikiloc etc.), Observações |

**Extração automática de coordenadas** (`extrairCoordenadas`): suporta 4 formatos de URL do Google Maps — `/@lat,lon`, `?q=lat,lon`, `?ll=lat,lon`, e URLs de places.

**Submissão:** `supabase.from('trilhas_pendentes').insert({ ..., status: 'pendente', user_id })`.

---

### `/trilhas/[id]` — Detalhe da trilha

Página completa da condição da trilha, espelhando o card do e-mail do agente.

**Seções exibidas:**

| Seção | Dados |
|---|---|
| Cabeçalho preto | nome, trail_type, região, bioma, desnível, extensão, inclinação colorida, texture/clay/sand, badges Quadrilátero |
| Aderência + veredicto | ADERÊNCIA ATUAL · ADERÊNCIA FUTURA [label] · veredicto + texto_dinamico |
| Mapa | iframe Google Maps satélite (ou StravaMap + ElevationProfile para Strava pessoal) |
| Condição do Solo | frase de secagem + chuva 48h bruto/efetivo + solo descansado/úmido + última chuva + meia-vida |
| Previsão 24h | 4 blocos de 6h com mm / % / m/s / °C |
| Pico 3h | só quando ≥ 5mm |
| Janela limpa | melhor janela calculada pelo agente |
| Alertas | rajada futura · vento histórico |
| Avaliações dos riders | timeline vertical com estrelas, texto 150 chars, edição em 24h |
| Próximos 3 dias | 3 cards D+1/D+2/D+3 com emoji + veredicto + chuva/vento/temp |
| Fontes | OpenWeather / ENSO (ONI NOAA) / vento ERA5 |

**Botão WhatsApp:** abre `https://wa.me/?text=...` com link para `/t/[id]` e texto pré-formatado.
**Botão Favoritar:** estrela que faz upsert/delete em `favoritos`.

---

### `/t/[id]` — Preview público (sem login)

Página acessível **sem autenticação** para compartilhamento via WhatsApp.

**Layout:**
- Navbar simplificada: logo + botão "Criar conta grátis"
- Header preto com nome, badges (tipo, região, bioma, Quadrilátero) e dados físicos
- Google Maps embed
- **Seção bloqueada:** ícone de cadeado + CTA "Criar conta grátis" → `/cadastro?ref=whatsapp&trilha=[id]`

**Query:** `supabase.from('trilhas').select('*').eq('id', id)` — anon key, sem dados meteorológicos.

---

### `/perfil` — Perfil do usuário

Formulário de edição de dados pessoais com 3 estados de salvamento (`idle` / `success` / `error`).

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

### `/perfil/strava` — Integração Strava

Gerenciamento de segmentos Strava pessoais com sugestões do agente.

**Interações:**
- **Adicionar por URL:** extrai `segment_id` → chama `/api/strava/segments?id=[segment_id]` → salva em `trilhas_pessoais`
- **Remover:** `supabase.from('trilhas_pessoais').delete()`
- **Aceitar sugestão do agente:** `supabase.from('trilhas_pessoais').insert()` com dados pré-preenchidos
- **Rejeitar sugestão:** `supabase.from('strava_segmentos_config').delete()`

---

### `/planos` — Planos de assinatura

Página de planos com integração Stripe (em desenvolvimento).

**Libs:** `lib/stripe.ts` (instância do SDK) + `lib/stripe-config.ts` (IDs de produtos e preços por plano).

---

### `/admin` — Painel administrativo

Rota protegida: verifica `is_admin` no banco + redireciona para `/dashboard` se falso.

**Cards de navegação:**
- **Trilhas pendentes** — contador + `AdminPanel` inline
- **Sugestões Strava** — contador de sugestões pendentes
- **Tabelas Mestras** — badge vermelho com aprovações pendentes + link para `/admin/tabelas`

**1. Trilhas pendentes (`AdminPanel`):**
- Busca `trilhas_pendentes` onde `status = 'pendente'`
- **Aprovar:** geocodifica lat/lon via Nominatim → salva `localidade_id`. **Fallback:** se geocoding falhar, cria localidade mínima usando o campo `regiao` da trilha para garantir que `localidade_id` nunca fique nulo → insert em `trilhas` com `aprovada = true` + update `status = 'aprovada'`
- **Rejeitar:** modal com textarea de motivo → update `status = 'rejeitada', motivo_rejeicao`

**2. Sugestões Strava:**
- Cards comparativos: config atual vs. sugestão do agente
- Campos: solo_type · exposicao · trail_type · bioma

---

### `/admin/tabelas` — Tabelas Mestras

Painel de edição das tabelas mestras do modelo. **Todas as alterações requerem aprovação do outro admin** (fluxo dual-admin via `admin_aprovacoes`).

**4 tabs:**

| Tab | Tabela Supabase | Campos editáveis |
|---|---|---|
| Solo | `tabela_solo` | clay_pct, sand_pct, texture_class |
| Thresholds Sazonais | `threshold_sazonal` | threshold_descansado, threshold_saturado |
| Meia-vida de Secagem | `meia_vida_secagem` | meia_vida_h |
| Biomas | `biomas` | chuva_pct, vento_pct, sol_pct, fator_threshold, sazonalidade |

**Fluxo de edição:**
1. Admin edita o valor inline → modal de confirmação com diff antes/depois + motivo (mín. 20 chars)
2. "Enviar para aprovação" → insert em `admin_aprovacoes` com `solicitante_id` e `aprovador_id`
3. Linha marcada com badge "⏳ Pendente"
4. Outro admin aprova/rejeita na fila do topo da página

**Badge na Navbar:** link Admin mostra badge vermelho com contagem de aprovações pendentes.

---

## Web App — API Routes

### `GET /api/strava/auth`
Inicia o fluxo OAuth do Strava. Monta o `redirect_uri` dinamicamente a partir dos headers `x-forwarded-host`/`host` da requisição (evita hardcoding de domínio) e redireciona para `strava.com/oauth/authorize`.

### `GET /api/strava/callback`
Callback OAuth do Strava (usuário).
1. Troca `code` por `access_token`
2. Busca segmentos favoritos starred (`/api/v3/segments/starred?per_page=50`)
3. Filtra (kom_rank != null OU distance > 500m), limita a 15
4. Seta cookie `strava_token` (httpOnly, 1h) e redireciona para `/perfil/strava?segments=[JSON]`

### `GET /admin/importar-strava/callback`
Callback OAuth do Strava exclusivo do admin. Seta cookie `strava_admin_token` (httpOnly, 6h) e redireciona para `/admin/importar-strava`. O `redirect_uri` é montado com `window.location.origin` na página do admin.

### `GET /api/strava/segments`
Busca metadados de um segmento Strava individual por `?id=[segment_id]`.

### `POST /api/strava/disconnect`
Remove cookies `strava_access_token` e `strava_refresh_token`.

### `GET /auth/callback` (página client-side)
Callback Google OAuth. **Não é uma Route Handler** — é uma página React (`app/auth/callback/page.tsx`).
O `detectSessionInUrl` do `@supabase/ssr` processa o `?code=` automaticamente antes do `useEffect` ser chamado. A página chama `getSession()` e redireciona para `/dashboard`. Fallback: `onAuthStateChange` com timeout 10s → `/login?error=auth_failed`.

### `POST /api/openlandmap`
Proxy interno para consultas de composição de solo (uso interno — sem chamadas externas reais; rota mantida por compatibilidade com versões anteriores).

---

## Web App — Componentes

### `TrilhaCard`
Card de trilha usado em `/trilhas` e `/dashboard`.

**Exibe:** nome, região, bioma, trail_type, veredicto (borda colorida esquerda), aderência, chuva 48h, pico 3h, vento, frase de secagem, janela limpa, botão estrela de favorito.

**Cor da borda:** derivada do veredicto 12h (prioridade) ou 48h. Sem condição → borda cinza `#e5e5e5`.

---

### `TrailObservations`
Timeline vertical de avaliações de riders.

**Gate:** usuário precisa ter favoritado a trilha para publicar.

**Publicar:** `supabase.from('observacoes_trilha').insert({ trilha_id, user_id, estrelas, texto, veredicto_sistema })` — registra o veredicto do sistema no momento da avaliação.

**Edição (24h):** textarea pré-preenchida + `supabase.from('observacoes_trilha').update()`.

**Visual:** dot amarelo `#FFE000` para avaliações < 24h; dot cinza para antigas; linha vertical contínua.

---

### `Navbar`
Barra sticky. Oculta em `/`, `/login`, `/cadastro` e `/t/*`.

**Perfil assíncrono:** busca `is_admin`, `nome`, `apelido` e aprovações pendentes. Link Admin visível apenas quando `!loadingProfile && profile?.is_admin` — sem flicker. Badge vermelho se `pendingApprovals > 0`.

---

### `AdminPanel`
Lista `trilhas_pendentes` com `status = 'pendente'`. Grid de 9 campos + Maps link + modal de rejeição.

---

### `StravaMap` + `ElevationProfile`
- `StravaMap`: mapa Leaflet (`dynamic import, ssr: false`) com polyline decodificado para trilhas pessoais
- `ElevationProfile`: imagem estática da URL `strava_elevation_profile`; fallback em texto

---

### `PWAInstallPrompt`
Gerencia o prompt de instalação do PWA.
- **Android/Chrome:** captura `beforeinstallprompt` → botão "Instalar"
- **iOS/Safari:** detecta `userAgent` → instrução "Safari → Compartilhar → Adicionar à Tela de Início"

---

### `CondicaoCard`
Card detalhado de condição de uma trilha. Usado na página `/trilhas/[id]`.

Exibe previsão 24h em 4 blocos, aderência futura, alertas de vento, janela de pedal e dados de solo.

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

**`public/sw.js`:** Service Worker com cache-first strategy para assets estáticos (`/manifest.json`, `/icons/*.png`). Cache name: `mtb-forecaster-v2`. Navigation requests (`mode: 'navigate'`), rotas de auth (`/auth/`), `/api/`, `/login` e `/dashboard` são passadas diretamente sem cache para não interferir no fluxo OAuth.

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

## Banco de dados — Supabase

O banco tem **25 tabelas** organizadas em 5 grupos.

### Grupo 1 — Configuração do modelo (14 tabelas)

Todas com RLS habilitado, coluna `ativo`, carregadas em cache global na inicialização do agente.

| Tabela | Descrição |
|---|---|
| `enso_config` | Fases ENSO, intervalos ONI e multiplicadores sobre threshold sazonal |
| `aderencia_thresholds` | Limites de ef_combinado para SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA |
| `veredicto_pesos` | Pesos de risco por condição (aderencia_baixa, pico_3h_alto, vento_alto, etc.) |
| `veredicto_limiares` | Limiares de decisão: ≤1 → DROP LIBERADO, ≤3 → Veja alertas, >3 → MELHOR ESPERAR |
| `meia_vida_clima_mult` | Multiplicadores de secagem por temperatura, vento, nebulosidade, umidade e bikepark |
| `biomas` | Fonte única de verdade por bioma × exposição: coeficientes de dossel (chuva_pct, vento_pct, sol_pct), fator_threshold e sazonalidade |
| `configuracoes_sistema` | Chave-valor: email, parâmetros do modelo, coeficientes de scoring e altitude_bonus |
| `solo_type_config` | `fator_absorcao_base` e `score_mult` por tipo de solo |
| `inclinacao_config` | Penalizadores de absorção por inclinação calculada (graus) ou desnível bruto (metros) |
| `aderencia_descricoes` | 25 textos descritivos por (status × solo_type) exibidos no card da trilha |
| `threshold_sazonal` | Thresholds mensais de acúmulo efetivo por região (solo descansado e bikepark saturado) |
| `meia_vida_secagem` | Taxa base de secagem por (solo_type, exposicao) em horas |
| `tabela_solo` | Composição do solo: clay_pct, sand_pct, texture_class por (solo_type, bioma, regiao) |
| `microclima_config` | Mantida no BD por conservadorismo — **Python não lê mais esta tabela** (supersedida por `biomas`) |

---

### Grupo 2 — Dados operacionais principais (4 tabelas)

**`trilhas`** — trilhas oficiais aprovadas pelo admin.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Nome da trilha |
| `lat` / `lon` | numeric | Coordenadas decimais |
| `altitude_m` | numeric | Altitude média (m) |
| `solo_type` | text | terra · misto · misto_mg · preto · pedra · ferro |
| `exposicao` | text | aberta · fechada |
| `trail_type` | text | natural · bikepark |
| `regiao` | text | Sigla UF (SP, MG, ...) |
| `bioma` | text | Ex: Mata Atlântica |
| `desnivel_m` | numeric | Desnível total (m) |
| `extensao_km` | numeric | Extensão total (km) |
| `aprovada` | boolean | `true` para entrar no processamento do agente |
| `localidade_id` | uuid | FK para `localidades` (geocodificado na aprovação) |

**`trilhas_pendentes`** — trilhas submetidas por riders aguardando aprovação.

Mesmos campos de `trilhas` + `status` (pendente/aprovada/rejeitada) + `motivo_rejeicao` + `user_id`.

**`localidades`** — cache de geocodificação reversa (Nominatim / OpenStreetMap).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `lat` / `lon` | numeric | Coordenadas (chave de lookup) |
| `pais` | text | País |
| `estado` | text | Sigla UF (ISO 3166-2) |
| `cidade` | text | Cidade/município |
| `localidade` | text | Bairro, vila, subdistrito |

**`condicoes`** — condição atual por trilha, gravada a cada execução do agente.

Estratégia de escrita: DELETE + INSERT por `trilha_id` (evita conflito sem UNIQUE constraint).

| Coluna | Tipo | Descrição |
|---|---|---|
| `trilha_id` | uuid | FK para `trilhas` |
| `gerado_em` | timestamptz | Momento da geração (BRT) |
| `aderencia_status` | text | SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA |
| `aderencia_score` | numeric | Score 0–100 do modelo |
| `aderencia_desc` | text | Texto descritivo do status do solo |
| `aderencia_futura_status` | text | Status do pior bloco futuro de 6h |
| `aderencia_futura_label` | text | Rótulo do bloco (ex: `12h→18h`) |
| `aderencia_futura_rain` | numeric | Chuva prevista no bloco futuro (mm) |
| `veredicto` | text | DROP LIBERADO / DROP LIBERADO - Veja os alertas / MELHOR ESPERAR |
| `veredicto_12h` | text | Veredicto para as próximas 12h |
| `texto_dinamico` | text | Frase contextual do veredicto |
| `motivo_veredicto` | text | Fatores que levaram ao veredicto (ex: "Pico 3h elevado, BOA ADERÊNCIA") — exibido no card quando não há alertas específicos |
| `previsao_24h` | jsonb | Array de 4 blocos de 6h: `{label, rain_mm, pop_max, wind_max, temp_med}` |
| `rain_mm` | numeric | Chuva acumulada 24h (mm) — fusão OWM 70% + OM 30% |
| `rain_12h` | numeric | Chuva acumulada 12h (mm) |
| `pico_3h` | numeric | Maior acumulado em janela deslizante de 3h (mm) |
| `acumulo_48h` | numeric | Acúmulo bruto últimas 48h (mm) — Open-Meteo Archive |
| `acumulo_ef` | numeric | Acúmulo efetivo com decaimento exponencial (mm) |
| `wind_ms` | numeric | Velocidade máxima de vento 24h (m/s) |
| `wind_12h` | numeric | Velocidade máxima de vento 12h (m/s) |
| `gust_max_kmh` | numeric | Rajada máxima prevista 48h (km/h) |
| `temp_max` | numeric | Temperatura máxima prevista (°C) |
| `pop_48h` | numeric | Probabilidade de chuva 48h (%) |
| `pop_12h` | numeric | Probabilidade de chuva 12h (%) |
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
| `enso_fase` | text | Fase ENSO atual (El Niño Forte / El Niño / ENSO Neutro / La Niña / La Niña Forte) |
| `enso_oni` | numeric | Anomalia ONI da NOAA (col ANOM do arquivo oni.ascii.txt) |
| `fonte` | text | Fonte meteorológica: OpenWeather + Open-Meteo |
| `alerta_vento_nivel` | integer | Nível histórico de vento 1 (55–65) / 2 (65–90) / 3 (> 90 km/h) |
| `alerta_vento_kmh` | numeric | Vento sustentado máximo histórico ERA5 (km/h) |
| `alerta_rajada_kmh` | numeric | Rajada máxima futura prevista (km/h) |
| `fds_d1_veredicto` / `fds_d1_rain` / `fds_d1_wind` / `fds_d1_temp` | text/numeric | Previsão D+1 |
| `fds_d2_*` | text/numeric | Previsão D+2 |
| `fds_d3_*` | text/numeric | Previsão D+3 |

> A tabela `condicoes_strava` tem a mesma estrutura, com `strava_segment_id` como chave de DELETE+INSERT.

---

### Grupo 3 — Strava (3 tabelas)

**`strava_segmentos_config`** — sugestões automáticas de configuração geradas pelo agente, exibidas no painel admin para aprovação.

**`trilhas_pessoais`** — segmentos Strava vinculados por cada rider no `/perfil/strava`.

**`strava_config_sugestoes`** — log de sugestões de configuração processadas.

---

### Grupo 4 — Usuários (2 tabelas)

**`profiles`** — perfil público com 16+ colunas:

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | FK para `auth.users` |
| `nome` / `apelido` | text | Dados do rider |
| `email` | text | E-mail |
| `telefone` / `telefone_whatsapp` | text | Contato |
| `regiao` | text | Sigla UF |
| `telegram_username` | text | Handle do Telegram (ex: `@rider`) |
| `telegram_chat_id` | bigint | ID interno do Telegram (preenchido pelo bot) |
| `telegram_ativo` | boolean | Notificações Telegram habilitadas |
| `is_admin` | boolean | Acesso ao painel admin |
| `receber_email` | boolean | Ativa/desativa emails |
| `email_trilhas_favoritas` | boolean | Inclui favoritas no email |
| `email_trilhas_strava` | boolean | Inclui Strava no email |

**`favoritos`** — relação rider ↔ trilha com `user_id` + `trilha_id`.

---

### Grupo 5 — Conteúdo e moderação (2 tabelas)

**`observacoes_trilha`** — avaliações de riders com `strava_segment_id` (sem FK rígida), `estrelas`, `texto` (150 chars), `veredicto_sistema` (captura do veredicto no momento da avaliação), `created_at`. Editável pelo autor em 24h.

**`admin_aprovacoes`** — fila de aprovação dual para edição das tabelas mestras.

| Coluna | Tipo | Descrição |
|---|---|---|
| `solicitante_id` | uuid | Admin que fez a alteração |
| `aprovador_id` | uuid | Admin que precisa aprovar |
| `tabela` | text | tabela_solo / threshold_sazonal / meia_vida_secagem |
| `operacao` | text | update / insert |
| `dados_anteriores` | jsonb | Estado anterior |
| `dados_novos` | jsonb | Valores propostos |
| `status` | text | pendente / aprovada / rejeitada |
| `motivo_rejeicao` | text | Preenchido ao rejeitar |

---

## Agente Python — Pipeline completo

O agente `mtb-forecast.py` executa via GitHub Actions com schedule diferenciado por dia da semana (horários BRT):

| Dia | Execuções BRT |
|---|---|
| Seg – Qui | 07h |
| Sex | 07h · 13h · 21h |
| Sáb | 07h · 13h · 21h |
| Dom | 07h · 13h |

```
GitHub Actions (schedule por dia da semana + workflow_dispatch manual)
        │
        ▼
1. _validar_env()
   Verifica OPENWEATHER_API_KEY + SUPABASE_SERVICE_KEY
   Lança EnvironmentError se ausentes
        │
        ▼
2. Carregamento de tabelas de config (uma vez por execução)
   14 caches globais: enso_config, aderencia_thresholds, veredicto_pesos, veredicto_limiares,
   meia_vida_clima_mult, biomas, configuracoes_sistema, solo_type_config,
   inclinacao_config, score_config, aderencia_descricoes, threshold_sazonal,
   meia_vida_secagem, tabela_solo
   Cada cache: if cache: return cache → fetch Supabase → fallback hardcoded
        │
        ▼
3. fetch_oni_atual() → NOAA oni.ascii.txt
   Lê coluna ANOM (partes[3]) do arquivo de 4 colunas (SEAS YR TOTAL ANOM)
   Validação de formato em 3 camadas:
     Camada 1: header != 4 colunas → aviso
     Camada 2: partes[2] (SST) fora de 20–32°C → aviso + fallback
     Camada 3: partes[3] (ANOM) fora de -4..+4 → aviso + fallback
   Fallback: oni = 0.0 (ENSO Neutro, mult = 1.00)
        │
        ▼
4. _carregar_trilhas_supabase()
   Carrega trilhas com aprovada = true
   Fallback: lê trilhas.csv
        │
        ▼
5. proximos_dias() → D+1, D+2, D+3 em BRT
        │
        ▼
6. Para cada trilha — processar_trilha():
   ├── buscar_solo_openlandmap() → _lookup_solo(solo_type, bioma, regiao)
   │     Prioridade: exact match → solo+bioma+TODOS → solo+TODOS+TODOS → fallback
   │     Retorna: {clay_pct, sand_pct, texture_class}
   │
   ├── fetch_onecall() — previsão horária 48h (OWM, fonte primária, 70%)
   │
   ├── fetch_onecall_historico() — timemachine OWM: últimas 48h hora a hora
   │     Retorna: {meia_vida_h} (base × microclima × ajuste climático)
   │
   ├── fetch_historico_chuva_om() — Open-Meteo Archive ERA5 (última 48h)
   │     Calcula acumulo_ef via decaimento exponencial: Σ p × 0.5^(t/τ)
   │
   ├── fetch_openmeteo() — previsão horária 48h (OM, 30%)
   │
   ├── Fusão 70/30: rain = OWM×0.7 + OM×0.3 (rain, wind, pop, pico_3h)
   │
   ├── fetch_vento_historico() — ERA5 rajadas 48h → nível alerta 1/2/3
   │
   ├── calcular_aderencia() — score + status + descrição
   │     efetivo_combinado = acumulo_ef + pico_3h → lookup aderencia_thresholds
   │     Fator de recuperação: BAIXA → BOA se acumulo_ef < thresh × 2.5 e não saturado
   │     Regras bikepark: teto BOA se acumulo_ef < 5mm; saturado via threshold_bikepark_saturado
   │
   ├── calcular_aderencia_futura_oc() — pior bloco de 6h nas próximas 24h
   │
   ├── calcular_blocos_24h_oc() — 4 blocos de 6h para previsao_24h
   │
   ├── veredicto() — acumula risco → DROP LIBERADO / alertas / MELHOR ESPERAR
   │
   ├── calcular_janela_oc() — maior bloco limpo (pop<30%, rain<1mm/h, vento<15m/s)
   │
   ├── calcular_horarios_chuva_oc() — blocos com chuva (≥1mm/h ou pop≥40%)
   │
   ├── resumo_dia_oc() × 3 — D+1, D+2, D+3
   │     acumulo_ate(alvo): ef_decaido + chuva prevista até o dia alvo
   │
   └── Análise Claude AI — texto de secagem contextualizado por região e ENSO
        │
        ▼
7. _aplicar_override_chuva_futura()   ← pós-modelo, isolado, removível
   SE previsao_24h[0].rain_mm > 3mm OU previsao_24h[1].rain_mm > 3mm:
     SECO/GRIP PERFEITO → BOA ADERÊNCIA + DROP LIBERADO - Veja os alertas
     DROP LIBERADO limpo → DROP LIBERADO - Veja os alertas
     BAIXA ADERÊNCIA → intocado
        │
        ▼
8. gravar_supabase()
   DELETE /rest/v1/condicoes?trilha_id=eq.{id}
   POST   /rest/v1/condicoes (nova linha completa — ~45 campos)
        │
        ▼
9. processar_segmentos_strava()
   Mesmo pipeline (com override) → gravar_condicoes_strava()
   DELETE + POST em condicoes_strava por strava_segment_id
        │
        ▼
9. Notificações personalizadas
   Email: _buscar_usuarios_email() → profiles com receber_email = true
          envia email com favoritas e/ou Strava por usuário
          credenciais via configuracoes_sistema (email_from, email_password)
   Telegram: _buscar_usuarios_telegram() → profiles com telegram_ativo = true
             envia mensagem via Bot API por chat_id
        │
        ▼
10. Log e artefato
    tee → debug_YYYY-MM-DD.log
    Upload como artifact GitHub Actions (retido 30 dias)
```

---

## Modelo de solo e aderência

### 1. Composição do solo via `tabela_solo`

Lookup prioritário — sem chamadas HTTP externas:
```
1. Match exato:    solo_type + bioma + regiao
2. Bioma genérico: solo_type + bioma + regiao = NULL (wildcard)
3. Global:         solo_type + bioma = NULL + regiao = NULL (wildcard universal)
4. Fallback:       clay=32, sand=35, texture=Franco-argiloso
```

Com `clay_pct` disponível:
```python
base = 0.20 + (clay_pct / 100) × 1.60    # fator_absorcao
base = max(0.25, min(0.90, base))
# clay 10% → 0.36 | clay 40% → 0.84 | clay 70% → 0.90 (teto)
```

Sem `clay_pct`: usa `fator_absorcao_base` de `solo_type_config`.

### 2. Penalizadores de inclinação

Aplicados sobre `fator_absorcao_base` (first-match por id ascendente, mais restritivo primeiro):

| Tipo | Condição | Delta |
|---|---|---|
| `inclinacao` (calculada) | ≥ 30% | −0.22 |
| `inclinacao` (calculada) | 20–30% | −0.15 |
| `inclinacao` (calculada) | 10–20% | −0.08 |
| `desnivel` (fallback) | ≥ 800m | −0.18 |
| `desnivel` (fallback) | 500–800m | −0.10 |
| `desnivel` (fallback) | 300–500m | −0.05 |

`inclinacao_calculada = (desnivel_m / (extensao_km × 1000)) × 100`

### 3. Decaimento exponencial — acúmulo efetivo

```python
acumulo_ef = Σ precip_i × 0.5 ^ (horas_atras_i / meia_vida_h)
```

**Meia-vida base** por `(solo_type, exposicao)` em `meia_vida_secagem`:

| solo_type | aberta | fechada |
|---|---|---|
| terra | 24h | 36h |
| misto | 18h | 28h |
| misto_mg | 12h | 18h |
| preto | 14h | 24h |
| pedra | 6h | 10h |
| ferro | 8h | 14h |

**Multiplicadores climáticos** (tabela `meia_vida_clima_mult`):

| Variável | Condição | Mult |
|---|---|---|
| Temperatura | ≥ 35°C | × 0.65 |
| Temperatura | 30–35°C | × 0.75 |
| Temperatura | 26–30°C | × 0.86 |
| Temperatura | ≤ 16°C | × 1.12 |
| Vento | ≥ 40 km/h | × 0.75 |
| Vento | 20–40 km/h | × 0.85 |
| Vento | 10.8–20 km/h | × 0.92 |
| Vento | ≤ 3.6 km/h | × 1.05 |
| Combo (calor+vento) | temp ≥ 30°C + vento ≥ 20 km/h | × 0.80 adicional |
| Nebulosidade | ≥ 90% | × 1.12 |
| Nebulosidade | 70–90% | × 1.06 |
| Nebulosidade | ≤ 25% | × 0.94 |
| Umidade | ≥ 95% | × 1.15 |
| Umidade | 85–95% | × 1.08 |
| Umidade | ≤ 45% | × 0.93 |
| Bikepark fechado | — | × 0.60 |
| Bikepark aberto | — | × 0.35 |

**Coeficientes de dossel e microclima** (tabela `biomas`):

| Bioma | Exposição | chuva_pct | vento_pct | sol_pct | fator_threshold |
|---|---|---|---|---|---|
| Amazônia | fechada | 0.175 | 0.100 | 0.020 | 1.00 |
| Mata Atlântica | fechada | 0.225 | 0.125 | 0.035 | 0.90 |
| Mata Atlântica | fechada (≥ 600m) | 0.180 | 0.100 | 0.025 | 0.50 |
| Cerrado | fechada | 0.500 | 0.275 | 0.175 | 1.00 |

`chuva_pct`: fração da chuva que atravessa o dossel e chega ao solo. `vento_pct`: fração do vento medido na estação ao nível do solo. `sol_pct`: fração da radiação solar que chega ao solo (usada para calcular nebulosidade efetiva). `fator_threshold`: divisor do `efetivo_combinado` antes da comparação com os thresholds de aderência — valores < 1.0 tornam os limites mais rígidos.

**Clamp final:** `max(4h, min(72h, meia_vida))`

### 4. Thresholds sazonais + ENSO

Thresholds lidos de `threshold_sazonal` (por região + mês) e multiplicados pelo fator ENSO:

| Fase ENSO | ONI | Multiplicador |
|---|---|---|
| El Niño Forte | ≥ 1.5 | × 0.75 — threshold menor, mais conservador |
| El Niño | 0.5 a 1.5 | × 0.85 |
| Neutro | −0.5 a +0.5 | × 1.00 |
| La Niña | −1.5 a −0.5 | × 1.15 |
| La Niña Forte | ≤ −1.5 | × 1.25 |

`threshold_final = base_sazonal × enso_mult × fator_microclima(trail)`

### 5. Cálculo de score e aderência

```python
# Score de impacto
solo_descansado = acumulo_ef < threshold_final

if pico_3h >= 10mm:   # evento convectivo — tratado qualitativamente
    impacto = pico_3h × (0.7 se descansado | 1.0 se úmido)
else:
    impacto = rain_mm × 0.6              # solo descansado
    impacto = rain_mm + acumulo_ef × 0.3 # solo úmido

impacto × fator_absorcao
impacto × score_mult   (solo sem clay_pct — solo_type_config)
impacto × 0.90         (bikepark com acumulo_ef < 5mm)

score = max(0, min(100, impacto × 10))
```

**Thresholds de aderência** (tabela `aderencia_thresholds`):

Antes de comparar, `efetivo_combinado = acumulo_ef + pico_3h` é normalizado pelo `fator_microclima(trail)`:

```python
efetivo_threshold = efetivo_combinado / fator_microclima(trail)
```

Isso torna os thresholds efetivamente mais rígidos para trilhas em ambientes com mais retenção de umidade (Mata Atlântica fechada de altitude):

| Trilha | fator_threshold | GRIP → BOA | BOA → BAIXA |
|---|---|---|---|
| Mata Atlântica + alt ≥ 600m + fechada | 0.50 | > **1.5 mm** | > **3.5 mm** |
| Mata Atlântica (demais) | 0.90 | > **2.7 mm** | > **6.3 mm** |
| Outros / sem microclima | 1.00 | > 3.0 mm | > 7.0 mm |

Os thresholds fixos na tabela `aderencia_thresholds` são 0 / 3 / 7 mm. O ajuste microclimático não altera a tabela — é aplicado no código dividindo o efetivo antes da comparação (`efetivo_threshold = efetivo_combinado / fator_threshold`). Valores calibráveis via `biomas.fator_threshold` no Supabase (aba "Biomas" em `/admin/tabelas`).

**Fator de recuperação:** `BAIXA ADERÊNCIA → BOA ADERÊNCIA` se `acumulo_ef < threshold × 2.5` **e** não saturado. Multiplicador 2.5 lido de `configuracoes_sistema.aderencia_recovery_mult`.

**Regras de bikepark:**
- Saturado quando `acumulo_ef > threshold_bikepark_saturado` (threshold sazonal)
- Não saturado: teto em BOA ADERÊNCIA (cap quando `acumulo_ef < 5mm`)
- Saturado: permite BAIXA ADERÊNCIA sem teto; descrição especial `BIKEPARK_SATURADO`

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

| Total | Veredicto |
|---|---|
| ≤ 1 | DROP LIBERADO |
| 2–3 | DROP LIBERADO - Veja os alertas |
| ≥ 4 | MELHOR ESPERAR |

**Ranking em `/trilhas`:** veredicto 12h → desempate por `aderencia_score` ASC (menor score = melhor grip).

---

## Migração Supabase — Fases 1 a 5

Todo o modelo era hardcoded em Python. As 5 fases migraram os parâmetros para o Supabase, tornando-os editáveis sem alterar código.

### Fase 1 — `enso_config`, `aderencia_thresholds`, `veredicto_risco_pesos`
`supabase/migrations/fase1_enso_aderencia_veredicto.sql`

- `enso_config`: 5 fases ONI com multiplicadores — substitui `classificar_enso()` hardcoded
- `aderencia_thresholds`: limites ef_combinado → status — substitui `if/elif` em `calcular_aderencia()`
- `veredicto_risco_pesos`: pesos + limiares → veredicto — substitui `if/elif` em `veredicto()` *(refatorado na Fase 5)*

### Fase 2 — `meia_vida_clima_mult`, `microclima_config`
`supabase/migrations/fase2_meia_vida_clima_microclima.sql`

- `meia_vida_clima_mult`: 17 registros de multiplicadores climáticos — substitui `_ajustar_meia_vida_clima()` hardcoded
- `microclima_config`: 2 regras de Mata Atlântica — substitui lógica hardcoded em `fator_microclima()` e `_meia_vida()`
- `configuracoes_sistema` INSERT: `meia_vida_min=4`, `meia_vida_max=72`

### Fase 3 — `solo_type_config`, `inclinacao_config`, `score_config`
`supabase/migrations/fase3_solo_score_inclinacao.sql`

- `solo_type_config`: 6 tipos de solo com `fator_absorcao_base`, `score_mult`, altitude_bonus *(altitude_bonus movido na Fase 5)*
- `inclinacao_config`: 6 penalizadores por inclinação calculada e desnível bruto
- `score_config`: 9 coeficientes do modelo de score *(absorvido em `configuracoes_sistema` na Fase 5)*

### Fase 4 — `aderencia_descricoes`
`supabase/migrations/fase4_limpeza_fallbacks.sql`

- `aderencia_descricoes`: 25 textos (4 status × 6 solo_types + 1 bikepark saturado)
- `configuracoes_sistema` INSERT: `aderencia_recovery_mult=2.5`

### Fase 5 — Consolidação de schema
`supabase/migrations/fase5_consolidacao_schema.sql`

Foco: clareza semântica, remoção de dead code e normalização de convenções.

- **5A** `veredicto_risco_pesos` → `veredicto_pesos` + `veredicto_limiares`: separação de dois conceitos que viviam na mesma tabela com colunas nulláveis como seletor de tipo
- **5B** `microclima_config`: `mult_threshold` → `fator_threshold`, `mult_meia_vida` → `fator_secagem` (nomes refletem papel real: divisor e multiplicador)
- **5C** `inclinacao_config`: `grau_min`/`grau_max` → `valor_min`/`valor_max` (tipo `desnivel` armazena metros, não graus)
- **5D** `meia_vida_clima_mult`: removida coluna `condicao` (documentação nunca lida pelo código); removida linha `ativo=false` (dead code coberto pela regra ≤16°C)
- **5E** `aderencia_thresholds`: removida coluna `ordem` (redundante — `ef_min asc nulls first` já é a ordenação natural)
- **5F** `solo_type_config`: `altitude_bonus_min` e `altitude_bonus` movidos para `configuracoes_sistema` (valores idênticos nos 6 tipos — sem poder de calibração por tipo)
- **5G** `score_config` absorvida por `configuracoes_sistema`: adicionada coluna `grupo` para categorizar chaves; `score_config` dropada
- **5H** `tabela_solo`: sentinela `"TODOS"` → `NULL`; índice único recriado com `COALESCE` para tratar NULL como wildcard em PostgreSQL

---

## GitHub Actions — Workflow

Arquivo: `.github/workflows/mtb-forecast-workflow.yml`

### Gatilhos

```yaml
on:
  schedule:
    - cron: "0 10 * * *"      # 07h BRT — todos os dias (Seg–Dom)
    - cron: "0 16 * * 0,5,6"  # 13h BRT — Sex, Sáb, Dom
    - cron: "0 0 * * 0,6"     # 21h BRT — Sex (0h UTC Sáb) e Sáb (0h UTC Dom)
  workflow_dispatch:           # execução manual via UI do GitHub
```

### Steps do job

```yaml
- actions/checkout@v4
- actions/setup-python@v5        # Python 3.11
- run: pip install -r requirements.txt   # pytest + supabase SDK
- run: python mtb-forecast.py 2>&1 | tee debug_$(date +%Y-%m-%d).log
- actions/upload-artifact@v4     # if: always() — log retido 30 dias
```

### Variáveis de ambiente no job

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

## Configuração — Secrets e variáveis de ambiente

### GitHub Actions Secrets

| Secret | Obrigatório | Uso |
|---|---|---|
| `OPENWEATHER_API_KEY` | Sim | One Call 3.0 + timemachine histórico |
| `SUPABASE_SERVICE_KEY` | Sim | Leitura/gravação no Supabase (service_role) |
| `ANTHROPIC_API_KEY` | Recomendado | Claude AI — análise textual e frases de secagem |
| `TELEGRAM_BOT_TOKEN` | Opcional | Notificações por Telegram |

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
export TELEGRAM_BOT_TOKEN=seu_token  # opcional

python mtb-forecast.py
```

### Aplicar migrações Supabase

```bash
# Via Supabase CLI
supabase db push

# Ou manualmente no SQL Editor do Supabase Dashboard
# Arquivos em supabase/migrations/ na ordem:
# fase1_enso_aderencia_veredicto.sql
# fase2_meia_vida_clima_microclima.sql
# fase3_solo_score_inclinacao.sql
# fase4_limpeza_fallbacks.sql
```

---

## Como adicionar trilhas

### Via painel admin (recomendado)

Riders autenticados cadastram trilhas em `/trilhas/cadastrar`. A trilha entra em `trilhas_pendentes` com `status = 'pendente'` e aguarda aprovação em `/admin`. Na aprovação:
1. Geocodificação reversa via Nominatim salva `localidade_id` na trilha
2. Registro inserido em `trilhas` com `aprovada = true`

### Via SQL direto no Supabase

```sql
INSERT INTO trilhas (name, lat, lon, solo_type, exposicao, altitude_m, trail_type, regiao, desnivel_m, extensao_km, bioma, aprovada)
VALUES ('ZigZag - Campos do Jordão', -22.768683, -45.614767, 'preto', 'fechada', 1630, 'natural', 'SP', 480, 32, 'Mata Atlântica', true);
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

### Valores de `solo_type`

| Valor | Meia-vida base (aberta / fechada) | Quando usar |
|---|---|---|
| `terra` | 24h / 36h | Terra batida, barro, trilhas de mata |
| `misto` | 18h / 28h | Combinação de terra e pedra |
| `misto_mg` | 12h / 18h | Misto com minério — Quadrilátero Ferrífero |
| `preto` | 14h / 24h | Serapilheira sobre Cambissolos/quartzitos |
| `pedra` | 6h / 10h | Trilhas predominantemente rochosas |
| `ferro` | 8h / 14h | Solo ferruginoso — Quadrilátero Ferrífero |

> Valores de meia-vida carregados de `meia_vida_secagem` — editáveis via `/admin/tabelas`.

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
| [OpenWeather One Call 3.0](https://openweathermap.org/api/one-call-3) | Previsão horária 48h + timemachine histórico | Sim |
| [Open-Meteo Forecast](https://open-meteo.com) | Previsão horária 30% + rajada futura | Não |
| [Open-Meteo Archive](https://open-meteo.com/en/docs/historical-weather-api) | Precipitação e rajadas ERA5 últimas 48h | Não |
| [NOAA CPC](https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt) | Índice ONI para classificação ENSO | Não |
| [Anthropic Claude](https://console.anthropic.com) | Análise textual por região + frases de secagem | Sim |
| [Supabase](https://supabase.com) | Banco de dados + Auth (e-mail + Google OAuth) | Sim |
| [Strava API v3](https://developers.strava.com) | OAuth + segmentos favoritos starred | Sim |
| [Nominatim (OpenStreetMap)](https://nominatim.openstreetmap.org) | Geocodificação reversa na aprovação de trilhas | Não |
| [Telegram Bot API](https://core.telegram.org/bots/api) | Notificações personalizadas por chat_id | Sim |
| [Stripe](https://stripe.com) | Planos de assinatura | Sim |
| [Tabler Icons](https://tabler.io/icons) | Ícones vetoriais (webfont CDN) | Não |

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

Toda a lógica usa apenas stdlib Python 3.11 (`os`, `json`, `html`, `urllib`, `datetime`, `csv`, `time`, `smtplib`, `email.mime`). O SDK `supabase` é usado nos testes.

---

## Notas de versão

### Estado atual (branch develop)

**Override de veredicto por chuva prevista (`_aplicar_override_chuva_futura`):**
- Função pós-modelo, isolada e removível sem impacto no algoritmo principal.
- Se qualquer bloco de 6h das próximas 12h tiver `rain_mm > 3mm`: trilhas SECO/GRIP PERFEITO são forçadas para **BOA ADERÊNCIA + DROP LIBERADO - Veja os alertas**; veredicto DROP LIBERADO limpo sobe para "Veja os alertas". BAIXA ADERÊNCIA/MELHOR ESPERAR nunca são tocadas.
- Aplicada em trilhas públicas e segmentos Strava, antes de `gravar_supabase()`.
- Documenta o motivo: "chuva prevista nas próximas 12h — avalie as condições antes de pedalar".

**Fixes e melhorias aplicados:**
- **ONI parsing** (`fetch_oni_atual`): corrigido para ler `partes[3]` (ANOM) em vez de `partes[2]` (SST absoluto ~27°C). Bug causava classificação errada como "El Niño Forte" com ONI=27.28 em vez do correto ~0.11 (ENSO Neutro), tornando todos os thresholds 25% mais permissivos.
- **Bikepark recovery factor** (`calcular_aderencia`): adicionado `and not saturado` à condição de recuperação. Bug permitia downgrade incorreto de BAIXA → BOA ADERÊNCIA em bikepark saturado.
- **Validação de formato ONI** (`fetch_oni_atual`): 3 camadas — header com ≠ 4 colunas, SST fora de 20–32°C, anomalia fora de −4..+4. Detecta mudanças no formato do arquivo NOAA e cai em neutro com aviso no log.
- **Ajuste microclimático nos thresholds de aderência** (`calcular_aderencia`): trilhas em Mata Atlântica fechada de altitude tinham thresholds iguais a trilhas abertas, causando GRIP PERFEITO superestimado. O `efetivo_combinado` agora é dividido por `fator_threshold` antes da comparação. Com `fator_threshold=0.50` (Mata Atlântica alta fechada), GRIP→BOA ocorre em 1.5mm e BOA→BAIXA em 3.5mm. Calibrável via `microclima_config.fator_threshold` no Supabase.

**Migração Supabase concluída (Fases 1–5):**
- 14 caches de configuração no Supabase — zero parâmetros hardcoded no Python
- Fase 5: schema consolidado — `veredicto_risco_pesos` → `veredicto_pesos` + `veredicto_limiares`; `score_config` absorvida em `configuracoes_sistema`; colunas renomeadas para semântica clara; `tabela_solo` usa NULL em vez de `"TODOS"`
- `aderencia_thresholds`, `enso_config`, `veredicto_pesos` — editáveis sem alterar código

**Auth — migração `@supabase/ssr` completa:**
- Todos os route handlers migrados de `@supabase/auth-helpers-nextjs` para `@supabase/ssr` (`createServerClient` + padrão `getAll`/`setAll`). A migração parcial (apenas middleware) criava incompatibilidade de formato de cookie e causava 401 em rotas autenticadas.
- `getSession()` substituído por `getUser()` em todos os handlers (recomendação de segurança Supabase).
- Rotas migradas: `api/admin/strava-routes`, `api/admin/strava-segment`, `api/admin/planos-stats`, `api/stripe/checkout`, `api/stripe/portal`, `api/promo/resgatar`.

**Strava OAuth — redirect_uri dinâmico:**
- `api/strava/auth/route.ts`: `redirect_uri` derivado de `x-forwarded-host` em vez de variável de ambiente hardcoded. Resolve redirecionamento para domínio errado após OAuth.
- `admin/importar-strava/page.tsx`: `stravaAuthUrl` usa `window.location.origin + '/admin/importar-strava/callback'` em vez de env var apontando para callback de usuário.

**Trilhas aprovadas invisíveis — corrigido:**
- `admin/page.tsx` (`aprovar()`): se geocodificação Nominatim falhar, cria entrada mínima em `localidades` usando `regiao` da trilha como `estado`. Garante que `localidade_id` nunca fique nulo após aprovação.
- `trilhas/page.tsx`: filtro usa `t.localidades?.estado || t.regiao` como fallback, tornando trilhas com `localidade_id = null` visíveis no filtro por estado.

**Geocodificação de trilhas:**
- `lib/geocoding.ts`: `geocodeLatLon()` via Nominatim/OpenStreetMap
- Aprovação de trilha salva `localidade_id` na tabela `localidades` (cache de geocodificação)
- Estado extraído via `ISO3166-2-lvl4` para garantir sigla correta (SP, MG...)

**Telegram:**
- Bot com webhook `/start` captura `chat_id` e ativa notificações
- Notificações personalizadas pós-processamento por usuário
- Secret `TELEGRAM_BOT_TOKEN` no GitHub Actions

### V8.0 — Migração Supabase principal

- Trilhas carregadas do Supabase (`aprovada = true`) com fallback para CSV
- Tabelas mestras editáveis via `/admin/tabelas` com dupla aprovação dual-admin
- Email personalizado por usuário com base em preferências (`receber_email`, `email_trilhas_*`)
- Credenciais de email armazenadas em `configuracoes_sistema` (sem secret no Actions)
- DELETE+INSERT no lugar de upsert para evitar conflitos em `condicoes` e `condicoes_strava`

### V7.8

- Google OAuth: login e cadastro com Google — callback `/auth/callback`
- PWA: manifest.json · icon.svg · service worker · `PWAInstallPrompt`
- Cadastro manual de trilhas: `/trilhas/cadastrar` · `trilhas_pendentes` · admin com modal
- Compartilhamento por WhatsApp: botão + página pública `/t/[id]`
- Veredicto renomeado: `ATENÇÃO` → `DROP LIBERADO - Veja os alertas`
- Filtro de estado obrigatório em `/trilhas` com Suspense + URL sync
- Navbar estável com `loadingProfile` state (sem flicker)
- Mobile otimizado na página de detalhe

### V7.6

- `/trilhas/[id]` espelha o card do email do agente
- Aderência futura com label de bloco e chuva prevista
- Previsão 24h em 4 blocos de 6h com `previsao_24h` jsonb
- `texto_dinamico` contextual após veredicto
- D+1/D+2/D+3 com vento e temperatura

### V5.22–V5.24 (agente)

- Sazonalidade: thresholds derivados de ERA5-Land 30 anos
- ENSO Nível 3 via ONI NOAA — multiplicador sobre threshold sazonal
- Campo `bioma` com microclima Mata Atlântica (threshold 25% menor + meia-vida 20% maior)
- One Call API 3.0 como fonte primária (previsão horária 48h + timemachine)
- Modelo de secagem por decaimento exponencial com meia-vida por (solo_type, exposicao)
- Fusão 70% OWM + 30% Open-Meteo

---

*MTB Forecaster · Criado por Guilherme Leal e Douglas Santos · Saiba antes de pedalar*
