# MTB Forecast — Diagramas de Fluxo do Sistema

> Diagramas Mermaid e ASCII cobrindo todos os fluxos operacionais do MTB Forecaster.
> Atualizado em jun/2026 com: batch OM, modelo regional, mantenedores, remoção do timemachine.

---

## 1. Arquitetura geral do sistema

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          FONTES EXTERNAS                                   │
│                                                                             │
│  ┌─────────────────────┐  ┌──────────────────────────┐  ┌──────────────┐ │
│  │  OpenWeather         │  │  Open-Meteo               │  │  NOAA CPC    │ │
│  │  · One Call 3.0      │  │  · Forecast (batch)       │  │  · ONI ENSO  │ │
│  │    forecast          │  │  · Archive ERA5 (batch)   │  └──────────────┘ │
│  │  · Day Summary       │  │    multi-coord            │                   │
│  │    hoje+ontem        │  └──────────────────────────┘  ┌──────────────┐ │
│  └─────────────────────┘                                  │  Anthropic   │ │
│                                                           │  Claude AI   │ │
└────────────────────────────────────┬──────────────────────┴──────────────┘ │
                                     │                        └──────────────┘
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                  AGENTE PYTHON (GitHub Actions)                            │
│                                                                             │
│  Schedule: Seg–Qui 07h · Sex/Sáb 07h/13h/21h · Dom 07h/13h (BRT)         │
│                                                                             │
│  1. Carrega 16+ tabelas de config do Supabase                              │
│  2. Busca ONI NOAA → classifica ENSO + fase_raw                           │
│  3. Batch OM forecast + histórico (2 chamadas totais)                      │
│  4. Para cada trilha: pipeline de solo + veredicto                         │
│  5. Grava condicoes (DELETE + INSERT)                                      │
│  6. Processa pump tracks (só previsão)                                     │
│  7. Envia notificações (email + Telegram)                                  │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   SUPABASE (PostgreSQL + Auth + Storage + RLS)             │
│                                                                             │
│  DADOS OPERACIONAIS                                                         │
│  trilhas · condicoes · condicoes_strava · mantenedores                     │
│  favoritos · profiles · trilhas_pessoais                                    │
│  observacoes_trilha · admin_aprovacoes                                     │
│                                                                             │
│  PUMP TRACKS                                                                │
│  trilhas_pumptrack · condicoes_pumptrack                                   │
│                                                                             │
│  TABELAS DE CONFIG DO MODELO (16+)                                          │
│  meia_vida_secagem (+ regiao) · enso_regional_mult (NOVA)                 │
│  threshold_sazonal (+ macro-regiões) · meia_vida_clima_mult               │
│  biomas · trail_type_config · aderencia_thresholds                        │
│  veredicto_pesos · veredicto_limiares · ... (mais 7)                      │
│                                                                             │
│  STORAGE: logos · avatars · pumptrack-photos                               │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    WEB APP (Next.js 14 App Router / Vercel)                │
│                                                                             │
│  Server Components leem Supabase diretamente                               │
│  Client Components recalculam drift de acumulo_ef localmente               │
│                                                                             │
│  / · /login · /cadastro · /dashboard · /trilhas · /trilhas/[id]           │
│  /mantenedores/[id] · /pump-track/[id] · /mapa · /t/[id]                 │
│  /perfil · /perfil/strava · /admin · /admin/tabelas · /planos             │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Fluxo de execução do agente Python

