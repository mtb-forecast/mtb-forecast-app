## Histórico de chuva — arquitetura e lições (jun/2026)

### Bug original (resolvido)
Histórico de chuva divergia da realidade. Causa raiz tripla, confirmada em log de produção:
1. **Lag de assimilação do Open-Meteo**: o `past_days` do `/v1/forecast` usa análise de
   modelo (NWP), não pluviômetro. Chuva de madrugada só aparece no OM horas depois.
   Flagrado em 22 trilhas em 11/06/2026 (ex: Reserva Natural Park OW=9.1mm vs OM=0.2mm).
2. **Instabilidade de rede no runner do GitHub Actions**: chamadas individuais ao OM
   falhavam em massa (SSL handshake timeout / DNS resolution), zerando histórico
   silenciosamente.
3. **One Call 3.0 `/timemachine` retorna 1 ÚNICA hora por chamada** (diferente da API 2.5).
   As 3 chamadas (offsets 0/24/48h) amostravam 3 horas de 48 — NUNCA usar timemachine
   como fonte de precipitação acumulada.

### Arquitetura atual (não regredir)
- **Precipitação histórica**: Open-Meteo batch (primário, horário ERA5) + OpenWeather
  `/data/3.0/onecall/day_summary` hoje+ontem (detector de lag).
  Regra: se `ow_chuva_solo_mm > om_chuva_solo_48h_mm + 1.0mm` → lag detectado → soma a diferença ao
  efetivo com peso 0.9 (conservador, protege o rider de falso "solo seco").
- **`chuva_penetracao` (interceptação de dossel, via `_lookup_bioma`) DEVE ser aplicado a
  TODAS as fontes antes de qualquer comparação/max()**. Comparar chuva crua de uma
  fonte com chuva interceptada de outra infla o histórico em mata fechada.
- **Open-Meteo em batch**: 1 chamada de forecast + 1 de histórico (ERA5) + 1 de
  nowcast ICON seamless cobrem todos os grupos de clima (multi-coordenada:
  `latitude=a,b,c&longitude=x,y,z` → resposta vira array; com 1 coordenada é
  objeto único — tratar ambos). Fallback para chamadas individuais com retry se o
  batch falhar.
- **Nowcast bridge ICON seamless** (`_fetch_om_nowcast_bridge`): 3ª chamada batch,
  `past_hours=6&forecast_days=0&models=icon_seamless`. Corrige lag de 4–6h do ERA5
  para chuva convectiva recente. Overlay: para cada hora nos últimos 6h, aplica
  `precips[idx] = max(era5_val, nowcast_val)`. Resultado cacheado em
  `_CACHE_OM_NOWCAST_RAW` por `local_key`. **Nunca modificar `precips` in-place**
  — fazer `precips = list(precips)` (cópia) antes do overlay para não corromper o
  cache ERA5 global.
- **Clima histórico (temp/vento/nuvens/umidade)**: vem do batch histórico do OM
  (48 amostras horárias, corte em `agora`). Timemachine OW foi REMOVIDO — suas
  3 amostras caíam sempre no mesmo horário do dia, enviesando temperatura média
  para baixo e inflando a meia-vida de secagem.
  Atenção: OM entrega vento em km/h; converter para m/s antes de
  `_ajustar_meia_vida_clima` quando necessário; verificar unidade no campo do endpoint.

### Regras invioláveis de chuva
- NUNCA reintroduzir timemachine como fonte de precipitação.
- NUNCA comparar acumulados de fontes sem normalizar `chuva_penetracao` em ambas.
- O zero-rain shortcircuit foi REMOVIDO em jun/2026 (ver git history).
  Não recriar otimizações que pulem o histórico com base em forecast=0 —
  forecast zero não prova ausência de chuva passada. Com o batch OM a economia
  de chamadas é irrelevante. Se quota de API um dia exigir cortes, a condição
  segura olha o day_summary GRAVADO da execução anterior, nunca o forecast.
- `precipitation` (= rain + showers + snow) é o campo canônico no OM; nunca usar
  só `rain` (perde pancadas convectivas) nem somar rain + precipitation (dupla
  contagem).

