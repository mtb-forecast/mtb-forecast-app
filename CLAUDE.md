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
  Regra: se `bruto_ow > bruto_om + 1.0mm` → lag detectado → soma a diferença ao
  efetivo com peso 0.9 (conservador, protege o rider de falso "solo seco").
- **`chuva_pct` (interceptação de dossel, via `_lookup_bioma`) DEVE ser aplicado a
  TODAS as fontes antes de qualquer comparação/max()**. Comparar chuva crua de uma
  fonte com chuva interceptada de outra infla o histórico em mata fechada.
- **Open-Meteo em batch**: 1 chamada de forecast + 1 de histórico cobrem todos os
  grupos de clima (multi-coordenada: `latitude=a,b,c&longitude=x,y,z` → resposta
  vira array; com 1 coordenada é objeto único — tratar ambos). Fallback para
  chamadas individuais com retry se o batch falhar.
- **Clima histórico (temp/vento/nuvens/umidade)**: vem do batch histórico do OM
  (48 amostras horárias, corte em `agora`). Timemachine OW foi REMOVIDO — suas
  3 amostras caíam sempre no mesmo horário do dia, enviesando temperatura média
  para baixo e inflando a meia-vida de secagem.
  Atenção: OM entrega vento em km/h; converter para m/s antes de
  `_ajustar_meia_vida_clima` quando necessário; verificar unidade no campo do endpoint.

### Regras invioláveis de chuva
- NUNCA reintroduzir timemachine como fonte de precipitação.
- NUNCA comparar acumulados de fontes sem normalizar `chuva_pct` em ambas.
- O zero-rain shortcircuit foi REMOVIDO em jun/2026 (ver git history).
  Não recriar otimizações que pulem o histórico com base em forecast=0 —
  forecast zero não prova ausência de chuva passada. Com o batch OM a economia
  de chamadas é irrelevante. Se quota de API um dia exigir cortes, a condição
  segura olha o day_summary GRAVADO da execução anterior, nunca o forecast.
- `precipitation` (= rain + showers + snow) é o campo canônico no OM; nunca usar
  só `rain` (perde pancadas convectivas) nem somar rain + precipitation (dupla
  contagem).

### Quota de API por execução (133 trilhas, 23 grupos)
OM: 2 chamadas batch. OWM: ~46 day_summary + ~23 onecall forecast ≈ 69.
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
- NORTE e NORDESTE têm **lógica INVERSA**:
  - El Niño no Norte/Nordeste = seca = threshold SOBE = modelo mais conservador (mult > 1.0)
  - La Niña no Norte/Nordeste = chuva = threshold DESCE = modelo mais permissivo (mult < 1.0)
- SUL: El Niño 0.69–0.79, La Niña 1.22–1.37
- NORTE: El Niño 1.18–1.25, La Niña 0.75–0.85
- NORDESTE: El Niño 1.25–1.35, La Niña 0.70–0.80
- CENTRO-OESTE: El Niño 0.90–0.94, La Niña 1.06–1.12

### `_enso_mult_regional(enso, uf)`
- Substitui o `enso["mult"]` genérico de `enso_config`
- Consulta `enso_regional_mult` por `(fase_raw, macro_regiao)`
- Se não encontrado: fallback para `enso["mult"]` genérico da `enso_config`
- `classificar_enso()` agora retorna `fase_raw` (ex: "neutro", "el_nino", "la_nina")

### Regras invioláveis do modelo regional
- NUNCA usar o mult genérico de `enso_config` diretamente quando há `enso_regional_mult`
- NORTE/NORDESTE têm lógica ENSO inversa — não "corrigir" esses multiplicadores para < 1.0 em El Niño
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

## INVARIANTES DO SISTEMA — nunca regredir

1. **NUNCA reintroduzir timemachine como fonte de precipitação**
2. **NUNCA comparar acumulados de fontes sem normalizar `chuva_pct` em ambas**
3. **NUNCA usar só `rain` no OM** — sempre `precipitation` (= rain + showers + snow)
4. **NUNCA somar `rain + precipitation`** — dupla contagem
5. **NUNCA criar zero-rain shortcircuit** que pule histórico com base em forecast=0
6. **Mantenedor sempre opcional** — null nunca quebra card
7. **NUNCA usar next/image para logo_url** — usar `<img>` nativo
8. **Todas as alterações no branch `develop`**, nunca direto em `main`
9. **Não usar `createClient` no nível de módulo** em Next.js — causa crash se env var ausente no Vercel
10. **NORTE/NORDESTE têm lógica ENSO inversa** — não "corrigir" multiplicadores > 1.0 em El Niño
11. **Não recriar microclima_config como fonte ativa** — foi supersedida por `biomas`
12. **Colunas de auditoria** (`cloud_pct`, `humidity_pct`, `temp_media_c`, `meia_vida_base_h`) devem ser gravadas em todo pipeline completo
