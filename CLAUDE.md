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
- **Precipitação histórica**: Open-Meteo batch (primário, horário) + OpenWeather
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
  `_ajustar_meia_vida_clima`.

### Regras invioláveis
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

### Quota de API por execução (29 trilhas, 23 grupos)
OM: 2 chamadas (batch). OW: ~46 day_summary + ~23 onecall forecast ≈ 69.
Limite One Call 3.0 free: 1.000/dia. 4 execuções/dia ≈ 284 — folga confortável.

### Validação
- 11/06/2026: lag capturado em produção em 22 trilhas, números coerentes com CGE.
- Pendente: rodada de sábado 06h BRT pós-frente fria (volumes 10-20mm) — comparar
  `bruto` com boletim CGE/INMET de sexta. Após validar: remover DEBUG_MODEL do
  workflow.

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

## Modelo de secagem — garoa e dias frios/nublados (11/06/2026)

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