### Quota de API por execução (133 trilhas, 23 grupos)
OM: **3 chamadas batch** (forecast + histórico ERA5 + nowcast ICON). OWM: ~46 day_summary + ~23 onecall forecast ≈ 69.
Limite One Call 3.0 free: 1.000/dia. 4 execuções/dia ≈ 284 — folga confortável.

### Validação
- 11/06/2026: lag capturado em produção em 22 trilhas, números coerentes com CGE.

---

## Modelo regional (jun/2026)

### `_UF_MACRO_REGIAO` e `_macro_regiao(uf)`
- Dict mapeia todos os 27 UFs para 5 macro-regiões: NORTE, NORDESTE, CENTRO-OESTE, SUDESTE, SUL
- Função `_macro_regiao(uf)` converte UF → string macro-região. Fallback: "SUDESTE"

### `meia_vida_secagem` com coluna `regiao`
- Tabela agora tem coluna `regiao` com valores: `DEFAULT` + 5 macro-regiões
- Chave de lookup: `(solo_type, exposicao, regiao)`
- Cascata: exact match de regiao → DEFAULT
- **Valores `terra/fechada`**: DEFAULT=36h · SUL=46h · NORTE=56h · NORDESTE=23h · CENTRO-OESTE=31h

### `threshold_sazonal` com macro-regiões
- Tabela agora tem entradas por macro-região além de UF específico
- Cascata: UF específico → macro-região → DEFAULT
- UFs com entrada própria: SP, MG, RJ, SC, RS, PR

### `enso_regional_mult` (nova tabela)
- ENSO phase × macro-região → multiplicador
- NORTE, NORDESTE e CENTRO-OESTE têm **lógica INVERSA** ao SUL:
  - El Niño = seca (amazônica/nordestina/Cerrado) = threshold SOBE = modelo mais conservador (mult > 1.0)
  - La Niña = chuva = threshold DESCE = modelo mais permissivo (mult < 1.0)
- SUL: El Niño 0.69–0.79, La Niña 1.22–1.37
- NORTE: El Niño 1.18–1.25, La Niña 0.75–0.85
- NORDESTE: El Niño 1.25–1.35, La Niña 0.70–0.80
- CENTRO-OESTE: El Niño 1.08–1.12, La Niña 0.88–0.92 (efeito mais moderado que Norte/Nordeste,
  mas mesma direção — Cerrado também seca no El Niño)

### `_enso_mult_regional(enso, uf)`
- Substitui o `enso["mult"]` genérico de `enso_config`
- Consulta `enso_regional_mult` por `(fase_raw, macro_regiao)`
- Se não encontrado: fallback para `enso["mult"]` genérico da `enso_config`
- `classificar_enso()` agora retorna `fase_raw` (ex: "neutro", "el_nino", "la_nina")

### Regras invioláveis do modelo regional
- NUNCA usar o mult genérico de `enso_config` diretamente quando há `enso_regional_mult`
- NORTE/NORDESTE/CENTRO-OESTE têm lógica ENSO inversa — não "corrigir" esses multiplicadores para < 1.0 em El Niño
- A cascata de threshold (UF → macro → DEFAULT) é obrigatória — sem pular níveis

---

## Feature: Mantenedor (jun/2026)

### Estado atual (tudo implementado)
- Tabela `mantenedores`: nome, nome_primario, nome_secundario,
  cor_primaria, cor_secundaria, logo_url, site_url, ativo
  (`icone` foi REMOVIDO do código e do banco em 11/06/2026)
- FK mantenedor_id em trilhas, join nas queries
- Tipo Mantenedor em lib/types.ts (sem icone)
- Componente LogoMantenedor: exibe nome com cores dinâmicas
  · contexto='card': pill escuro #1e2018, nome_primario + nome_secundario
  · contexto='pagina': sem pill, sobre header escuro, com link ↗ site_url
- logo_url: `<img>` nativo (NÃO next/image — domínio Supabase fora de remotePatterns)
  · Na hero da página /mantenedores/[id]: exibe à esquerda do nome se preenchido
  · Se null: nome aparece sem elemento gráfico ao lado
