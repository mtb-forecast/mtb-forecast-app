# MTB Forecaster — Web App + Agente Python

Plataforma completa de monitoramento climático para trilhas de **Mountain Bike — DH, Enduro, XCC e XCM** no Brasil.

Composta por dois sistemas integrados:
- **Web App** — Next.js 14 App Router com autenticação (email + Google OAuth), favoritos, avaliações, integração Strava, cadastro manual de trilhas, compartilhamento por WhatsApp e PWA
- **Agente Python** — roda diariamente via GitHub Actions, coleta APIs meteorológicas, modela condição do solo com dados do Supabase e grava resultados no banco

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
- [Banco de dados — Supabase](#banco-de-dados--supabase)
- [Agente Python — Pipeline completo](#agente-python--pipeline-completo)
- [GitHub Actions — Workflow](#github-actions--workflow)
- [Configuração — Secrets e variáveis de ambiente](#configuração--secrets-e-variáveis-de-ambiente)
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
│  Open-Meteo Archive         │       (agente Python V8.0)              │
│  NOAA ONI (ENSO)            │                                         │
│  Claude AI (Anthropic)  ────┘    tabelas gravadas:                   │
│  GPT-3.5 (OpenAI)                condicoes · condicoes_strava         │
│                                                                       │
│  Configuração lida do Supabase:                                       │
│  tabela_solo · threshold_sazonal · meia_vida_secagem                 │
│  configuracoes_sistema (email credentials)                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Supabase (PostgreSQL + Auth + RLS)               │
│                                                                       │
│  trilhas · condicoes · condicoes_strava · favoritos                  │
│  profiles · trilhas_pessoais · observacoes_trilha                    │
│  strava_segmentos_config · trilhas_pendentes                         │
│  tabela_solo · threshold_sazonal · meia_vida_secagem                 │
│  configuracoes_sistema · admin_aprovacoes                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Web App (Next.js 14 App Router)                  │
│                                                                       │
│  /                    Landing page pública                            │
│  /login               E-mail + Google OAuth                          │
│  /cadastro            Cadastro completo (7 campos + Google OAuth)    │
│  /dashboard           Favoritas + Strava pessoais                    │
│  /trilhas             Listagem por estado (27 UFs) + busca + ranking │
│  /trilhas/[id]        Detalhe: condição + avaliações + compartilhar  │
│  /trilhas/cadastrar   Cadastro manual de trilha pelo rider           │
│  /t/[id]              Preview público (sem login) para WhatsApp      │
│  /perfil              Dados pessoais + preferências de email         │
│  /admin               Aprovações de trilhas + sugestões Strava       │
│  /admin/tabelas       Edição das tabelas mestras (dupla aprovação)   │
└─────────────────────────────────────────────────────────────────────┘
```

### Middleware de autenticação

`middleware.ts` protege todas as rotas autenticadas usando `createMiddlewareClient` do `@supabase/auth-helpers-nextjs`.

**Rotas públicas** (sem autenticação):
```
/login · /cadastro · /auth/callback · /t/
```

Qualquer outra rota redireciona para `/login` se não houver sessão ativa.

---

## Web App — Páginas e rotas

### `/` — Landing page

Página pública de apresentação. Não requer autenticação.

**Seções:**
1. **Hero split-screen** — painel preto com CTA "Criar conta grátis" + painel com imagem de trilha e cards mockup de condições
2. **Faixa amarela** com ticker de stats (trilhas, chuva 48h, meia-vida, atualização)
3. **Seção Strava** (fundo `#111`, stripe laranja) — integração com Strava, 2 colunas: texto à esquerda + cards mockup à direita
4. **Como funciona** — 3 cards: Chuva acumulada · Tipo de solo · Janela de pedal
5. **CTA final** — link para `/cadastro`

**Design system:** preto `#111` + amarelo `#FFE000` + stripe amarela 3px + fundo `#f7f7f5` + cards brancos + font `WheatSmile` para títulos

---

### `/login` — Autenticação

Formulário de login com suporte a **e-mail/senha** e **Google OAuth**.

**Fluxo e-mail:**
1. `supabase.auth.signInWithPassword({ email, password })`
2. Erro inline; sucesso redireciona para `/dashboard`

**Fluxo Google OAuth:**
1. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://mtb-forecast-app.vercel.app/auth/callback', queryParams: { access_type: 'offline', prompt: 'consent' } } })`
2. Supabase redireciona para Google → usuário autentica → Google retorna para `/auth/callback`
3. `/auth/callback` troca o código por sessão e redireciona para `/dashboard`

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
4. `supabase.from('profiles').upsert({ id, email, nome, apelido, telefone, telefone_whatsapp, telegram_username, regiao, is_admin: false })`
5. `localStorage.setItem('show-pwa-prompt', 'true')` — aciona o prompt de instalação PWA após cadastro
6. Redireciona para `/login` após 3 segundos (tela de sucesso com ✅)

**Redirect via WhatsApp:** quando URL contém `?ref=whatsapp&trilha=[id]`, redireciona para `/login?redirect=/trilhas/[id]` em vez de `/login` simples.

---

### `/dashboard` — Dashboard principal

Página autenticada. Mostra apenas trilhas pessoais do usuário (sem ranking regional).

**Steps de carregamento:**
1. `supabase.auth.getUser()` — redireciona para `/login` se não autenticado
2. `supabase.from('profiles').select('*')` — apelido, nome, região
3. `supabase.from('favoritos').select('trilha_id')` — IDs favoritos
4. Para cada favorito: `supabase.from('trilhas').select('*, condicoes(*)')` com condição mais recente
5. `supabase.from('trilhas_pessoais').select('*')` — segmentos Strava do usuário
6. Para cada trilha pessoal: `supabase.from('condicoes_strava').select(...)` — condição mais recente

**Seções:**
- **Banner de perfil incompleto** — exibido quando `nome`, `apelido`, `telefone` ou `regiao` estão ausentes; link para `/perfil`
- **Minhas trilhas favoritas** — grid de `TrilhaCard`; link "Ver todas em [estado]" → `/trilhas`
- **Minhas trilhas Strava** — cards com borda laranja `#FC4C02`

**Saudação:** usa `apelido` → `nome.split(' ')[0]` → `email.split('@')[0]`

**PWA:** renderiza `<PWAInstallPrompt />` na página.

---

### `/trilhas` — Listagem de trilhas

Listagem pública (autenticada) com filtro obrigatório por estado.
Implementada com `Suspense` boundary (`TrilhasContent` + `TrilhasPage`) para `useSearchParams()`.
Estado selecionado é persistido na URL: `/trilhas?estado=SP`.

**Comportamento sem estado selecionado:**
- Seção de dicas com fotos MTB (hover mostra dica)
- 4 cards "Como usar o app": Selecione estado · Favorite · Importe do Strava · Avalie
- Banner Strava com `ti-brand-strava` e texto explicativo
- Ícones via **Tabler Icons** (webfont CDN)

**Com estado selecionado:**
1. `supabase.from('trilhas').select('*, condicoes(*)')` com `aprovada = true` e `regiao = [estado]`
2. `supabase.from('favoritos').select('trilha_id')` — prepopula Set de favoritos
3. Busca local por nome (só exibida quando estado selecionado)
4. **Ranking** automático por: veredicto 12h (`DROP LIBERADO` → `DROP LIBERADO - Veja os alertas` → `MELHOR ESPERAR` → sem dados) e desempate por `aderencia_score` ASC

**Header:** botão "+ Cadastrar trilha" e seletor de estado.

---

### `/trilhas/cadastrar` — Cadastro manual de trilha

Formulário em 5 seções para riders cadastrarem novas trilhas. Submetidas para aprovação pelo admin.

**Seções do formulário:**

| Seção | Campos |
|---|---|
| Identificação | Nome, Estado (27 UFs) |
| Localização | URL Google Maps (extração automática de lat/lon), lat, lon |
| Características | Solo, Exposição, Tipo de trilha, Bioma, Altitude |
| Métricas | Desnível (m), Extensão (km) |
| Informações extras | Link referência (Trailforks, Wikiloc etc.), Observações |

**Extração automática de coordenadas** (`extrairCoordenadas`): suporta 4 formatos de URL do Google Maps:
- `/@lat,lon`
- `?q=lat,lon`
- `?ll=lat,lon`
- URLs de places (extração via regex do pathname)

**Submissão:** `supabase.from('trilhas_pendentes').insert({ ..., status: 'pendente', user_id })` — trilha fica aguardando aprovação.

**Tela de sucesso:** dois botões — "Ver minhas trilhas" → `/perfil` e "Cadastrar outra" → reset do formulário.

---

### `/trilhas/[id]` — Detalhe da trilha

Página completa da condição da trilha, espelhando o card do e-mail gerado pelo agente.

**Steps de carregamento:**
1. Verifica autenticação
2. `supabase.from('trilhas').select('*, condicoes(*)')` por `id` — trilha oficial
3. `supabase.from('favoritos')` — verifica favorito do usuário
4. Se não encontrada: tenta `supabase.from('trilhas_pessoais')` — trilha Strava pessoal
5. Se trilha Strava: `supabase.from('condicoes_strava')` — condição do segmento correspondente

**Seções exibidas:**

| Seção | Dados |
|---|---|
| Cabeçalho preto | nome, trail_type, região, bioma, desnível, extensão, inclinação colorida, texture/clay/sand, badges Quadrilátero |
| Aderência + veredicto | ADERÊNCIA ATUAL · ADERÊNCIA FUTURA [label] · veredicto + texto_dinamico |
| Mapa | iframe Google Maps satélite (ou StravaMap + ElevationProfile para Strava pessoal) |
| Condição do Solo | frase de secagem + chuva 48h bruto/efetivo + solo descansado/úmido + última chuva + meia-vida |
| Previsão 24h | 4 blocos de 6h com mm / % / m/s / °C; fallback 12h/24h |
| Pico 3h | só quando ≥ 5mm |
| Janela limpa | melhor janela calculada pelo agente |
| Alertas | rajada futura · vento histórico |
| Avaliações dos riders | timeline vertical com estrelas, texto 150 chars, edição em 24h |
| Próximos 3 dias | 3 cards D+1/D+2/D+3 com emoji + veredicto + chuva/vento/temp |
| Fontes | OpenWeather / ENSO / vento ERA5 |

**Botão WhatsApp:** abre `https://wa.me/?text=...` com link direto para `/t/[id]` e texto pré-formatado.
**Botão Favoritar:** estrela que faz upsert/delete em `favoritos`.
**Mobile:** layout otimizado com classes CSS responsivas via `globals.css`.

---

### `/t/[id]` — Preview público (sem login)

Página acessível **sem autenticação** para compartilhamento via WhatsApp. Não exibe dados meteorológicos.

**Layout:**
- Navbar simplificada: logo MTB FORECASTER + botão "Criar conta grátis" (link `/cadastro?ref=whatsapp&trilha=[id]`)
- Header preto com nome, badges (tipo, região, bioma, Quadrilátero) e dados físicos
- Google Maps embed
- **Seção bloqueada:** ícone `ti-lock` + CTA "Criar conta grátis" → `/cadastro?ref=whatsapp&trilha=[id]` + link "Já tenho conta — Entrar" → `/login?redirect=/trilhas/[id]`
- Rodapé: "MTB Forecaster · Condições de trilhas DH e Enduro em tempo real"

**Query:** `supabase.from('trilhas').select('*').eq('id', id)` — anon key, sem autenticação, sem condições meteorológicas.

---

### `/perfil` — Perfil do usuário

Formulário de edição de dados pessoais com 3 estados de salvamento (`idle` / `success` / `error`).

**Campos editáveis:** nome, apelido, e-mail (read-only + 🔒), telefone (máscara), checkbox WhatsApp, Telegram (prefixo `@` automático), região (27 estados).

**Steps de salvamento:**
1. `supabase.from('profiles').upsert({ id, nome, apelido, telefone, telefone_whatsapp, telegram_username, regiao })`
2. Botão exibe "Salvo ✓" por 2 segundos, depois retorna a "Salvar"

**Seção "Trilhas que cadastrei":** busca `trilhas_pendentes` do usuário com badges de 3 estados:
- `pendente` — aguardando aprovação
- `aprovada` — aprovada pelo admin
- `rejeitada` — exibe `motivo_rejeicao` inline

**Seção "Notificações por Email":** 3 toggles com auto-save:
- **Receber emails** — ativa/desativa todos os emails (`receber_email`)
- **Trilhas favoritas** — inclui condição das trilhas favoritadas (`email_trilhas_favoritas`)
- **Trilhas do Strava** — inclui condição dos segmentos Strava do usuário (`email_trilhas_strava`)

Cada toggle chama `supabase.from('profiles').update({ [field]: value })` e exibe "Preferências salvas" por 2 segundos.

**Seção Strava:** 
- Se `trilhasPessoais.length > 0`: link para `/perfil/strava` + botão "Desconectar Strava" que limpa `trilhas_pessoais`, `strava_segmentos_config` e chama `DELETE /api/strava/disconnect`
- Caso contrário: botão "Conectar com Strava" → `/api/strava/auth`

---

### `/perfil/strava` — Integração Strava

Gerenciamento de segmentos Strava pessoais com sugestões do agente.

**Steps de carregamento:**
1. `supabase.from('trilhas_pessoais').select('*')` — segmentos salvos pelo usuário
2. `supabase.from('strava_segmentos_config').select('*')` — sugestões do agente

**Interações:**
- **Adicionar por URL:** extrai `segment_id` via regex → chama `/api/strava/segments?id=[segment_id]` → salva em `trilhas_pessoais`
- **Remover:** `supabase.from('trilhas_pessoais').delete()`
- **Aceitar sugestão do agente:** `supabase.from('trilhas_pessoais').insert()` com dados pré-preenchidos
- **Rejeitar sugestão:** `supabase.from('strava_segmentos_config').delete()`

**Badge:** fundo amarelo `#FFE000` com texto "Sugerido pela API"

---

### `/admin` — Painel administrativo

Rota protegida: verifica `is_admin` no banco + redireciona para `/dashboard` se falso.

**Cards de navegação:**
- **Trilhas pendentes** — contador + link para `AdminPanel` inline
- **Sugestões Strava** — contador de sugestões pendentes
- **Tabelas Mestras** — card com badge vermelho de aprovações pendentes + link para `/admin/tabelas`

**Seções:**

**1. Trilhas pendentes (AdminPanel):**
- Busca `trilhas_pendentes` onde `status = 'pendente'`
- Exibe 9 campos + Google Maps link + link_referencia + observacoes
- **Aprovar:** insert em `trilhas` + update `status = 'aprovada'`
- **Rejeitar:** modal com textarea de motivo → update `status = 'rejeitada', motivo_rejeicao`

**2. Sugestões Strava:**
- Cards comparativos: config atual vs. sugestão do agente
- Campos: solo_type · exposicao · trail_type · bioma
- **Aprovar:** update em `strava_segmentos_config` + marca como aprovada
- **Rejeitar:** marca como rejeitada

---

### `/admin/tabelas` — Tabelas Mestras

Painel de edição das três tabelas mestras do modelo. **Todas as alterações requerem aprovação do outro admin antes de serem aplicadas** (fluxo dual-admin via `admin_aprovacoes`).

**3 tabs:**

| Tab | Tabela Supabase | Campos editáveis |
|---|---|---|
| Solo | `tabela_solo` | clay_pct, sand_pct, texture_class |
| Thresholds Sazonais | `threshold_sazonal` | threshold_descansado, threshold_saturado |
| Meia-vida de Secagem | `meia_vida_secagem` | meia_vida_h |

**Legenda em cada tab:** card explicativo com descrição de todos os campos, notas de uso (TODOS/DEFAULT, prioridade de lookup, fatores ENSO, escala de referência de meia-vida).

**Fluxo de edição:**
1. Rider admin clica "Editar" em uma linha
2. Altera o valor inline (input numérico ou select)
3. Clica "Salvar" → abre modal de confirmação com diff antes/depois, linha de impacto estimado e campo de motivo (mín. 20 caracteres)
4. Clica "Enviar para aprovação" → insere em `admin_aprovacoes` com `solicitante_id` e `aprovador_id` (outro admin)
5. Linha fica marcada com badge "⏳ Pendente" — não editável até resolução

**Fila de aprovações (topo da página):** exibe registros onde `aprovador_id = user.id AND status = 'pendente'`. Cada item mostra quem solicitou, tabela, diff de campos, timestamp. Botões "Aprovar" (executa update/insert + marca 'aprovada') e "Rejeitar" (input de motivo + marca 'rejeitada').

**Badge na Navbar:** link Admin mostra badge vermelho com contagem de aprovações pendentes onde o usuário é `aprovador_id`.

---

## Web App — API Routes

### `GET /api/strava/auth`

Inicia o fluxo OAuth do Strava. Redireciona para:
```
https://www.strava.com/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=read,activity:read
```

**Env vars:** `NEXT_PUBLIC_STRAVA_CLIENT_ID`, `NEXT_PUBLIC_STRAVA_REDIRECT_URI`

---

### `GET /api/strava/callback`

Callback OAuth do Strava após autorização.

**Steps:**
1. Lê `code` da query string
2. POST para `https://www.strava.com/oauth/token` com `client_id`, `client_secret`, `code`, `grant_type: authorization_code`
3. Usa o `access_token` para buscar segmentos favoritos: `GET https://www.strava.com/api/v3/segments/starred?per_page=50`
4. Filtra: `kom_rank != null` OU `distance > 500m`; limita a 15 segmentos
5. Extrai por segmento: `id, name, distance, total_elevation_gain, elevation_high, start_latlng, end_latlng, city, state, country, polyline (map.summary_polyline)`
6. Serializa em JSON → passa como query param `?segments=...` para `/perfil/strava`
7. Seta cookie `strava_token` (httpOnly, maxAge 3600s)

**Env vars:** `NEXT_PUBLIC_STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`

---

### `GET /api/strava/segments`

Busca metadados de um segmento Strava individual por ID.

**Query param:** `?id=[segment_id]`

**Env vars:** `STRAVA_CLIENT_SECRET` (usa cookie `strava_token`)

---

### `POST /api/strava/disconnect`

Desconecta o Strava do usuário. Remove cookies `strava_access_token` e `strava_refresh_token`.

```typescript
// Chamado pelo botão "Desconectar Strava" no /perfil
// Antes da chamada: apaga trilhas_pessoais + strava_segmentos_config do usuário
cookieStore.delete('strava_access_token')
cookieStore.delete('strava_refresh_token')
```

---

### `GET /auth/callback`

Callback de autenticação Google OAuth. Troca o `code` por sessão Supabase.

```typescript
await supabase.auth.exchangeCodeForSession(code)
// redireciona para https://mtb-forecast-app.vercel.app/dashboard
```

Usa `createRouteHandlerClient` do `@supabase/auth-helpers-nextjs`.

---

## Web App — Componentes

### `TrilhaCard`

Card de trilha usado em `/trilhas`, `/dashboard` e buscas.

**Exibe:** nome, região, bioma, trail_type, veredicto (borda colorida à esquerda via `VEREDICTO_CONFIG`), aderência, chuva 48h, pico 3h, vento, frase de secagem, janela limpa, botão estrela de favorito.

**Cor da borda:** derivada do veredicto 12h (prioridade) ou 48h. Sem condição → borda cinza `#e5e5e5`.

---

### `TrailObservations`

Timeline vertical de avaliações de riders.

**Gate:** usuário precisa ter favoritado a trilha para publicar. Se não favoritou, exibe botão "Favoritar trilha" que faz insert em `favoritos` sem sair da página.

**StarSelector:** estado `hovered` local — estrela preenchida se `i < (hovered || value)`. Mobile: `font-size: 20px` via classe `.star-selector-star`.

**Publicar:** `supabase.from('observacoes_trilha').insert({ trilha_id, user_id, estrelas, texto, veredicto_sistema })` — registra o veredicto atual do sistema no momento da avaliação.

**Edição (24h):** textarea pré-preenchida + `supabase.from('observacoes_trilha').update()`.

**Visual:** dot amarelo `#FFE000` para avaliações < 24h; dot cinza para antigas; linha vertical contínua.

---

### `Navbar`

Barra sticky (`position: sticky; top: 0; z-index: 100`). Oculta em `/`, `/login`, `/cadastro` e `/t/*`.

**Perfil assíncrono:**
```typescript
const [profile, setProfile] = useState<Profile | null>(null)
const [loadingProfile, setLoadingProfile] = useState(true)
const [pendingApprovals, setPendingApprovals] = useState(0)
```
Usa `supabase.auth.getUser()` + busca `is_admin, nome, apelido`. Se admin, consulta `admin_aprovacoes` onde `aprovador_id = user.id AND status = 'pendente'` para o badge.

O link Admin só aparece quando `!loadingProfile && profile?.is_admin` — sem flicker durante carregamento. Badge vermelho exibido se `pendingApprovals > 0`, em desktop e mobile.

**`onAuthStateChange`:** re-executa `fetchProfile()` completo ao mudar estado de autenticação.

---

### `AdminPanel`

Lista trilhas em `trilhas_pendentes` com `status = 'pendente'`.

**Props:**
```typescript
onAprovar: (p: TrilhaPendente) => Promise<void>
onRejeitar: (id: string, motivo: string) => Promise<void>
```

Exibe grid de 9 campos + Google Maps link + link_referencia + observacoes + modal de rejeição com textarea obrigatória.

---

### `StravaMap` + `ElevationProfile`

Renderizados apenas para trilhas pessoais com polyline.

- `StravaMap`: mapa Leaflet (`dynamic import, ssr: false`) com polyline decodificado
- `ElevationProfile`: imagem estática da URL `strava_elevation_profile`; fallback com desnível e extensão em texto

---

### `PWAInstallPrompt`

Componente client-side que gerencia o prompt de instalação do PWA.

**Lógica:**
1. Verifica `localStorage.getItem('pwa-dismissed')` — skip se dispensado
2. Verifica `localStorage.getItem('show-pwa-prompt')` — exibe logo após cadastro
3. **Android/Chrome:** captura evento `beforeinstallprompt` → botão "Instalar" chama `deferredPrompt.prompt()`
4. **iOS (Safari):** detecta via `/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())` → exibe instrução "Safari → Compartilhar → Adicionar à Tela de Início"

---

## PWA — Progressive Web App

O app é instalável como PWA em Android e iOS.

### Arquivos

**`public/manifest.json`**
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

**`public/icons/icon.svg`** — 512×512px, fundo preto com bordas arredondadas, "MTB" amarelo + "FORECASTER" cinza.

**`public/sw.js`** — Service Worker com cache-first strategy para:
```
/ · /dashboard · /trilhas · /manifest.json · /icons/icon.svg
```
Cache name: `mtb-forecaster-v1`

**`app/layout.tsx`** — registra o SW e inclui meta tags Apple Web App.

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
/perfil/strava
  Rider configura cada segmento (solo, exposição, tipo, bioma)
  Salva em trilhas_pessoais
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
| `strava_url` | construído: `https://www.strava.com/segments/{id}` |
| `solo_type`, `exposicao`, `trail_type`, `bioma` | configurado pelo rider na UI |
| `regiao` | derivado de `s.state` |

### Env vars necessárias

```env
NEXT_PUBLIC_STRAVA_CLIENT_ID=...
NEXT_PUBLIC_STRAVA_REDIRECT_URI=https://mtb-forecast-app.vercel.app/api/strava/callback
STRAVA_CLIENT_SECRET=...
```

---

## Banco de dados — Supabase

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `trilhas` | Trilhas oficiais aprovadas pelo admin |
| `condicoes` | Condição atual por trilha — DELETE+INSERT por `trilha_id` |
| `condicoes_strava` | Condição de segmentos Strava — DELETE+INSERT por `strava_segment_id` |
| `favoritos` | Trilhas favoritas (`user_id` + `trilha_id`) |
| `profiles` | Perfil público: apelido, telefone, região, `is_admin`, preferências de email |
| `trilhas_pessoais` | Segmentos Strava vinculados pelo rider |
| `observacoes_trilha` | Avaliações de riders com estrelas, texto e veredicto do sistema |
| `strava_segmentos_config` | Sugestões automáticas de configuração geradas pelo agente |
| `trilhas_pendentes` | Trilhas submetidas por riders aguardando aprovação |
| `tabela_solo` | Composição do solo por solo_type + bioma + regiao (tabela mestra) |
| `threshold_sazonal` | Thresholds de chuva por regiao + mes (tabela mestra) |
| `meia_vida_secagem` | Taxa de secagem por solo_type + exposicao (tabela mestra) |
| `configuracoes_sistema` | Configurações chave-valor: credenciais de email, parâmetros do agente |
| `admin_aprovacoes` | Fila de aprovação dual entre admins para edição de tabelas mestras |

---

### Tabela `trilhas_pendentes`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK para `auth.users` |
| `name` | text | Nome da trilha |
| `regiao` | text | Sigla do estado (UF) |
| `lat` / `lon` | numeric | Coordenadas decimais |
| `altitude_m` | numeric | Altitude em metros |
| `solo_type` | text | Tipo de solo |
| `exposicao` | text | `aberta` ou `fechada` |
| `trail_type` | text | `natural` ou `bikepark` |
| `bioma` | text | Ex: `Mata Atlântica` |
| `desnivel_m` | numeric | Desnível total (m) |
| `extensao_km` | numeric | Extensão total (km) |
| `link_referencia` | text | URL Trailforks / Wikiloc etc. |
| `observacoes` | text | Informações adicionais do rider |
| `status` | text | `pendente` · `aprovada` · `rejeitada` |
| `motivo_rejeicao` | text | Preenchido pelo admin ao rejeitar |
| `created_at` | timestamptz | Automático |

---

### Tabela `profiles` — campos de email

| Coluna | Tipo | Descrição |
|---|---|---|
| `receber_email` | boolean | Ativa/desativa envio de email personalizado |
| `email_trilhas_favoritas` | boolean | Inclui condição das trilhas favoritadas |
| `email_trilhas_strava` | boolean | Inclui condição dos segmentos Strava pessoais |

---

### Tabelas mestras do modelo

**`tabela_solo`** — composição do solo com prioridade de lookup:
1. Match exato: `solo_type + bioma + regiao`
2. Match por bioma: `solo_type + bioma + TODOS`
3. Match global: `solo_type + TODOS + TODOS`

| Coluna | Tipo | Descrição |
|---|---|---|
| `solo_type` | text | terra, misto, misto_mg, preto, pedra, ferro |
| `bioma` | text | Mata Atlântica, Cerrado, TODOS... |
| `regiao` | text | SP, MG, TODOS... |
| `clay_pct` | numeric | % de argila (0–100) |
| `sand_pct` | numeric | % de areia (0–100) |
| `texture_class` | text | Argiloso, Franco, Arenoso... |

**`threshold_sazonal`** — thresholds mensais por região:

| Coluna | Tipo | Descrição |
|---|---|---|
| `regiao` | text | UF ou DEFAULT (fallback) |
| `mes` | int | 1–12 |
| `threshold_descansado` | numeric | mm abaixo do qual o solo é descansado |
| `threshold_saturado` | numeric | mm acima do qual o bike park é saturado |

**`meia_vida_secagem`** — taxa de secagem:

| Coluna | Tipo | Descrição |
|---|---|---|
| `solo_type` | text | Tipo de solo |
| `exposicao` | text | aberta / semi-aberta / fechada |
| `meia_vida_h` | numeric | Horas para perder metade da umidade (6–36h) |

**`configuracoes_sistema`** — chave-valor para o agente:

| Chave | Descrição |
|---|---|
| `email_from` | Endereço remetente do email |
| `email_password` | Senha do email (Gmail App Password) |
| `email_smtp_host` | Host SMTP (padrão: smtp.gmail.com) |
| `email_smtp_port` | Porta SMTP (padrão: 587) |

**`admin_aprovacoes`** — fila de aprovação dual:

| Coluna | Tipo | Descrição |
|---|---|---|
| `solicitante_id` | uuid | Admin que fez a alteração |
| `aprovador_id` | uuid | Admin que precisa aprovar |
| `tabela` | text | tabela_solo / threshold_sazonal / meia_vida_secagem |
| `operacao` | text | update / insert |
| `dados_anteriores` | jsonb | Estado anterior da linha |
| `dados_novos` | jsonb | Valores propostos |
| `status` | text | pendente / aprovada / rejeitada |
| `motivo_rejeicao` | text | Preenchido ao rejeitar |

---

### Colunas da tabela `condicoes`

| Coluna | Tipo | Descrição |
|---|---|---|
| `trilha_id` | uuid | FK para `trilhas` — chave de DELETE+INSERT |
| `gerado_em` | timestamptz | Momento da geração |
| `aderencia_status` | text | SECO / GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA |
| `aderencia_score` | numeric | Score 0–100 do modelo |
| `aderencia_futura_status` | text | Status futuro previsto |
| `aderencia_futura_label` | text | Label do bloco futuro (ex: `06h→12h`) |
| `aderencia_futura_rain` | numeric | Chuva prevista no bloco futuro (mm) |
| `veredicto` | text | DROP LIBERADO / DROP LIBERADO - Veja os alertas / MELHOR ESPERAR |
| `veredicto_12h` | text | Veredicto para as próximas 12h |
| `texto_dinamico` | text | Frase contextual do veredicto |
| `previsao_24h` | jsonb | Array de 4 blocos de 6h: `{label, rain_mm, pop_max, wind_max, temp_med}` |
| `rain_mm` | numeric | Chuva acumulada 24h (mm) |
| `rain_12h` | numeric | Chuva acumulada 12h (mm) |
| `pico_3h` | numeric | Maior acumulado em janela deslizante de 3h (mm) |
| `acumulo_48h` | numeric | Acúmulo bruto últimas 48h (mm) |
| `acumulo_ef` | numeric | Acúmulo efetivo com decaimento exponencial (mm) |
| `wind_ms` | numeric | Velocidade máxima de vento 24h (m/s) |
| `wind_12h` | numeric | Velocidade máxima de vento 12h (m/s) |
| `gust_max_kmh` | numeric | Rajada máxima prevista 48h (km/h) |
| `temp_max` | numeric | Temperatura máxima prevista (°C) |
| `pop_48h` | numeric | Probabilidade de chuva 48h (%) |
| `pop_12h` | numeric | Probabilidade de chuva 12h (%) |
| `janela` | text | Melhor janela para pedal |
| `horarios_chuva` | text | Horários com chuva prevista (JSON) |
| `frase_secagem` | text | Frase descritiva do estado do solo (GPT-3.5) |
| `solo_descansado` | boolean | `true` se `acumulo_ef < threshold` |
| `thresh_desc` | numeric | Threshold de solo descansado calculado |
| `meia_vida_h` | numeric | Meia-vida de secagem ajustada (horas) |
| `clay_pct` | numeric | Teor de argila via tabela_solo (%) |
| `sand_pct` | numeric | Teor de areia (%) |
| `texture_class` | text | Classificação textural USDA (ex: Argiloso, Franco) |
| `inclinacao` | numeric | Inclinação média calculada (%) |
| `ultima_chuva_h` | numeric | Horas desde a última chuva significativa |
| `enso_fase` | text | Fase ENSO atual (El Niño / Neutro / La Niña) |
| `enso_oni` | numeric | Índice ONI da NOAA |
| `fonte` | text | Fonte meteorológica principal |
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

> A tabela `condicoes_strava` tem a mesma estrutura, com `strava_segment_id` como chave de DELETE+INSERT em vez de `trilha_id`.

---

## Agente Python — Pipeline completo

O agente `mtb-forecast.py` (V8.0) é executado diariamente pelo GitHub Actions e grava resultados no Supabase.

```
GitHub Actions (cron 05:00 BRT ou sexta 21:00 BRT)
        │
        ▼
Step 1 — _carregar_trilhas_supabase()
  Carrega trilhas aprovadas do Supabase (aprovada=true)
  Fallback: lê trilhas.csv se Supabase falhar
        │
        ▼
Step 2 — _validar_env()
  Verifica variáveis obrigatórias: OPENWEATHER_API_KEY + SUPABASE_SERVICE_KEY
  Lança EnvironmentError se ausentes
        │
        ▼
Step 3 — Carrega tabelas mestras do Supabase (uma vez por execução)
  _carregar_configuracoes() → _CACHE_CONFIG {chave: valor}
  _carregar_tabela_solo()   → _CACHE_TABELA_SOLO + fallback hardcoded
  _carregar_threshold_sazonal() → _CACHE_THRESHOLD {regiao: {mes: (desc, sat)}}
  _carregar_meia_vida()     → _CACHE_MEIA_VIDA {(solo_type, exposicao): h}
        │
        ▼
Step 4 — proximos_dias()
  Calcula datas D+1, D+2, D+3 em BRT
        │
        ▼
Step 5 — Lookup de solo via tabela mestra — por trilha
  buscar_solo_openlandmap() chama _lookup_solo(solo_type, bioma, regiao)
  Prioridade: exact match → solo+bioma+TODOS → solo+TODOS+TODOS → fallback hardcoded
  Retorna: {clay_pct, sand_pct, texture_class}
  Sem chamadas HTTP externas — dados 100% do Supabase
        │
        ▼
Step 6 — fetch_oni_noaa()
  Fonte: NOAA CPC / oni.ascii.txt
  Multiplicadores ENSO sobre threshold de solo descansado:
    El Niño Forte (≥1.5) → ×0.75
    El Niño (≥0.5)       → ×0.85
    Neutro               → ×1.00
    La Niña (≤−0.5)      → ×1.15
    La Niña Forte (≤−1.5)→ ×1.25
        │
        ▼
Step 7 — processar_trilha() — por trilha
  ├── fetch_onecall() — previsão horária 48h (OW, 70%)
  ├── fetch_onecall_historico() — timemachine 3×: −48h, −24h, 0h
  ├── fetch_openmeteo() — previsão horária 48h (OM, 30%)
  ├── fetch_vento_historico() — ERA5 últimas 48h → nível alerta 1/2/3
  ├── Fusão 70/30: rain_mm, pico_3h, wind_ms, pop, gust_max_kmh
  ├── calcular_aderencia() — decaimento exponencial + score
  ├── calcular_aderencia_futura_oc() — pior bloco de 6h futuro
  ├── calcular_blocos_24h_oc() — 4 blocos de 6h para previsao_24h
  ├── veredicto() — pontuação de risco → DROP LIBERADO / veja os alertas / MELHOR ESPERAR
  ├── calcular_janela_oc() — maior bloco limpo (pop<30%, rain<1mm/h, vento<15m/s)
  ├── calcular_horarios_chuva_oc() — blocos com chuva (≥1mm/h ou pop≥40%)
  ├── resumo_dia_oc() × 3 — D+1, D+2, D+3
  └── gerar_analise_secagem_gpt() — frase GPT-3.5 (fallback local)
        │
        ▼
Step 8 — gravar_supabase() — por trilha
  DELETE /rest/v1/condicoes?trilha_id=eq.{id}
  POST   /rest/v1/condicoes (nova linha completa)
        │
        ▼
Step 9 — processar_segmentos_strava()
  Busca strava_segmentos_config → mesmo pipeline → gravar_condicoes_strava()
  DELETE /rest/v1/condicoes_strava?strava_segment_id=eq.{id}
  POST   /rest/v1/condicoes_strava
        │
        ▼
Step 10 — Email personalizado por usuário
  _buscar_usuarios_email() — profiles onde receber_email=true
  Para cada usuário:
    _buscar_favoritos_usuario(user_id) → IDs das trilhas favoritas
    _buscar_strava_usuario(user_id)    → segmentos Strava
    enviar_email_usuario() — email com trilhas favoritas e/ou Strava
  Credenciais de email via _get_config("email_from") → configuracoes_sistema
        │
        ▼
Step 11 — Log e artefato
  tee → debug_YYYY-MM-DD.log (upload como artifact no GitHub Actions, 30 dias)
```

---

## GitHub Actions — Workflow

Arquivo: `.github/workflows/mtb-forecast-workflow.yml`

### Gatilhos

```yaml
on:
  schedule:
    - cron: "0 8 * * *"   # 05:00 BRT todos os dias
    - cron: "0 0 * * 6"   # Sexta às 21:00 BRT (Sábado 00:00 UTC)
  workflow_dispatch:        # execução manual via UI do GitHub
```

### Steps do job

```yaml
- actions/checkout@v4
- actions/setup-python@v5   # Python 3.11 — só stdlib, sem pip install
- run: python mtb-forecast.py 2>&1 | tee debug_$(date +%Y-%m-%d).log
- actions/upload-artifact@v4  # if: always() — log retido 30 dias
```

---

## Configuração — Secrets e variáveis de ambiente

### GitHub Actions Secrets

| Secret | Obrigatório | Uso |
|---|---|---|
| `OPENWEATHER_API_KEY` | Sim | One Call 3.0 + timemachine |
| `SUPABASE_SERVICE_KEY` | Sim | Leitura/gravação no Supabase (service_role) |
| `ANTHROPIC_API_KEY` | Recomendado | Claude AI — análise textual regional |
| `OPENAI_API_KEY` | Opcional | GPT-3.5 — frases de secagem; fallback local se ausente |

> `SUPABASE_URL` é fixo no workflow (hardcoded) e não precisa de secret.

> Credenciais de email (`email_from`, `email_password`) são armazenadas na tabela `configuracoes_sistema` do Supabase — não precisam de secret no Actions.

### Next.js — `.env.local`

```env
# Supabase (obrigatório)
NEXT_PUBLIC_SUPABASE_URL=https://[projeto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui

# Strava OAuth (obrigatório para integração Strava)
NEXT_PUBLIC_STRAVA_CLIENT_ID=seu_client_id
NEXT_PUBLIC_STRAVA_REDIRECT_URI=https://mtb-forecast-app.vercel.app/api/strava/callback
STRAVA_CLIENT_SECRET=seu_client_secret
```

> O web app usa apenas a **anon key** com Row Level Security do Supabase. A `service_role key` é usada exclusivamente pelo agente Python.

### Variáveis Vercel

Configure em **Vercel → Settings → Environment Variables** as mesmas do `.env.local`.

Para Google OAuth, configure também em **Supabase → Authentication → Providers → Google** com Client ID e Client Secret do Google Cloud Console.

---

## Desenvolvimento local

### Pré-requisitos

- Node.js 18+
- Python 3.11+
- Conta no [Supabase](https://supabase.com)
- Conta no [Strava API](https://www.strava.com/settings/api) (opcional — para integração Strava)

### Instalação

```bash
# 1. Clonar o repositório
git clone https://github.com/mtb-forecast/mtb-forecast-app.git
cd mtb-forecast-app

# 2. Instalar dependências
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
export OPENWEATHER_API_KEY=sua_chave
export SUPABASE_SERVICE_KEY=sua_service_key
export ANTHROPIC_API_KEY=sua_chave   # opcional
export OPENAI_API_KEY=sua_chave      # opcional

python mtb-forecast.py
```

O agente usa apenas Python 3.11+ stdlib — **nenhum `pip install` necessário**.

---

## Como adicionar trilhas

### Via Supabase (preferido — V7.9+)

Trilhas aprovadas na tabela `trilhas` do Supabase são carregadas automaticamente pelo agente. O campo `aprovada = true` é obrigatório para que a trilha entre no processamento.

```sql
INSERT INTO trilhas (name, lat, lon, solo_type, exposicao, altitude_m, trail_type, regiao, desnivel_m, extensao_km, bioma, aprovada)
VALUES ('ZigZag - Campos do Jordão - SP', -22.768683, -45.614767, 'preto', 'fechada', 1630, 'natural', 'SP', 480, 32, 'Mata Atlântica', true);
```

### Via formulário web (riders)

Riders autenticados podem cadastrar trilhas em `/trilhas/cadastrar`. Após submissão, a trilha entra em `trilhas_pendentes` com `status = 'pendente'` e aguarda aprovação pelo admin no `/admin`.

### Via CSV (fallback)

Se o Supabase estiver indisponível, o agente faz fallback para `trilhas.csv` na mesma pasta:

```csv
name;lat;lon;solo_type;exposicao;altitude_m;trail_type;desnivel_m;extensao_km;regiao;bioma
ZigZag - Campos do Jordao - SP;-22.768683;-45.614767;preto;fechada;1630;natural;480;32;SP;Mata Atlântica
DH Heineken short - Itabirito - MG;-20.224394;-43.971293;ferro;aberta;1445;bikepark;93;0.40;MG;
```

---

## Campos da trilha (CSV)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | Sim | Nome da trilha |
| `lat` | float | Sim | Latitude decimal (negativo para sul) |
| `lon` | float | Sim | Longitude decimal (negativo para oeste) |
| `solo_type` | string | Sim | Tipo de solo — ver tabela abaixo |
| `exposicao` | string | Sim | `aberta` ou `fechada` |
| `altitude_m` | int | Sim | Altitude média em metros |
| `trail_type` | string | Sim | `natural` ou `bikepark` |
| `regiao` | string | Sim | Sigla UF: AC, AL, AM... SP, TO (27 estados + DF) |
| `desnivel_m` | float | Não | Desnível total em metros |
| `extensao_km` | float | Não | Extensão total em km |
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

> Os valores de meia-vida são carregados da tabela `meia_vida_secagem` do Supabase. Os valores acima são referência — edite via `/admin/tabelas`.

> `ferro` e `misto_mg` exibem automaticamente o badge **Quadrilátero Ferrífero**.

### Valores de `exposicao`

| Valor | Quando usar |
|---|---|
| `fechada` | Mata densa, sombra, pouca ventilação |
| `aberta` | Campos, chapadas, cristas, bike parks sem cobertura |

> Threshold alerta de rajada: ≥ 30 km/h (aberta) · ≥ 50 km/h (fechada)

---

## Lógica de análise do solo

### 1. Composição do solo via tabela mestra (`tabela_solo`)

O agente não faz mais chamadas HTTP externas para composição do solo. Os dados são lidos do Supabase na inicialização (`_carregar_tabela_solo()`) e consultados por lookup prioritário:

```python
# _lookup_solo(solo_type, bioma, regiao)
# 1. Match exato:    solo_type + bioma + regiao
# 2. Bioma genérico: solo_type + bioma + TODOS
# 3. Global:         solo_type + TODOS + TODOS
# Retorna: {clay_pct, sand_pct, texture_class}

base = 0.20 + (clay_pct / 100) × 1.60
base = max(0.25, min(0.90, base))
# clay 10% → 0.36 | clay 40% → 0.84 | clay 70% → 0.90 (teto)
```

### 2. Modelo de secagem — decaimento exponencial

```python
acumulo_ef = Σ precip_hora × 0.5 ^ (horas_atras / meia_vida)
```

Meia-vida lida da tabela `meia_vida_secagem` e ajustada por multiplicadores climáticos:

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

| Score | Status |
|---|---|
| < 10 | SECO |
| 10–35 | GRIP PERFEITO |
| 35–70 | BOA ADERÊNCIA |
| ≥ 70 | BAIXA ADERÊNCIA |

### 4. Thresholds sazonais + ENSO

Os thresholds são lidos da tabela `threshold_sazonal` do Supabase e multiplicados pelo fator ENSO (via NOAA ONI):

| Fase ENSO | ONI | Multiplicador |
|---|---|---|
| El Niño Forte | ≥ 1.5 | × 0.75 (threshold menor = mais conservador) |
| El Niño | ≥ 0.5 | × 0.85 |
| Neutro | −0.5 a +0.5 | × 1.00 |
| La Niña | ≤ −0.5 | × 1.15 |
| La Niña Forte | ≤ −1.5 | × 1.25 |

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
| Vento histórico nível 3 (> 90 km/h) | +2 |
| Vento histórico nível 2 (65–90 km/h) | +1 |
| Vento histórico nível 2 + solo encharcado | +1 adicional |
| Vento histórico nível 1 (55–65 km/h) + encharcado | +1 |
| Rajada futura ≥ 30 km/h (aberta) | risco mínimo = 2 |
| Rajada futura ≥ 50 km/h (fechada) | risco mínimo = 2 |
| Aderência futura pior (+2 graus) | +2 |
| Aderência futura pior (+1 grau) | +1 |
| Aderência futura melhor | −1 |

| Total | Veredicto |
|---|---|
| ≤ 1 | DROP LIBERADO |
| 2–3 | DROP LIBERADO - Veja os alertas |
| ≥ 4 | MELHOR ESPERAR |

### Ranking no web app (`/trilhas`)

Ordenado por veredicto 12h, desempate por `aderencia_score` ASC:
```
DROP LIBERADO (0) → DROP LIBERADO - Veja os alertas (1) → MELHOR ESPERAR (2) → sem dados (3)
aderencia_score menor = melhor grip
```

---

## APIs utilizadas

| API | Uso | Requer cadastro |
|---|---|---|
| [OpenWeather One Call 3.0](https://openweathermap.org/api/one-call-3) | Previsão horária 48h + timemachine | Sim |
| [Open-Meteo Forecast](https://open-meteo.com) | Previsão horária 30% + rajada futura | Não |
| [Open-Meteo Archive](https://open-meteo.com/en/docs/historical-weather-api) | Rajadas ERA5 últimas 48h | Não |
| [NOAA CPC](https://www.cpc.ncep.noaa.gov) | Índice ONI para classificação ENSO | Não |
| [Anthropic Claude](https://console.anthropic.com) | Análise textual por região | Sim |
| [OpenAI GPT-3.5](https://platform.openai.com) | Frases de secagem por trilha | Sim |
| [Supabase](https://supabase.com) | Banco de dados + Auth (e-mail + Google OAuth) | Sim |
| [Strava API v3](https://developers.strava.com) | OAuth + segmentos favoritos starred | Sim |
| [Tabler Icons](https://tabler.io/icons) | Ícones vetoriais (webfont CDN) | Não |

---

## Dependências

### Web App

```json
"next": "14.x",
"react": "18.x",
"@supabase/auth-helpers-nextjs": "^0.10.0",
"@supabase/supabase-js": "^2.x",
"leaflet": "^1.9.x",
"tailwindcss": "3.x",
"typescript": "^5"
```

**Externas (CDN):**
- `@tabler/icons-webfont@latest` — ícones vetoriais

### Agente Python

Apenas stdlib Python 3.11 — **zero `pip install`**:

`os · json · html · urllib.request · urllib.error · datetime · csv · pathlib · time · smtplib · email.mime`

---

## Notas de versão

### V8.0 — atual

- **Composição do solo via Supabase:** `buscar_solo_openlandmap()` não faz mais chamadas HTTP externas. Dados lidos da tabela `tabela_solo` do Supabase com lookup prioritário (exact → bioma+TODOS → TODOS)
- **Thresholds sazonais via Supabase:** `_carregar_threshold_sazonal()` substitui o dict hardcoded `_THRESHOLD_SAZONAL_REGIONAL`. Editável via `/admin/tabelas`
- **Meia-vida via Supabase:** `_carregar_meia_vida()` substitui a tabela `_MEIA_VIDA_SECAGEM` hardcoded. Editável via `/admin/tabelas`
- **Configurações de email via Supabase:** `_carregar_configuracoes()` lê `email_from`, `email_password`, `email_smtp_host` da tabela `configuracoes_sistema`. Sem variáveis de ambiente para email
- **Email personalizado por usuário:** `_buscar_usuarios_email()` busca profiles com `receber_email=true`, envia email com trilhas favoritas e/ou Strava conforme preferências individuais
- **Painel `/admin/tabelas`:** edição das 3 tabelas mestras com dupla aprovação entre admins, fila de aprovação, modal com diff e impacto estimado, card de legenda em cada tab
- **Badge de aprovações pendentes na Navbar:** admin vê contador em tempo real de aprovações aguardando
- **DELETE+INSERT no lugar de upsert:** evita erro de conflict sem UNIQUE constraint nas tabelas `condicoes` e `condicoes_strava`

### V7.9

- **Trilhas do Supabase:** `_carregar_trilhas_supabase()` carrega trilhas aprovadas do Supabase em vez do CSV. Fallback para `trilhas.csv` se indisponível
- **Botão "Desconectar Strava"** no perfil: limpa `trilhas_pessoais` + `strava_segmentos_config` + cookie
- **Preferências de email no perfil:** 3 toggles com auto-save (`receber_email`, `email_trilhas_favoritas`, `email_trilhas_strava`)

### V7.8

- **Veredicto renomeado:** `ATENÇÃO` → `DROP LIBERADO - Veja os alertas` em todo o sistema
- **Google OAuth:** login e cadastro com Google — callback route `/auth/callback`
- **PWA:** manifest.json · icon.svg · service worker · `PWAInstallPrompt` (Android + iOS)
- **Cadastro manual de trilhas:** `/trilhas/cadastrar` · tabela `trilhas_pendentes` · admin com modal de rejeição
- **Compartilhar por WhatsApp:** botão verde na página de detalhe + página pública `/t/[id]`
- **Lista completa de estados:** 27 estados + DF (`ESTADOS_BRASIL`)
- **Filtro de estado obrigatório em `/trilhas`:** com Suspense boundary + URL sync (`?estado=SP`)
- **Dashboard simplificado:** apenas favoritas + trilhas Strava pessoais
- **Navbar estável:** link Admin com `loadingProfile` state — sem flicker
- **Ícones Tabler:** webfont CDN
- **Mobile otimizado** na página de detalhe

### V7.7

- Envio de email por região desativado — agente grava exclusivamente no Supabase
- `_validar_env()` exige `OPENWEATHER_API_KEY` + `SUPABASE_SERVICE_KEY`

### V7.6

- Sync web app ↔ email: `/trilhas/[id]` espelha o card do email
- Aderência futura com label de bloco e chuva prevista
- Previsão 24h em 4 blocos de 6h
- `texto_dinamico` após veredicto
- D+1/D+2/D+3 com vento e temperatura

### V7.5

- Segmentos Strava como entidade única (não por usuário)
- `strava_segmentos_config`: sugestões automáticas do agente
- Painel admin: comparação rider vs. sugestão

### V5.22–V5.24

- Sazonalidade: thresholds derivados de ERA5-Land 30 anos
- ENSO Nível 3 via ONI NOAA
- Campo `bioma` com microclima Mata Atlântica
- One Call API 3.0 como fonte principal
- Modelo de secagem por decaimento exponencial

---

*MTB Forecaster V8.0 · Criado por Guilherme Leal e Douglas Santos · Saiba antes de pedalar*