```mermaid
flowchart TD
    START([GitHub Actions trigger\nschedule ou dispatch]) --> ENV

    ENV[_validar_env\nVerifica OPENWEATHER_API_KEY\n+ SUPABASE_SERVICE_KEY] --> TABLES

    TABLES[Carregamento de tabelas de config\n16+ caches globais via Supabase REST\nSe cache existir: reutiliza] --> ONI

    ONI[fetch_oni_atual\nNOAA oni.ascii.txt\nLê ANOM partes 3\nValidação 3 camadas\nRetorna: fase_raw, mult, emoji] --> TRILHAS

    TRILHAS[_carregar_trilhas_supabase\naprovada = true\nJOIN localidades\nJOIN mantenedores\nFallback: trilhas.csv] --> BATCH

    BATCH[fetch_batch_openmeteo\nForecast: 1 chamada\nHistórico ERA5: 1 chamada\nMulti-coord: lat=a,b,c&lon=x,y,z\nCobre todos os 23 grupos] --> LOOP

    LOOP{Para cada trilha} --> PIPELINE

    PIPELINE[processar_trilha\nVer fluxo 3] --> OVERRIDE

    OVERRIDE[_aplicar_override_chuva_futura\nSe bloco 0 ou 1 > 3mm:\nSECO/GRIP → BOA + ALERTA] --> OBS

    OBS[ajustar_por_observacoes\nConsulta observacoes_trilha\núltimas 24h\ndelta risco cap +2] --> GRAVAR

    GRAVAR[gravar_supabase\nDELETE + INSERT condicoes\n~45 campos incluindo\ncloud_pct, humidity_pct\ntemp_media_c, meia_vida_base_h] --> MAIS

    MAIS{Mais trilhas?} -->|Sim| LOOP
    MAIS -->|Não| STRAVA

    STRAVA[processar_segmentos_strava\nMesmo pipeline\nDELETE + INSERT condicoes_strava] --> PUMPS

    PUMPS[_processar_pumptracks\nSó previsão, sem solo\nDELETE + INSERT condicoes_pumptrack] --> NOTIF

    NOTIF[Notificações\nEmail: profiles com receber_email=true\nTelegram: profiles com telegram_ativo=true] --> LOG

    LOG[Log + Artifact\ndebug_YYYY-MM-DD.log\nUpload GitHub Actions 30 dias] --> END([Fim])
```

---

## 3. Pipeline por trilha (`processar_trilha`)

```mermaid
flowchart TD
    TRAIL([Trilha recebida]) --> SOLO

    SOLO[_lookup_solo\nsolo_type + bioma + regiao\nCascata: exact → bioma → global\nRetorna: clay_pct, sand_pct, texture_class] --> OWM

    OWM[fetch_onecall OWM\nPrevisão horária 48h\npeso 70%\nrain, wind, pop, pico_3h, gust] --> OMFORECAST

    OMFORECAST[fetch_openmeteo batch\nPrevisão futura\npeso 30%\nFusão 70/30 nos campos] --> DAYSUM

    DAYSUM[fetch_onecall_day_summary OWM\nPrecipitação hoje + ontem\nDetector de lag OM:\nse bruto_ow > bruto_om + 1.0mm\n→ adiciona diferença × 0.9 ao ef] --> OMHIST

    OMHIST[fetch_batch_openmeteo_historico\nERA5 últimas 48h\nPrecipitação: campo precipitation\nTemp, vento, nuvens, umidade\nGrava cloud_pct, humidity_pct\ntemp_media_c para auditoria] --> VENTO

    VENTO[fetch_vento_historico\nERA5 wind + gusts\nNível 1/2/3\n55/65/90 km/h] --> ENSO

    ENSO[_enso_mult_regional\nenso fase_raw + macro_regiao\nNORTE/NORDESTE: lógica inversa\nFallback: enso_config genérico] --> ACUMULO

    ACUMULO[calcular_acumulo_ef\nΣ p_i × chuva_pct × 0.5^t_i/τ\nchuva_pct de _lookup_bioma\nτ = meia_vida calculada\nCampo canonical: precipitation] --> MEIAVIDA

    MEIAVIDA[_meia_vida + _ajustar\nBase: meia_vida_secagem regiao\n× clima temperatura, vento, nuvens, umidade\n× combo garoa se humidity≥85 E cloud≥70\n× trail_type_config\nClamp 4h–72h\nGrava meia_vida_base_h para auditoria] --> ADERENCIA

    ADERENCIA[calcular_aderencia\nefetivo_threshold = ef+pico3h / fator_mc\nLookup aderencia_thresholds\nFator de recuperação × 2.5\nRegras bikepark] --> FUTURA

    FUTURA[calcular_aderencia_futura_oc\nPior bloco 6h em 24h\nstatus + label + rain] --> VEREDICTO

    VEREDICTO[veredicto\nSistema de pontuação de risco\nPesos: aderencia+pico+vento\n+inclinacao+hist+rajada+futuro\nLimiares: 0-1/2-3/4+] --> JANELA

    JANELA[calcular_janela_oc\nMaior bloco limpo 48h\npop<30% + rain<1mm + wind<15ms] --> CLAUDE

    CLAUDE[Claude AI\nfrase_secagem contextualizada\npor região + ENSO + condição] --> RESULTADO([resultado dict\npronto para gravar])
```