- Upload de logo: API route app/api/admin/upload-logo/route.ts
  · UI do admin comprime canvas → WebP antes do upload
  · Bucket 'logos' no Supabase Storage
- Página pública /mantenedores/[id]: hero + grid de TrilhaCards (pública, sem auth)
- Select "Mantenedores / Bike Park" em /trilhas → navega para /mantenedores/[id]
- Card de dicas de mantenedores na área de onboarding de /trilhas
- Interface admin: cadastro/edição com preview ao vivo

### Regras
- Mantenedor sempre opcional — null nunca quebra card ou página
- Não alterar lógica de condições, veredicto, solo ou modelo meteorológico
- NUNCA usar next/image para logo_url — usar `<img>` nativo

---

## Modelo de secagem — garoa e dias frios/nublados (jun/2026)

### Multiplicadores em `meia_vida_clima_mult` (Supabase)
- `umidade` ≥ 95% → 1.25 (era 1.15)
- `umidade` 85–95% → 1.18 (era 1.08)
- `nebulosidade` ≥ 90% → 1.20 (era 1.12)
- `umidade_nebulosidade_combo` → 1.10 *(nova linha — combo garoa)*

### Lógica em `_ajustar_meia_vida_clima()`
Após aplicar umidade individualmente, verifica combo simultâneo:
- condição: `humidity_pct >= 85` **e** `cloud_pct >= 70`
- busca linha `umidade_nebulosidade_combo` e aplica `meia_vida *= combo_garoa`
- se a linha não existir na tabela, passa sem efeito (seguro)

Efeito máximo empilhado em dia de garoa fria: base × 1.25 × 1.20 × 1.10 ≈ **× 1.65**

### Motivação
Dias com garoa persistente não acumulam mm significativos mas mantêm solo úmido.
Os multiplicadores individuais de umidade e nebulosidade já existiam; o combo
captura a interação — céu fechado + ar saturado = secagem muito mais lenta.

---

## Colunas de auditoria em `condicoes` (jun/2026)

Novas colunas adicionadas para facilitar diagnóstico e calibração:
- `cloud_pct` NUMERIC(5,1) — cobertura de nuvens (%) durante período histórico
- `humidity_pct` NUMERIC(5,1) — umidade relativa média (%)
- `temp_media_c` NUMERIC(5,1) — temperatura média (°C)
- `meia_vida_base_h` NUMERIC(5,1) — meia-vida base antes dos multiplicadores climáticos

Gravadas em toda execução de pipeline completo. Usadas para diagnóstico: comparar
`meia_vida_h / meia_vida_base_h` mostra o impacto total dos multiplicadores climáticos.

---

## Frontend — regras de source-of-truth (jun/2026)

### Cores e prioridade de veredicto (`TrilhaCard.tsx`, `DashboardTrailCard.tsx`)

As funções `topBarColor()` e `verdictStyle()` devem aplicar prioridade:
**EVITAR > ALERTA > LIBERADO** (case-insensitive, usar `.toUpperCase()`)

```typescript
// CORRETO
if (v.toUpperCase().includes('ESPERAR') || v.toUpperCase().includes('EVITAR')) return 'red'
if (v.toUpperCase().includes('ALERTA')) return 'yellow'
if (v.toUpperCase().includes('LIBERADO')) return 'green'
```

Nunca usar comparação exata de string para veredicto — o texto pode conter sufixos.

### Badge de solo (`CondicaoCard.tsx`)

- `badgeSolo` retorna `null` para `GRIP PERFEITO` — badge oculto quando grip perfeito
- Exibe "Solo seco" APENAS quando:
  - `aderencia_status === 'SECO'` OU
  - `acumuloAgora < 0.3mm`
- `isAlertaVeredicto` usa `.toUpperCase().includes('ALERTA')` (não match exato)

### Drift de acumulo_ef no frontend