---

## 4. Pipeline de cálculo de meia-vida

```mermaid
flowchart TD
    SOLO([solo_type + exposicao\n+ regiao UF]) --> MACRO

    MACRO[_macro_regiao uf\nUF → NORTE/NORDESTE/\nCENTRO-OESTE/SUDESTE/SUL] --> BASE

    BASE[meia_vida_secagem lookup\nChave: solo_type + exposicao + regiao\nCascata:\n1. macro_regiao exata\n2. DEFAULT] --> AUDIT

    AUDIT[Grava meia_vida_base_h\nAuditoria: antes dos\nmultiplicadores climáticos] --> BIOMA

    BIOMA[_lookup_bioma trail, mes\nvento_pct e sol_pct para\najustar variáveis climáticas\nSazonalidade se aplicável] --> VENTO_EF

    VENTO_EF[wind_kmh_efetivo =\nwind_kmh × vento_pct\ncloud_efetivo =\n100 - 100-cloud × sol_pct] --> TEMP

    TEMP{temperatura?} -->|≥ 35°C| T1[× 0.65]
    TEMP -->|30–35°C| T2[× 0.75]
    TEMP -->|26–30°C| T3[× 0.86]
    TEMP -->|≤ 16°C| T4[× 1.12]
    TEMP -->|outros| T0[× 1.00]
    T1 & T2 & T3 & T4 & T0 --> VENTO_MULT

    VENTO_MULT{wind_kmh_efetivo?} -->|≥ 40| V1[× 0.75]
    VENTO_MULT -->|20–40| V2[× 0.85]
    VENTO_MULT -->|10.8–20| V3[× 0.92]
    VENTO_MULT -->|≤ 3.6| V4[× 1.05]
    VENTO_MULT -->|outros| V0[× 1.00]
    V1 & V2 & V3 & V4 & V0 --> COMBO_CV

    COMBO_CV{temp≥30 E wind≥20?} -->|Sim| CV1[× 0.80 combo]
    COMBO_CV -->|Não| CV0[× 1.00]
    CV1 & CV0 --> NUVEM

    NUVEM{cloud_efetivo?} -->|≥ 90%| N1[× 1.20]
    NUVEM -->|70–90%| N2[× 1.06]
    NUVEM -->|≤ 25%| N3[× 0.94]
    NUVEM -->|outros| N0[× 1.00]
    N1 & N2 & N3 & N0 --> UMID

    UMID{humidity_pct?} -->|≥ 95%| U1[× 1.25]
    UMID -->|85–95%| U2[× 1.18]
    UMID -->|≤ 45%| U3[× 0.93]
    UMID -->|outros| U0[× 1.00]
    U1 & U2 & U3 & U0 --> GAROA

    GAROA{humidity≥85\nE cloud≥70?} -->|Sim| G1[× 1.10 combo garoa\nse linha existir na tabela]
    GAROA -->|Não| G0[× 1.00]
    G1 & G0 --> TTY

    TTY[trail_type_config lookup\ntrail_type + exposicao\nNatural fechada: × 1.30\nBikepark aberta: × 0.35] --> CLAMP

    CLAMP[clamp final\nmax 4h, min 72h\nconfigurações_sistema] --> RESULT([meia_vida_h final\ngravado em condicoes])
```

---

## 5. Cálculo de veredicto