O `CondicaoCard.tsx` recalcula `acumulo_ef` com drift desde `gerado_em`:
```typescript
const efAgora = acumulo_ef * Math.pow(0.5, horasSince / meia_vida_h)
```
Nunca exibir o valor bruto de `condicoes.acumulo_ef` — sempre aplicar drift.

---

## Nowcast bridge — regras de implementação (jun/2026)

- **3ª chamada batch OM**: `past_hours=6&forecast_days=0&models=icon_seamless` — corrige lag ERA5 de 4–6h
- **Overlay take-max**: `precips[idx] = max(era5_val, nowcast_val)` — nunca substituir, sempre pegar o maior
- **NUNCA modificar o array do cache ERA5 in-place** — sempre `precips = list(precips)` antes do overlay
- Cache separado `_CACHE_OM_NOWCAST_RAW` por `local_key` — independente do cache ERA5
- Validado em 23/06/2026: capturou +14.3mm de chuva convectiva que o ERA5 ainda não tinha assimilado

---

## Biomas — calibração Mata Atlântica fechada (jun/2026)

### Split por altitude_min
A tabela `biomas` tem **duas linhas** para Mata Atlântica fechada:
- **id=9**: `altitude_min=600`, `tolerancia_bioma=0.50`, `sol_penetracao=0.025`
  (alto: Serra da Mantiqueira, Campos do Jordão — solo drena menos, mais conservador)
- **id=8**: `altitude_min=NULL` (fallback <600m), `tolerancia_bioma=0.70`, `sol_penetracao=0.015`
  (litoral/baixada — neblina marítima, umidade permanente)

`_lookup_bioma()` ordena `ORDER BY altitude_min DESC NULLS LAST` → altitude-específico vence.

### Regras invioláveis do bioma
- NUNCA aumentar `tolerancia_bioma` do id=8 acima de 0.70 sem benchmarking real
- NUNCA aumentar `sol_penetracao` do id=8 acima de 0.020 — dossel fecha quase 100% da luz
- O split altitude_min=600 é calibrado; não alterar sem dados de campo

---

## Veredicto — fatores de chuva iminente (jun/2026)

`veredicto()` agora aceita `pico_proximas_3h: float = 0.0` (soma das primeiras 3h do OWM forecast):

| Condição | Fator | Peso |
|---|---|---|
| `pico_proximas_3h >= 10.0` | `chuva_iminente_alta` | +2 |
| `pico_proximas_3h >= 5.0` | `chuva_iminente` | +1 |

Override pós-modelo `_aplicar_override_chuva_futura()` escalona DROP LIBERADO:
- `rain_12h > 10.0mm` → MELHOR ESPERAR (independente do score de aderência)
- bloco 12h com > 3mm → ALERTA (se veredicto era LIBERADO com solo SECO/GRIP)

---

## `texto_dinamico` — tom conversacional (ago/2026)

`condicoes.texto_dinamico` é a análise por trilha gerada por IA (3–5 frases, exibida no
`CondicaoCard.tsx` e usada como imagem dos Stories de condição no Instagram). Gerada em
`_build_narrativa_prompt()` / `_gerar_narrativa_claude()` (`mtb-forecast.py`).

### Regra de estilo (16/08/2026)
Tom conversacional — "como avisar um amigo antes de ele sair pra pedalar" — nunca
relatório técnico. Vocabulário de hidrologia/solo é proibido no texto final; traduzir
pra linguagem natural:
- meia-vida alta / drenagem lenta → "esse tipo de mata segura a umidade por mais tempo"
- meia-vida baixa / drenagem rápida → "esse solo seca rápido"
- dossel fechado → "a mata fechada não deixa o sol bater direito no chão"

Números de chuva (mm) e tempo (horas/dias) continuam aparecendo — só o jargão técnico
("meia-vida de secagem", "dossel", "acúmulo efetivo") deve ser evitado. O fallback local
sem LLM (`_resumo_secagem_local()`) segue o mesmo princípio.

---

## Publicação no Instagram — arquitetura e robustez (ago/2026)