```mermaid
flowchart TD
    INPUTS([aderencia_status\npico_3h, rain_mm\nwind_ms, gust_max_kmh\ninclinacao, trail_type\nalerta_vento_nivel\naderencia_futura]) --> RISCO0

    RISCO0[risco = 0] --> ADH

    ADH{aderencia_status} -->|BAIXA| A3[risco += 3]
    ADH -->|BOA| A2[risco += 2]
    ADH -->|GRIP| A1[risco += 1]
    ADH -->|SECO| A0[risco += 0]
    A3 & A2 & A1 & A0 --> PICO

    PICO{pico_3h?} -->|≥ 15mm| P2[risco += 2]
    PICO -->|≥ 10mm| P1[risco += 1]
    PICO -->|< 10mm| P0[sem adição]
    P2 & P1 & P0 --> RAIN

    RAIN{rain_mm ≥ 8?} -->|Sim| R1[risco += 1]
    RAIN -->|Não| R0[sem adição]
    R1 & R0 --> WIND

    WIND{wind_ms ≥ 12?} -->|Sim| W1[risco += 1]
    WIND -->|Não| W0[sem adição]
    W1 & W0 --> INCLINA

    INCLINA{inclinacao\ncom umidade?} -->|> 30%| I2[risco += 2]
    INCLINA -->|> 20%| I1[risco += 1]
    INCLINA -->|outros| I0[sem adição]
    I2 & I1 & I0 --> TIPO

    TIPO{trail_type} -->|bikepark normal| BK1[risco -= 1]
    TIPO -->|bikepark saturado| BK2[risco -= 1\nrisco += 2]
    TIPO -->|natural inclinada\n+ rain + BOA/BAIXA| NT1[risco += 1]
    TIPO -->|outros| BK0[sem adição]
    BK1 & BK2 & NT1 & BK0 --> HISTV

    HISTV{alerta_vento_nivel?} -->|3 > 90 km/h| HV3[risco += 2]
    HISTV -->|2 65-90| HV2[risco += 1\nse encharcado: +1]
    HISTV -->|1 + encharcado| HV1[risco += 1]
    HISTV -->|0| HV0[sem adição]
    HV3 & HV2 & HV1 & HV0 --> RAJADA

    RAJADA{gust_max_kmh?} -->|≥30 aberta\nou ≥50 fechada| RAJ[risco = max risco, 2]
    RAJADA -->|outros| RAJ0[sem adição]
    RAJ & RAJ0 --> FUTURO

    FUTURO{aderencia_futura\nvs. atual?} -->|piora severa BAIXA| FU2[risco += 2]
    FUTURO -->|piora moderada BOA| FU1[risco += 1]
    FUTURO -->|melhora| FM1[risco -= 1]
    FUTURO -->|estável| FU0[sem adição]
    FU2 & FU1 & FM1 & FU0 --> LIMIAR

    LIMIAR{risco total?} -->|0–1| LIBERA[DROP LIBERADO]
    LIMIAR -->|2–3| ALERTA[DROP LIBERADO\nVeja os alertas]
    LIMIAR -->|≥ 4| ESPERA[MELHOR ESPERAR]

    LIBERA & ALERTA & ESPERA --> POSTP

    POSTP[Pós-processadores\n1. _aplicar_override_chuva_futura\n2. ajustar_por_observacoes] --> FINAL([veredicto final])
```

---

## 6. Cálculo de `acumulo_ef`

```mermaid
flowchart TD
    OM([Open-Meteo Archive ERA5\nField: precipitation\n= rain + showers + snow\nJanela: 48h horárias]) --> BIOMA

    BIOMA[_lookup_bioma trail, mes\nRetorna chuva_pct\nEx: Amazônia fechada = 0.175\nMata Atlântica aberta = 0.965] --> INICIO

    INICIO[ef = 0\nultima_chuva_h = 0\nacumulo_48h = 0] --> LOOP

    LOOP{Para cada hora i\n0..47 do histórico} --> PBRUTO

    PBRUTO[p_bruto = precips_i\nse p_bruto >= 0.5:\n  ultima_chuva_h = horas_atras_i] --> PEFET

    PEFET[p_efetivo = p_bruto × chuva_pct\nInterceptação de dossel] --> PESO

    PESO[peso = 0.5 ^ horas_atras_i / meia_vida\nDecaimento exponencial\nChuva 0h atrás: peso ≈ 1.0\nChuva 48h atrás: peso ≈ 0] --> ACUM

    ACUM[ef += p_efetivo × peso\nacumulo_48h += p_bruto] --> MAIS

    MAIS{Mais horas?} -->|Sim| LOOP
    MAIS -->|Não| LAG

    LAG{Detector de lag OWM\nbruto_ow_ef > bruto_om_ef + 1.0?} -->|Sim: lag detectado| ADDLAG

    ADDLAG[diferenca = bruto_ow_ef - bruto_om_ef\nef += diferenca × 0.9\nLog: lag-om] --> RESULT

    LAG -->|Não: sem lag| RESULT

    RESULT([acumulo_ef mm\nacumulo_48h mm bruto\nultima_chuva_h horas])
```

---

## 7. Fluxo ENSO regional

```mermaid
flowchart TD
    NOAA([NOAA oni.ascii.txt\nURL: cpc.ncep.noaa.gov]) --> PARSE

    PARSE[Lê partes 3 = ANOM\nValidação 3 camadas:\n1. header != 4 cols\n2. SST fora 20-32°C\n3. ANOM fora -4..+4\nFallback: oni=0.0 neutro] --> CLASS

    CLASS[classificar_enso oni\nRetorna:\n- fase texto exibível\n- fase_raw chave\n- mult genérico\n- emoji] --> TRILHA

    TRILHA([trilha com campo regiao\nEx: SP, MG, AM]) --> MACRO

    MACRO[_macro_regiao uf\nDict _UF_MACRO_REGIAO\n27 UFs → 5 macro-regiões\nFallback: SUDESTE] --> LOOKUP

    LOOKUP[_enso_mult_regional\nChave: fase_raw + macro_regiao\nLookup em enso_regional_mult] --> LOGICA

    LOGICA{macro_regiao?} -->|SUL/SUDESTE| SUD[El Niño: mult < 1.0\nMais chuva no sul\nthreshold desce\nmodelo mais permissivo]
    LOGICA -->|NORTE/NORDESTE| NNE[El Niño: mult > 1.0\nSECA no norte\nthreshold sobe\nmodelo mais conservador]
    LOGICA -->|CENTRO-OESTE| CO[Efeito moderado\nEl Niño 0.90-0.94\nLa Niña 1.06-1.12]

    SUD & NNE & CO --> APPLY

    APPLY[thresh = base_sazonal\n× enso_mult_regional\n× fator_microclima\n\nFallback se não encontrado:\nusa mult genérico de enso_config] --> RESULT([threshold_solo_descansado\nthreshold_bikepark_saturado])
```

---

## 8. Fluxo de autenticação do Web App

```mermaid
flowchart TD
    USER([Usuário acessa rota protegida]) --> MW

    MW[middleware.ts\ncreatServerClient supabase/ssr\ngetAll/setAll cookies\ngetUser verificação JWT] --> AUTH

    AUTH{Sessão válida?} -->|Não| LOGIN
    AUTH -->|Sim| ROUTE

    LOGIN[Redireciona para /login\n?redirect=rota_original] --> LOGINPAGE

    LOGINPAGE{Método de login?} -->|Email/senha| EMAIL
    LOGINPAGE -->|Google OAuth| GOOGLE

    EMAIL[signInWithPassword\nemail + password\nErro inline] --> EMAILOK

    EMAILOK{Sucesso?} -->|Sim| DASH
    EMAILOK -->|Não| LOGINPAGE

    GOOGLE[signInWithOAuth\nprovider: google\nredirectTo: /auth/callback] --> GAUTH

    GAUTH[Google autentica\nretorna para /auth/callback] --> CALLBACK

    CALLBACK[Página client-side\ndetectSessionInUrl processa code\ngetSession\nredireciona para /dashboard] --> CBFAIL

    CBFAIL{Sessão obtida?} -->|Sim| DASH
    CBFAIL -->|Timeout 10s| LGERR

    LGERR[Redireciona /login\nerror=auth_failed] --> LOGINPAGE

    DASH([/dashboard\nconteúdo autenticado]) --> ROUTE

    ROUTE([Rota solicitada\ncarregada]) --> END([OK])
```

---

## 9. Fluxo de integração Strava