### O que é postado e como
| Origem | Script | Formato IG | Frequência |
|---|---|---|---|
| Condição de trilha | `scripts/post_instagram.py` | Stories (sem caption) | após cada rodada do pipeline (07h/13h BRT) |
| Dica do dia | `scripts/post_instagram_dica.py` | **Feed** (com caption real) | diário, 06h30 BRT |
| Notícia climática (interna) | `scripts/post_noticia_clima.py` | Stories (sem caption) | após cada rodada do pipeline |
| Notícia externa (busca web) | `scripts/post_noticia_externa.py` | Stories (sem caption) | diário, 07h BRT |

Stories não aceita `caption` na Graph API — todo texto vai renderizado dentro da imagem
OG 1080x1920 (`/api/og/instagram/...`). Só a Dica do Dia é post de Feed de verdade.

### Falhas de publicação devem ser visíveis (fix 16/08/2026, commit `bc0a74c`)
Todo script que primeiro grava no banco e depois tenta postar no Instagram deve
**propagar falha da etapa de Instagram** (`raise SystemExit`) em vez de engolir com
`return` silencioso — mesmo que a gravação anterior já tenha funcionado. Um erro engolido
faz o workflow do GitHub Actions terminar verde sem nada ter sido postado, e o problema só
é percebido dias depois (foi exatamente o que aconteceu com notícia clima/externa antes
desse fix — só o Story de condição de trilha estava postando).

### Parsing de resposta do Claude com `web_search` (fix 16/08/2026, commit `d2aa268`)
`post_noticia_externa.py` usa a tool `web_search` do Claude; a resposta pode conter um
bloco de texto final **vazio** (truncamento por `max_tokens` baixo). Nunca assumir que o
último bloco de texto é sempre o JSON final ou que a string inteira é JSON puro:
- Filtrar blocos de texto vazios antes de escolher o "último"
- Extrair o objeto JSON do primeiro `{` ao último `}` (tolera texto residual ao redor)
- `max_tokens` mínimo 2048 quando `web_search` está no payload

---

## Reels de clima extremo (set/2026)

### Motivação
Diagnóstico de alcance parado no Instagram (10/09/2026): o mix era ~5 Stories/dia contra
1 único post de Feed (Dica do dia), e zero Reels. Stories só alcançam quem já segue a
conta — Reels é o único formato que o algoritmo empurra pra fora da base de seguidores
(Explore/descoberta). Primeira ação: transformar a notícia externa (clima extremo Brasil,
já existente) em Reels em vez de só Stories.

### Arquitetura
`scripts/post_reels_clima_extremo.py` — peça INDEPENDENTE de `post_noticia_externa.py`:
lê a última linha já gravada em `noticias_externas` (não busca nem resume de novo, zero
custo extra de Tavily/LLM) e cuida só da parte de vídeo + publicação como Reels.
- **Slideshow de várias cenas** (não uma imagem única): 1 cena de título + até `N_CENAS_EXTRA`
  (3) cenas extras, encadeadas com crossfade (`ffmpeg xfade`) — pedido do usuário pra ficar
  "mais vivo".
  - **Cena de título**: reaproveita a mesma rota OG vertical (1080x1920) já usada pro Stories
    (`/api/og/instagram/noticia-externa`) — nenhum template novo. A rota ganhou um parâmetro
    opcional `bg=<url>` (busca a imagem server-side, embute como data URI, satori não aceita
    `<img src>` remoto) — sem `bg`, o visual do Stories fica 100% inalterado.
  - **Cenas extras**: 1 foto pura de IA por bullet/região da notícia (sem texto embutido); se
    tiver menos bullets que cenas, completa com variações de enquadramento
    (`VARIACOES_ENQUADRAMENTO`) da frase de destaque.
  - **Imagem gerada por IA**: todas vêm do Pollinations.ai (`image.pollinations.ai/prompt/`),
    gratuito e sem chave/cadastro. O prompt em inglês de cada cena é gerado via DeepSeek
    (`DEEPSEEK_API_KEY`, mesmo provider já usado no resumo); se a chave faltar ou a chamada
    falhar, cai numa heurística por palavra-chave (seca/calor/frio/temporal/vento). Cena extra
    que falhar no Pollinations é só pulada (nunca derruba o pipeline); se **todas** falharem,
    sobra só a cena de título e o vídeo cai pro modo de imagem única sem crossfade
    (`gerar_video`, função de fallback). Se a busca do `bg` falhar na rota OG (timeout,
    Pollinations fora do ar), o template cai de volta no gradiente puro.
- **Vídeo**: ffmpeg (instalado via `apt-get` no início do workflow — não vem mais
  pré-instalado no runner `ubuntu-latest`, ver `.github/workflows/reels-clima-extremo.yml`)
  anima cada cena com zoom lento (`zoompan`, efeito Ken Burns), encadeia com crossfade de
  0.8s (`CROSSFADE_S`) e adiciona uma trilha ambiente **100% sintetizada** (senoides geradas
  pelo próprio ffmpeg, nunca uma gravação de música real) — zero risco de direito autoral,
  mas evita vídeo mudo. Duração final é variável (~15-18s) dependendo de quantas cenas
  baixaram com sucesso.
- **Caption real**: diferente do Stories, Reels aceita `caption` na Graph API — o texto
  completo (frase de destaque + bullets + fontes + hashtags) vai na legenda.
- **Storage**: vídeo sobe pro bucket público `reels` no Supabase Storage (Graph API exige
  `video_url` publicamente acessível); publicação é assíncrona — precisa fazer polling de
  `status_code=FINISHED` antes de `media_publish`.
- **Controle de duplicidade**: coluna `noticias_externas.reels_postado_em` — se já
  preenchida, o script sai sem reprocessar.
- **Agendamento**: `reels-clima-extremo.yml`, 07h20 BRT, 20min depois de
  `noticia-externa.yml` (07h BRT) pra garantir que a notícia do dia já foi gravada.

### Regras
- NUNCA usar faixa de áudio de música real (licenciada ou não) — só síntese via ffmpeg,
  pra manter zero risco de direito autoral sem depender de curadoria manual de licença.
- Kill-switches próprios: `REELS_CLIMA_EXTREMO_ENABLED`, `REELS_CLIMA_EXTREMO_INSTAGRAM`
  (mesmo padrão de [[project_noticia_clima_e_externa]] — nunca engolir falha de publicação
  em silêncio, ver invariante 15).
- Isolado do pipeline principal e de `post_noticia_externa.py` — só leitura da tabela.

---

## INVARIANTES DO SISTEMA — nunca regredir

1. **NUNCA reintroduzir timemachine como fonte de precipitação**
2. **NUNCA comparar acumulados de fontes sem normalizar `chuva_penetracao` em ambas**
3. **NUNCA usar só `rain` no OM** — sempre `precipitation` (= rain + showers + snow)
4. **NUNCA somar `rain + precipitation`** — dupla contagem
5. **NUNCA criar zero-rain shortcircuit** que pule histórico com base em forecast=0
6. **Mantenedor sempre opcional** — null nunca quebra card
7. **NUNCA usar next/image para logo_url** — usar `<img>` nativo
8. **Todas as alterações no branch `develop`**, nunca direto em `main`
9. **Não usar `createClient` no nível de módulo** em Next.js — causa crash se env var ausente no Vercel
10. **NORTE/NORDESTE/CENTRO-OESTE têm lógica ENSO inversa** — não "corrigir" multiplicadores > 1.0 em El Niño
11. **Não recriar microclima_config como fonte ativa** — foi supersedida por `biomas`
12. **Colunas de auditoria** (`cloud_pct`, `humidity_pct`, `temp_media_c`, `meia_vida_base_h`) devem ser gravadas em todo pipeline completo
13. **NUNCA modificar o array ERA5 in-place no nowcast overlay** — sempre copiar com `list()` antes
14. **`texto_dinamico` nunca usa jargão técnico de solo/hidrologia** (meia-vida, dossel, acúmulo efetivo) — tom conversacional, números continuam
15. **Etapas de publicação externa (Instagram, etc.) nunca engolem erro em silêncio** — sempre propagar pra falhar o workflow visivelmente, mesmo com a gravação no banco já feita