```mermaid
flowchart TD
    RIDER([Rider em /perfil\nclica Conectar com Strava]) --> AUTH

    AUTH[GET /api/strava/auth\nMonta redirect_uri dinâmico\nx-forwarded-host ou host\nRedireciona para strava.com/oauth/authorize] --> STRAVA

    STRAVA[Strava: rider autoriza\nescopo: read + activity:read] --> CB

    CB[GET /api/strava/callback?code=...\n1. POST /oauth/token → access_token\n2. GET /segments/starred?per_page=50] --> FILTER

    FILTER[Filtra segmentos:\nkom_rank != null OU distance > 500m\nLimita a 15\nSet-Cookie strava_token httpOnly 1h] --> PERFIL

    PERFIL[Redireciona\n/perfil/strava?segments=JSON] --> CONFIG

    CONFIG[Rider configura cada segmento:\nsolo_type · exposicao\ntrail_type · bioma] --> SAVE

    SAVE[INSERT trilhas_pessoais\nstrava_segment_id, name, lat, lon\ndistance, desnivel, altitude\nsolo_type, exposicao, trail_type, bioma\npolyline, strava_elevation_profile] --> AGENT

    AGENT[Agente Python\nbuscar_segmentos_strava_unicos\nProcessa mesmo pipeline de trilha\nGrava condicoes_strava\nDELETE + INSERT por strava_segment_id] --> DASH

    DASH[/dashboard\nMostrar trilhas Strava\nborda laranja FC4C02] --> END([Notificações\npor email/Telegram])

    DESCON([Rider clica Desconectar]) --> DSCB

    DSCB[POST /api/strava/disconnect\nRemove cookies\nstrava_access_token\nstrava_refresh_token] --> PERFIL2

    PERFIL2[/perfil sem Strava\nBotão Conectar] --> AUTH
```

---

## 10. Fluxo de notificações ao usuário

```mermaid
flowchart TD
    AGENT([Agente finaliza\nprocessamento de trilhas]) --> EMAIL_QUERY

    EMAIL_QUERY[_buscar_usuarios_email\nProfiles com receber_email = true] --> EMAIL_LOOP

    EMAIL_LOOP{Para cada usuário\ncom email ativo} --> FAVORITOS

    FAVORITOS{email_trilhas_favoritas = true?} -->|Sim| GET_FAV
    FAVORITOS -->|Não| STRAVA_FLAG

    GET_FAV[_buscar_favoritos_usuario\nUser_id → trilha_ids\nLookup condicoes por trilha] --> STRAVA_FLAG

    STRAVA_FLAG{email_trilhas_strava = true?} -->|Sim| GET_STRAVA
    STRAVA_FLAG -->|Não| COMPOSE

    GET_STRAVA[_buscar_strava_usuario\ntrilhas_pessoais do usuário\nLookup condicoes_strava] --> COMPOSE

    COMPOSE[Compõe email HTML\nFavoritas + Strava\nVeredicto colorido por condição\nCredenciais via configuracoes_sistema\nemail_from + email_password + smtp] --> SEND_EMAIL

    SEND_EMAIL[smtplib.SMTP\nEnvia email personalizado] --> TELEGRAM_QUERY

    TELEGRAM_QUERY[_buscar_usuarios_telegram\nProfiles com telegram_ativo = true\ne telegram_chat_id preenchido] --> TG_LOOP

    TG_LOOP{Para cada usuário\nTelegram ativo} --> TG_COMPOSE

    TG_COMPOSE[Monta mensagem Markdown\nTrilhas favoritas + Strava\nVeredicto com emojis] --> TG_SEND

    TG_SEND[Telegram Bot API\nPOST api.telegram.org/bot/sendMessage\nchat_id + text + parse_mode Markdown] --> MORE_TG

    MORE_TG{Mais usuários\nTelegram?} -->|Sim| TG_LOOP
    MORE_TG -->|Não| END([Notificações enviadas])
```

---

## 11. Fluxo de aprovação dual-admin (tabelas mestras)

```mermaid
flowchart TD
    ADMIN_A([Admin A acessa\n/admin/tabelas]) --> EDIT

    EDIT[Edita valor inline:\nthreshold_sazonal · meia_vida_secagem\nbiomas · tabela_solo\ntrail_type_config] --> MODAL

    MODAL[Modal de confirmação\nDiff antes/depois\nMotivo obrigatório mín. 20 chars] --> SUBMIT

    SUBMIT[Clica Enviar para aprovação\nINSERT admin_aprovacoes:\nsolicitante_id = admin_A\naprovador_id = admin_B\nstatus = pendente\ndados_anteriores + dados_novos] --> BADGE

    BADGE[Linha marcada ⏳ Pendente\nBadge vermelho no navbar de admin_B] --> ADMIN_B

    ADMIN_B([Admin B vê fila\nem /admin/tabelas]) --> REVIEW

    REVIEW[Revisa diff\nanos_anteriores vs. dados_novos\ncom motivo do solicitante] --> DECIDE

    DECIDE{Decisão?} -->|Aprovar| APPROVE
    DECIDE -->|Rejeitar| REJECT

    APPROVE[UPDATE tabela alvo\ncom dados_novos\nUPDATE admin_aprovacoes\nstatus = aprovada] --> CACHE

    CACHE[Na próxima execução\ndo agente Python:\ncache recarregado\nnovo valor em efeito] --> END_OK([Alteração em produção])

    REJECT[UPDATE admin_aprovacoes\nstatus = rejeitada\nmotivo_rejeicao] --> NOTIF

    NOTIF[Admin A vê\nrejeição na fila] --> EDIT
```

---

## 12. Fluxo de aprovação de trilha

```mermaid
flowchart TD
    RIDER([Rider autenticado\nem /trilhas/cadastrar]) --> FORM

    FORM[Preenche formulário:\nnome, lat/lon, solo_type, exposicao\ntrail_type, bioma, altitude\ndesnivel, extensao, ref_url] --> GEO

    GEO[extrairCoordenadas\nURL Google Maps → lat/lon\nFallback: input manual] --> INSERT

    INSERT[INSERT trilhas_pendentes\nstatus = pendente\nuser_id = rider] --> PERFIL

    PERFIL[/perfil exibe\ntrilha com badge pendente] --> ADMIN

    ADMIN([Admin acessa /admin\nVê contador trilhas pendentes]) --> REVIEW

    REVIEW[AdminPanel\nGrid 9 campos da trilha\nLink Google Maps satélite] --> DECIDE

    DECIDE{Decisão?} -->|Aprovar| NOMINATIM
    DECIDE -->|Rejeitar| REJECT

    NOMINATIM[Nominatim geocoding\nlat/lon → cidade, estado\nISO3166-2-lvl4 para sigla UF] --> GEOOK

    GEOOK{Geocoding OK?} -->|Sim| LOCAL_SAVE
    GEOOK -->|Falha| LOCAL_MIN

    LOCAL_SAVE[INSERT localidades\nestado, cidade, localidade\nOu lookup se já existe] --> TRILHA_INSERT

    LOCAL_MIN[INSERT localidades mínima\nestado = trilha.regiao\ncidade = vazio\nGarante localidade_id não nulo] --> TRILHA_INSERT

    TRILHA_INSERT[INSERT trilhas\naprovada = true\nlocalidade_id preenchido\nUPDATE trilhas_pendentes\nstatus = aprovada] --> VISIVEL

    VISIVEL[Trilha aparece em /trilhas\nAgente processa na próxima execução] --> END_OK([OK])

    REJECT[Modal: motivo obrigatório\nUPDATE trilhas_pendentes\nstatus = rejeitada\nmotivo_rejeicao] --> RIDER_NOTIF

    RIDER_NOTIF[Rider vê motivo\nem /perfil] --> END_REJ([Rejeição notificada])
```

---

## 13. Fluxo de dados do frontend

```mermaid
flowchart TD
    SUPABASE([Supabase\nPostgreSQL]) --> SC

    SC[Server Components\nNext.js App Router\ncreatServerClient\nAuth Server-Side Rendering] --> QUERY

    QUERY[Queries no servidor:\ntrilhas com condicoes\nmantenedores JOIN\nlocalidades JOIN\nfavoritos do usuário] --> STATIC

    STATIC[Dados estáticos entregues\nno HTML inicial\nCondicoes.acumulo_ef\nCondicoes.meia_vida_h\nCondicoes.gerado_em] --> CC

    CC[Client Components\nCondicaoCard.tsx\nTrilhaCard.tsx] --> DRIFT

    DRIFT[Drift de acumulo_ef:\nhorasSince = Date.now - gerado_em\nefAgora = acumulo_ef × 0.5^horasSince/mv\nExibição sempre com drift\nNunca o valor bruto do banco] --> BADGE

    BADGE[Badges e cores:\nTopBarColor prioridade:\nEVITAR > ALERTA > LIBERADO\ncase-insensitive\nbadgeSolo: null para GRIP PERFEITO\nSolo seco só se SECO ou ef < 0.3mm] --> RENDER

    RENDER[Renderização final\nno cliente] --> INT

    INT{Interação do usuário?} -->|Favoritar| FAV
    INT -->|Avaliar trilha| OBS
    INT -->|Compartilhar| SHARE

    FAV[supabase.from favoritos\nupsert ou delete\nEstado local otimista] --> RENDER

    OBS[TrailObservations\nINSERT observacoes_trilha\ncondicao_encontrada obrigatório\nImmutável após publicação] --> RENDER

    SHARE[Botão WhatsApp\nURL /t/id\nTexto pré-formatado] --> END([Compartilhado])
```

---

## 14. Fluxo de ativação Telegram

```
Rider em /perfil
      │
      ▼
Vê: "Notificações por Telegram"
Instrução: acesse o bot @mtb_forecaster_bot e envie /start
      │
      ▼
Rider envia /start no Telegram
      │
      ▼
POST /api/telegram/webhook
  │
  ├─ Recebe payload: {"message": {"chat": {"id": 123456789}, "text": "/start"}}
  │
  ├─ supabase.from('profiles')
  │    .update({ telegram_chat_id: chat_id, telegram_ativo: true })
  │    .eq('telegram_username', username)
  │
  └─ Responde: "Notificações ativas! Você receberá atualizações..."
      │
      ▼
Próxima execução do agente:
  _buscar_usuarios_telegram() → profile com telegram_ativo = true
  Para cada trilha favorita do usuário:
    monta mensagem Markdown com veredicto
  Telegram Bot API → sendMessage(chat_id, texto)
```

---

## 15. Fluxo de upload de logo de mantenedor

```
Admin acessa cadastro/edição de mantenedor
      │
      ▼
Seleciona arquivo de imagem (jpeg/png/webp)
      │
      ▼
Frontend — compressão via canvas:
  canvas.drawImage(img)
  canvas.toBlob('image/webp', 0.85)
  FormData com Blob WebP
      │
      ▼
POST /api/admin/upload-logo
  ├─ Valida tipo e tamanho
  ├─ Supabase Storage: upload para bucket 'logos'
  │    Path: mantenedores/{mantenedor_id}/{timestamp}.webp
  └─ Retorna logo_url pública
      │
      ▼
Admin confirma logo no preview ao vivo
      │
      ▼
UPDATE mantenedores SET logo_url = url
      │
      ▼
LogoMantenedor component exibe com <img> nativo
(NÃO next/image — domínio Supabase fora de remotePatterns)
```

---

## 16. Fluxo de ativação de mantenedor em trilha

```
                    /trilhas?estado=SP
                          │
          ┌───────────────┴──────────────────┐
          ▼                                   ▼
  Trilha sem mantenedor_id           Trilha com mantenedor_id
          │                                   │
  TrilhaCard normal                  TrilhaCard com LogoMantenedor
  sem pill/logo                      pill escuro #1e2018
                                     nome_primario + nome_secundario
                                     cores dinâmicas
                                              │
                                    Select "Mantenedores / Bike Park"
                                              │
                                              ▼
                                  Navega para /mantenedores/[id]
                                              │
                                              ▼
                                  Hero: logo (se preenchido) + nome
                                  com link ↗ site_url
                                              │
                                              ▼
                                  Grid de todas as TrilhaCards
                                  do mantenedor com condição atual
```
