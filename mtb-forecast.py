"""
MTB Agent V6.4
- Email HTML com visual organizado para Gmail
- Cards por trilha, tabela D+1/D+2/D+3 com dados reais por dia, seções bem separadas
- Análise gerada pelo Claude AI
- Assunto: "Monitoramento de Trilhas para MTB — DD/MM/YYYY"

Alterações V5.24:
- Campo `bioma` lido do trilhas.csv (coluna opcional, ex: "Mata Atlântica")
- fator_tolerancia(): threshold mais conservador para biomas com instabilidade orográfica
  · Mata Atlântica + altitude >= 600m + fechada → threshold 25% menor (mais conservador)
  · Mata Atlântica demais casos → threshold 10% menor
  · Outros biomas → sem ajuste
- Badge 🌿 Mata Atlântica exibido no card quando bioma identificado
- threshold_solo_descansado() aceita trail= para aplicar fator de bioma

Alterações V5.23:
- One Call API 3.0 (OpenWeather) substitui /data/2.5/forecast como fonte principal
  · fetch_onecall(): previsão horária das próximas 48h (/data/3.0/onecall)
  · fetch_onecall_historico(): histórico real hora a hora 48h (/data/3.0/onecall/timemachine)
  · Duas chamadas timemachine por trilha (48h atrás e 24h atrás) — sem janela cega
  · Chuva da madrugada capturada integralmente ao rodar às 07:00 BRT
- Cascata de previsão: OpenWeather (primário) → Open-Meteo (fallback) → WeatherAPI (último recurso)
- pico_3h calculado com granularidade horária (48 pontos vs 16 anteriores)
- janela, horarios_chuva, resumo_12h e resumo_dia operando com dados horários
- Open-Meteo mantido para previsão (fallback) e vento histórico (rajadas)
- Cron ajustado para 07:00 BRT (0 10 * * *)

Alterações V5.22:
- Sazonalidade: thresholds de acúmulo efetivo derivados de ERA5-Land 30 anos (Climatempo)
- ENSO Nível 3: multiplicador sobre threshold sazonal via ONI NOAA (fetch_oni_atual)
- Card do email exibe fase ENSO, ONI e threshold em vigor por trilha
- Prompt Claude inclui fase ENSO para análise contextualizada

Alterações V5.21:
- Modelo de secagem do solo por decaimento exponencial
- fetch_openmeteo_historico() retorna dict com chuva_solo_mm, efetivo, ultima_chuva_h, meia_vida_h
- Tabela meia_vida_secagem (Supabase): taxa de secagem por (solo_type, exposicao)

Alterações V5.20:
- Badge automático "⛏ Quadrilátero Ferrífero" no card da trilha

Alterações V5.19:
- Novo solo_type "misto_mg"

Alterações V5.18:
- Novo solo_type "ferro"

Alterações V5.17:
- Calibração do fator de absorção para bikepark em mata fechada

Alterações V5.16:
- Título do card de cada trilha é agora um hiperlink clicável

Alterações V5.15:
- Histórico de vento das últimas 48h via média Open-Meteo + OpenWeather
- Alerta de árvores caídas no card da trilha

Alterações V5.14:
- Seção de doação via Pix entre o ranking e a tabela de previsão

Alterações V5.13:
- Envio segmentado por região

Alterações V5.12:
- Lista de BCC lida do arquivo emails.txt
- Nova regra de aderência/veredicto para bikepark saturado

Alterações V5.11:
- Novo campo opcional `desnivel_m` e `extensao_km`

Alterações V5.10:
- Novo tipo de solo "preto"
- trail_type simplificado para "natural" e "bikepark"
- Nomenclatura: GRIP PERFEITO / BOA ADERÊNCIA - ÚMIDO / BAIXA ADERÊNCIA
- Veredicto: DROP LIBERADO / DROP LIBERADO - Veja os alertas / MELHOR ESPERAR

Alterações V5.4:
- Histórico real de chuva das últimas 48h via Open-Meteo

Alterações V5.3:
- Integração com Open-Meteo como segunda fonte meteorológica

Correções V5.2.2:
- FIX: BCC funciona via envelope SMTP sem expor endereços no header
- FIX: renomeado import html para html_lib para evitar conflito com variável local

Remoção V6.5:
- Campo trail_drainage removido do modelo — drenagem já capturada por solo_type,
  exposicao, trail_type e inclinacao. Remoção evita dupla contagem de benefício.
"""

import os
import json
import html as html_lib
import ssl
import urllib.request
import urllib.error
import urllib.parse
import time
from datetime import datetime, timezone, timedelta, date
from mtb_api_logger import log_api as _log_api, gravar_uso_api as _gravar_uso_api

# SSL context reutilizável para chamadas Open-Meteo — evita renegociação a cada request
_SSL_CTX = ssl.create_default_context()


def _om_urlopen(url: str, timeout: int = 60):
    """urlopen com SSL context explícito e timeout generoso para api.open-meteo.com."""
    return urllib.request.urlopen(url, timeout=timeout, context=_SSL_CTX)

TRAILS = []

OPENWEATHER_KEY  = os.getenv("OPENWEATHER_API_KEY")
ANTHROPIC_KEY    = os.getenv("ANTHROPIC_API_KEY")
GEMINI_KEY       = os.getenv("GEMINI_API_KEY")
GROQ_KEY         = os.getenv("GROQ_API_KEY")
DEBUG_MODEL      = os.getenv("DEBUG_MODEL", "false").lower() == "true"
WEATHERAPI_KEY   = os.getenv("WEATHERAPI_KEY", "")
WINDY_API_KEY    = os.getenv("WINDY_API_KEY", "")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

def _validar_env() -> None:
    obrigatorias = {
        "OPENWEATHER_API_KEY":  OPENWEATHER_KEY,
        "SUPABASE_URL":         SUPABASE_URL,
        "SUPABASE_SERVICE_KEY": SUPABASE_KEY,
    }
    faltando = [k for k, v in obrigatorias.items() if not v]
    if faltando:
        raise EnvironmentError(
            f"Variáveis de ambiente obrigatórias não definidas: {', '.join(faltando)}"
        )

BRT = timezone(timedelta(hours=-3))

# ---------------------------------------------------------------------------
# Sazonalidade e ENSO — V5.22
# ---------------------------------------------------------------------------

_CACHE_ONI: dict = {}  # {"oni": float, "ts": float} — TTL 24h (ONI muda mensalmente)

def fetch_oni_atual() -> float:
    if "oni" in _CACHE_ONI and (time.time() - _CACHE_ONI.get("ts", 0)) < 86400:
        return _CACHE_ONI["oni"]
    try:
        url = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
        req = urllib.request.Request(url, headers={"User-Agent": "MTBAgent/5.23"})
        with urllib.request.urlopen(req, timeout=15) as r:
            linhas = r.read().decode("utf-8").splitlines()

        # Camada 1: número de colunas no header (formato esperado: SEAS YR TOTAL ANOM = 4 cols)
        header = linhas[0].split() if linhas else []
        if len(header) != 4:
            print(f"[ENSO] AVISO formato: header com {len(header)} colunas (esperado 4): {linhas[0]!r}")

        oni_val = 0.0
        formato_ok = True
        for linha in reversed(linhas):
            partes = linha.split()
            if len(partes) >= 4:
                try:
                    sst   = float(partes[2])  # col 2 = TOTAL (SST absoluto, ~20-32°C)
                    anom  = float(partes[3])  # col 3 = ANOM  (anomalia ONI, -4 a +4)
                except ValueError:
                    continue

                # Camada 2: SST fora de 20-32°C indica coluna errada
                if not (20.0 <= sst <= 32.0):
                    print(f"[ENSO] AVISO formato: partes[2]={sst} fora de 20-32°C (esperado SST) — arquivo pode ter mudado de formato")
                    formato_ok = False
                    break

                # Camada 3: anomalia ONI fora de -4 a +4 indica coluna errada
                if not (-4.0 <= anom <= 4.0):
                    print(f"[ENSO] AVISO formato: partes[3]={anom} fora de -4..+4 (esperado anomalia ONI) — arquivo pode ter mudado de formato")
                    formato_ok = False
                    break

                oni_val = anom
                break

        if not formato_ok:
            print("[ENSO] Formato inesperado — usando neutro (0.0). Verifique oni.ascii.txt manualmente.")

        _CACHE_ONI["oni"] = oni_val
        _CACHE_ONI["ts"]  = time.time()
        _log_api("noaa", "oni_ascii", sucesso=1)
        return oni_val
    except Exception as exc:
        print(f"[ENSO] Falha ao buscar ONI: {exc} — usando neutro (0.0)")
        _log_api("noaa", "oni_ascii", sucesso=0, falhas=1)
        _CACHE_ONI["oni"] = 0.0
        _CACHE_ONI["ts"]  = time.time()
        return 0.0


def classificar_enso(oni: float) -> dict:
    _FASE_DISPLAY = {
        "el_nino_forte": "El Niño Forte",
        "el_nino":       "El Niño",
        "neutro":        "ENSO Neutro",
        "la_nina":       "La Niña",
        "la_nina_forte": "La Niña Forte",
    }
    for cfg in _carregar_enso_config():
        min_v = cfg.get("oni_min")
        max_v = cfg.get("oni_max")
        if min_v is not None and max_v is not None:
            # Fases El Niño (min_v >= 0): lower inclusivo, upper exclusivo
            # Fases La Niña (min_v < 0):  lower exclusivo, upper inclusivo
            match = (min_v <= oni < max_v) if min_v >= 0 else (min_v < oni <= max_v)
        elif min_v is not None:
            match = oni >= min_v          # el_nino_forte: sem limite superior
        else:
            match = max_v is not None and oni <= max_v  # la_nina_forte: sem limite inferior
        if match:
            return {
                "fase":     _FASE_DISPLAY.get(cfg["fase"], cfg["fase"]),
                "fase_raw": cfg["fase"],
                "oni":      oni,
                "mult":     cfg["multiplicador"],
                "emoji":    cfg["emoji"],
            }
    return {"fase": "ENSO Neutro", "fase_raw": "neutro", "oni": oni, "mult": 1.00, "emoji": "⚪"}


# Mapeamento UF → macro-região geográfica brasileira
_UF_MACRO_REGIAO: dict[str, str] = {
    "SP": "SUDESTE", "MG": "SUDESTE", "RJ": "SUDESTE", "ES": "SUDESTE",
    "PR": "SUL",     "SC": "SUL",     "RS": "SUL",
    "MS": "CENTRO-OESTE", "MT": "CENTRO-OESTE", "GO": "CENTRO-OESTE", "DF": "CENTRO-OESTE",
    "BA": "NORDESTE", "SE": "NORDESTE", "AL": "NORDESTE", "PE": "NORDESTE",
    "PB": "NORDESTE", "RN": "NORDESTE", "CE": "NORDESTE", "PI": "NORDESTE", "MA": "NORDESTE",
    "PA": "NORTE",    "AM": "NORTE",    "AC": "NORTE",    "RO": "NORTE",
    "RR": "NORTE",    "AP": "NORTE",    "TO": "NORTE",
}


def _macro_regiao(uf: str) -> str:
    """Converte UF (ex: 'SC') para macro-região (ex: 'SUL'). Retorna 'DEFAULT' se desconhecida."""
    return _UF_MACRO_REGIAO.get((uf or "").upper().strip(), "DEFAULT")


def _enso_mult_regional(enso: dict, uf: str) -> float:
    """Retorna multiplicador ENSO para a macro-região da UF. Fallback: enso['mult'] global."""
    if not uf:
        return enso["mult"]
    tabela = _carregar_enso_regional_mult()
    fase_raw  = enso.get("fase_raw", "neutro")
    macro_reg = _macro_regiao(uf)
    return tabela.get((fase_raw, macro_reg), enso["mult"])


def _threshold_tabela(uf: str, tabela_sb: dict) -> dict:
    """Lookup em cascata: UF específica → macro-região → DEFAULT."""
    macro = _macro_regiao(uf)
    return (
        tabela_sb.get(uf) or
        tabela_sb.get(macro) or
        tabela_sb.get("DEFAULT", {})
    )


def threshold_solo_descansado(mes: int, enso: dict, trail: dict = None) -> float:
    """Threshold dinâmico: sazonalidade × ENSO regional × microclima de bioma."""
    uf = ((trail or {}).get("regiao") or "").upper()
    tabela_sb = _carregar_threshold_sazonal()
    tabela = _threshold_tabela(uf, tabela_sb)
    base, _ = tabela.get(mes, (5.0, 10.0))
    valor = base * _enso_mult_regional(enso, uf)
    if trail is not None:
        valor *= fator_tolerancia(trail)
    return round(valor, 1)


def threshold_bikepark_saturado(mes: int, enso: dict, trail: dict = None) -> float:
    uf = ((trail or {}).get("regiao") or "").upper()
    tabela_sb = _carregar_threshold_sazonal()
    tabela = _threshold_tabela(uf, tabela_sb)
    _, sat = tabela.get(mes, (5.0, 10.0))
    valor = sat * _enso_mult_regional(enso, uf)
    if trail is not None:
        valor *= fator_tolerancia(trail)
    return round(valor, 1)


_BIKEPARK_MIN_NORM_BUFFER = 1.5  # bikepark sempre ganha ≥1.5mm normalizado acima do threshold de BAIXA (7.0)
_BAIXA_NORM_THRESHOLD    = 7.0  # ef_min de BAIXA ADERÊNCIA na tabela aderencia_thresholds

def _bikepark_saturado(trail: dict, acumulo_ef: float, ef_normalizado: float,
                       mes: int = None, enso: dict = None) -> bool:
    if mes is None:
        mes = datetime.now(timezone(timedelta(hours=-3))).month
    if enso is None:
        enso = {"mult": 1.0, "fase": "ENSO Neutro"}
    limite = threshold_bikepark_saturado(mes, enso, trail)  # sat × fator_tol
    # Garante buffer mínimo: mesmo em biomas muito conservadores (fator_tol=0.5),
    # o bikepark retém alguma vantagem de drenagem acima do threshold de BAIXA.
    # Para biomas menos conservadores, o threshold sazonal (maior) prevalece.
    limite = max(limite, _BAIXA_NORM_THRESHOLD + _BIKEPARK_MIN_NORM_BUFFER)
    return (
        trail.get("trail_type") == "bikepark"
        and ef_normalizado > limite
    )

def calcular_inclinacao(trail: dict) -> float | None:
    d = trail.get("desnivel_m")
    e = trail.get("extensao_km")
    if d is not None and e is not None and e > 0:
        return round((d / (e * 1000)) * 100, 1)
    return None

def proximos_dias() -> dict:
    hoje = datetime.now(BRT).date()
    d1   = hoje + timedelta(1)
    d2   = hoje + timedelta(2)
    d3   = hoje + timedelta(3)
    dias_semana = {0: "Seg", 1: "Ter", 2: "Qua", 3: "Qui", 4: "Sex", 5: "Sáb", 6: "Dom"}
    return {
        "d1": d1, "d1_label": f"{dias_semana[d1.weekday()]} {d1.strftime('%d/%m')}",
        "d2": d2, "d2_label": f"{dias_semana[d2.weekday()]} {d2.strftime('%d/%m')}",
        "d3": d3, "d3_label": f"{dias_semana[d3.weekday()]} {d3.strftime('%d/%m')}",
    }

# ---------------------------------------------------------------------------
# WeatherAPI.com — fallback para OW onecall e day_summary
# ---------------------------------------------------------------------------

def _fetch_weatherapi_forecast_as_ow(trail: dict) -> dict | None:
    """Busca WeatherAPI forecast.json e normaliza para formato OW hourly (48h)."""
    if not WEATHERAPI_KEY:
        return None
    url = (
        f"https://api.weatherapi.com/v1/forecast.json"
        f"?key={WEATHERAPI_KEY}&q={trail['lat']},{trail['lon']}&days=2&aqi=no"
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                data = json.loads(r.read().decode("utf-8"))
            hourly = []
            for day in data.get("forecast", {}).get("forecastday", []):
                for h in day.get("hour", []):
                    hourly.append({
                        "temp":       h.get("temp_c", 0.0),
                        "rain":       {"1h": h.get("precip_mm", 0.0)},
                        "wind_speed": round(h.get("wind_kph", 0.0) / 3.6, 2),
                        "wind_gust":  round(h.get("gust_kph", 0.0) / 3.6, 2),
                        "pop":        h.get("chance_of_rain", 0) / 100.0,
                    })
            _log_api("weatherapi", "forecast", sucesso=1)
            return {"hourly": hourly}
        except Exception as exc:
            if attempt == 2:
                _log_api("weatherapi", "forecast", sucesso=0, falhas=1)
                print(f"  [WeatherAPI forecast] Falha para {trail['name']}: {exc}")
                return None
            time.sleep(2 ** attempt)
    return None


def _fetch_weatherapi_precip_dia(trail: dict, date_str: str) -> float:
    """Retorna precipitação total (mm) do dia via WeatherAPI history.json."""
    if not WEATHERAPI_KEY:
        return 0.0
    url = (
        f"https://api.weatherapi.com/v1/history.json"
        f"?key={WEATHERAPI_KEY}&q={trail['lat']},{trail['lon']}&dt={date_str}&aqi=no"
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                data = json.loads(r.read().decode("utf-8"))
            mm = float(
                data.get("forecast", {})
                    .get("forecastday", [{}])[0]
                    .get("day", {})
                    .get("totalprecip_mm", 0.0) or 0.0
            )
            _log_api("weatherapi", "history", sucesso=1)
            print(f"  [WeatherAPI history] {trail['name']} {date_str}: {mm:.1f}mm (fallback OW)")
            return mm
        except Exception as exc:
            if attempt == 2:
                _log_api("weatherapi", "history", sucesso=0, falhas=1)
                print(f"  [WeatherAPI history] Falha {date_str} para {trail['name']}: {exc}")
                return 0.0
            time.sleep(2 ** attempt)
    return 0.0


# ---------------------------------------------------------------------------
# Windy Point Forecast API — fallback 4 (500 chamadas/dia, modelo GFS)
# POST https://api.windy.com/api/point-forecast/v2
# Temperatura retornada em Kelvin; precipitação em acumulado 3h (mm).
# ---------------------------------------------------------------------------

def _fetch_windy_forecast(trail: dict) -> dict | None:
    """Busca Windy Point Forecast (GFS) e retorna dict no formato de resumo_openmeteo."""
    if not WINDY_API_KEY:
        return None
    url     = "https://api.windy.com/api/point-forecast/v2"
    payload = json.dumps({
        "lat":        trail["lat"],
        "lon":        trail["lon"],
        "model":      "gfs",
        "parameters": ["wind", "windGust", "temp", "past3hprecip"],
        "levels":     ["surface"],
        "key":        WINDY_API_KEY,
    }).encode("utf-8")
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url, data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except Exception as exc:
            if attempt == 2:
                _log_api("windy", "point_forecast", sucesso=0, falhas=1)
                print(f"  [Windy] Falha para {trail['name']}: {exc}")
                return None
            time.sleep(2 ** attempt)

    agora_ms  = datetime.now(BRT).timestamp() * 1000
    limite_ms = agora_ms + 48 * 3600 * 1000

    ts         = data.get("ts", [])
    precip_raw = data.get("past3hprecip-surface", [])
    wu_raw     = data.get("wind_u-surface", [])
    wv_raw     = data.get("wind_v-surface", [])
    gust_raw   = data.get("windGust-surface", [])
    temp_raw   = data.get("temp-surface", [])  # Kelvin

    precip_48, wind_48, gust_48, temp_24 = [], [], [], []
    for i, t_ms in enumerate(ts):
        if t_ms < agora_ms or t_ms > limite_ms:
            continue
        p  = float(precip_raw[i]) if i < len(precip_raw) else 0.0
        wu = float(wu_raw[i])     if i < len(wu_raw)     else 0.0
        wv = float(wv_raw[i])     if i < len(wv_raw)     else 0.0
        g  = float(gust_raw[i])   if i < len(gust_raw)   else 0.0
        tk = float(temp_raw[i])   if i < len(temp_raw)   else 298.15
        precip_48.append(max(p, 0.0))
        wind_48.append((wu ** 2 + wv ** 2) ** 0.5)
        gust_48.append(g)
        if len(temp_24) < 8:          # 8 × 3h = 24h
            temp_24.append(tk - 273.15)

    if not precip_48:
        return None

    # past3hprecip já é acumulado por intervalo → pico_3h = max direto
    rain_mm = round(sum(precip_48[:8]), 1)   # 24h
    pico_3h = round(max(precip_48, default=0.0), 1)
    wind_max = round(max(wind_48, default=0.0), 1)
    gust_max = round(max(gust_48, default=0.0), 1)
    tmax = round(max(temp_24, default=25))
    tmin = round(min(temp_24, default=tmax))

    # GFS não retorna pop → estima a partir do pico_3h:
    # 0mm→0%  | >0 e <1mm→20%(mínimo)  | ~5mm→75%  | cap 90%
    pop_est = min(90, max(20, round(pico_3h * 15))) if pico_3h > 0 else 0

    _log_api("windy", "point_forecast", sucesso=1)
    print(f"  [Windy] {trail['name']}: rain={rain_mm}mm pico={pico_3h}mm pop~{pop_est}% (fallback OW+OM+WeatherAPI)")
    return {
        "rain":     rain_mm,
        "wind":     wind_max,
        "pop":      pop_est,
        "pico_3h":  pico_3h,
        "gust_max": gust_max,
        "tmax":     tmax,
        "tmin":     tmin,
    }


# ---------------------------------------------------------------------------
# One Call API 3.0 — V5.23
# ---------------------------------------------------------------------------

def fetch_onecall(trail: dict) -> dict | None:
    lk = trail.get("local_key")
    if lk and lk in _CACHE_OW_ONECALL:
        return _CACHE_OW_ONECALL[lk]
    url = (
        "https://api.openweathermap.org/data/3.0/onecall"
        f"?lat={trail['lat']}&lon={trail['lon']}"
        f"&appid={OPENWEATHER_KEY}&units=metric&lang=pt_br"
        "&exclude=minutely,daily,alerts"
    )
    resultado = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                resultado = json.loads(r.read().decode("utf-8"))
            break
        except (urllib.error.URLError, OSError):
            if attempt == 2:
                resultado = None
            else:
                time.sleep(2 ** attempt)
    _log_api("openweathermap", "onecall",
             sucesso=1 if resultado is not None else 0,
             falhas=0 if resultado is not None else 1)
    if lk and resultado is not None:
        _CACHE_OW_ONECALL[lk] = resultado
    return resultado


def resumo_onecall(data: dict) -> dict | None:
    if not data:
        return None
    try:
        hourly    = data.get("hourly", [])[:24]
        hourly_48 = data.get("hourly", [])[:48]
        precip    = [h.get("rain", {}).get("1h", 0.0) or 0.0 for h in hourly]
        precip_48 = [h.get("rain", {}).get("1h", 0.0) or 0.0 for h in hourly_48]
        wind      = [h.get("wind_speed", 0.0) or 0.0 for h in hourly]
        gusts     = [h.get("wind_gust", 0.0) or 0.0 for h in hourly]
        pop       = [h.get("pop", 0.0) or 0.0 for h in hourly]

        rain_mm  = round(sum(precip), 1)
        wind_max = round(max(wind, default=0.0), 1)
        gust_max = round(max(gusts, default=0.0), 1)
        pop_max  = round(max(pop, default=0.0) * 100)
        pico_3h  = round(
            max((sum(precip_48[i:i+3]) for i in range(max(1, len(precip_48) - 2))), default=0.0), 1
        )
        tmax = round(max((h.get("temp", 0) for h in hourly), default=0))
        tmin = round(min((h.get("temp", 999) for h in hourly if h.get("temp") is not None), default=tmax))

        return {
            "rain":     rain_mm,
            "wind":     wind_max,
            "pop":      pop_max,
            "pico_3h":  pico_3h,
            "tmax":     tmax,
            "tmin":     tmin,
            "gust_max": gust_max,
        }
    except (KeyError, TypeError):
        return None


def fetch_onecall_historico(trail: dict) -> dict:
    """
    Lê temp/vento/nuvens/umidade do cache batch OM histórico (prefetch_om_batch).
    Chamadas OW timemachine removidas — dados vêm da mesma requisição batch que já
    busca precipitação e vento, eliminando 3 chamadas HTTP por trilha.
    Assinatura e retorno preservados para compatibilidade com processar_trilha.
    """
    agora     = datetime.now(BRT)
    agora_str = agora.strftime("%Y-%m-%dT%H:00")
    meia_vida_base = _meia_vida(trail)

    lk    = trail.get("local_key")
    clima = _CACHE_OM_CLIMA_RAW.get(lk, {}) if lk else {}
    times_cl      = clima.get("times", [])
    temps         = clima.get("temp", [])
    humidity      = clima.get("humidity", [])
    clouds        = clima.get("clouds", [])
    wind_speeds   = clima.get("wind_speed", [])   # km/h (unidade padrão OM)
    dew_points    = clima.get("dew_point", [])
    weather_codes = clima.get("weather_codes", [])

    amostras_temp     = []
    amostras_wind_ms  = []
    amostras_cloud    = []
    amostras_humidity = []
    amostras_dew      = []

    for i, t in enumerate(times_cl):
        if t > agora_str:
            continue
        if i < len(temps)       and temps[i]       is not None: amostras_temp.append(temps[i])
        if i < len(wind_speeds) and wind_speeds[i]  is not None: amostras_wind_ms.append(wind_speeds[i] / 3.6)
        if i < len(clouds)      and clouds[i]       is not None: amostras_cloud.append(clouds[i])
        if i < len(humidity)    and humidity[i]     is not None: amostras_humidity.append(humidity[i])
        if i < len(dew_points)  and dew_points[i]   is not None: amostras_dew.append(dew_points[i])

    print(f"  [OM hist clima] {trail['name']}: {len(amostras_temp)} amostras horárias (temp/vento/nuvens/umidade/dewpoint)")

    temp_media     = round(sum(amostras_temp)     / len(amostras_temp),     1) if amostras_temp     else None
    vento_medio    = round(sum(amostras_wind_ms)  / len(amostras_wind_ms),  1) if amostras_wind_ms  else None
    nublado_medio  = round(sum(amostras_cloud)    / len(amostras_cloud),    1) if amostras_cloud    else None
    umidade_media  = round(sum(amostras_humidity) / len(amostras_humidity), 1) if amostras_humidity else None
    dew_point_media = round(sum(amostras_dew)     / len(amostras_dew),      1) if amostras_dew      else None

    # WMO weather_code nas últimas 4h: 45/48=névoa, 51-57=garoa/drizzle
    _WMO_GAROA = {45, 48, 51, 53, 55, 56, 57}
    agora_m4h_str = (agora - timedelta(hours=4)).strftime("%Y-%m-%dT%H:00")
    is_garoa_wmo = any(
        wc is not None and int(wc) in _WMO_GAROA
        for i, t in enumerate(times_cl)
        if agora_m4h_str <= t <= agora_str
        for wc in [weather_codes[i] if i < len(weather_codes) else None]
    )

    # Garoa persistente: padrão de 48h com chuva leve acumulada em condições saturadas.
    # Captura o cenário frio+nublado+garoando que o acumulo_ef (filtrado por chuva_penetracao) não enxerga.
    # Conta horas passadas com umidade ≥ 85%, nuvens ≥ 70% e precipitação > 0.05mm/h simultaneamente.
    _precips_48h = (_CACHE_OM_CHUVA_RAW.get(lk, ([], []))[1]
                    if lk and lk in _CACHE_OM_CHUVA_RAW else [])
    garoa_horas_hist = sum(
        1 for i, t in enumerate(times_cl)
        if t <= agora_str
        and i < len(humidity)    and humidity[i]    is not None and float(humidity[i])    >= 85
        and i < len(clouds)      and clouds[i]      is not None and float(clouds[i])      >= 70
        and i < len(_precips_48h) and _precips_48h[i] is not None and float(_precips_48h[i]) > 0.05
    )
    is_garoa_persistente = garoa_horas_hist >= 6

    meia_vida = _ajustar_meia_vida_clima(
        meia_vida_base,
        trail,
        temp_c=temp_media,
        wind_ms=vento_medio,
        cloud_pct=nublado_medio,
        humidity_pct=umidade_media,
    )

    return {
        "chuva_solo_mm":    0.0,
        "efetivo":          0.0,
        "ultima_chuva_h":   None,
        "meia_vida_base_h": meia_vida_base,
        "meia_vida_h":      meia_vida,
        "temp_media_c":     temp_media,
        "vento_medio_ms":   vento_medio,
        "nublado_pct":      nublado_medio,
        "umidade_pct":      umidade_media,
        "dew_point_media":      dew_point_media,
        "is_garoa_wmo":         is_garoa_wmo,
        "is_garoa_persistente": is_garoa_persistente,
        "garoa_horas_hist":     garoa_horas_hist,
        "vento_max_kmh_ow": None,  # timemachine removido; vento máx calculado exclusivamente via OM hist
    }


def fetch_historico_chuva_om(trail: dict, meia_vida: float) -> dict:
    """
    Busca precipitação hora a hora no Open-Meteo archive (ERA5) para as últimas 48h.
    Calcula chuva_solo_mm, efetivo (decaimento exponencial) e ultima_chuva_h.
    Substitui o histórico do One Call timemachine, que retorna apenas 1 ponto por chamada.
    """
    agora     = datetime.now(BRT)
    agora_str = agora.strftime("%Y-%m-%dT%H:00")

    lk = trail.get("local_key")
    if lk and lk in _CACHE_OM_CHUVA_RAW:
        times, precips = _CACHE_OM_CHUVA_RAW[lk]
    else:
        data = None
        for attempt in range(3):
            try:
                url = (
                    "https://api.open-meteo.com/v1/forecast"
                    f"?latitude={trail['lat']}&longitude={trail['lon']}"
                    "&past_days=2&forecast_days=0"
                    "&hourly=precipitation"
                    "&timezone=America%2FSao_Paulo"
                )
                with _om_urlopen(url) as r:
                    data = json.loads(r.read())
                break
            except Exception as exc:
                if attempt == 2:
                    print(f"  [OM hist] Falha após 3 tentativas: {exc}")
                    # Fallback: reusar registro anterior do Supabase com decaimento
                    fallback = _buscar_ultima_condicao_supabase(trail)
                    if fallback:
                        ef_prev   = float(fallback.get("acumulo_ef")   or 0.0)
                        b48_prev  = float(fallback.get("acumulo_48h")  or 0.0)
                        uc_prev   = fallback.get("ultima_chuva_h")
                        ref_str   = fallback.get("historico_atualizado_em") or fallback.get("gerado_em")
                        horas_delta = 0.0
                        if ref_str:
                            try:
                                ref_dt = datetime.fromisoformat(ref_str)
                                if ref_dt.tzinfo is None:
                                    ref_dt = ref_dt.replace(tzinfo=BRT)
                                horas_delta = max(0.0, (datetime.now(BRT) - ref_dt).total_seconds() / 3600)
                            except Exception:
                                pass
                        new_ef = round(ef_prev * (0.5 ** (horas_delta / meia_vida)), 2) if meia_vida > 0 else 0.0
                        uc_adj = round(uc_prev + horas_delta, 1) if uc_prev is not None else None
                        print(f"  [OM hist] ⚠️  fallback Supabase: ef {ef_prev:.1f}→{new_ef:.1f}mm (Δ{horas_delta:.0f}h) — veredicto conservador")
                        return {"chuva_solo_mm": b48_prev, "chuva_ceu_mm": b48_prev, "efetivo": new_ef, "ultima_chuva_h": uc_adj}
                    print(f"  [OM hist] ⚠️  sem fallback disponível — usando 0mm (veredicto pode ser otimista)")
                    return {"chuva_solo_mm": 0.0, "chuva_ceu_mm": 0.0, "efetivo": 0.0, "ultima_chuva_h": None}
                print(f"  [OM hist] Tentativa {attempt+1} falhou: {exc} — retentando em 5s...")
                time.sleep(5)
        times   = data.get("hourly", {}).get("time", [])
        precips = data.get("hourly", {}).get("precipitation", [])
        if lk:
            _CACHE_OM_CHUVA_RAW[lk] = (times, precips)

    # Nowcast bridge: sobrepõe últimas 6h com ICON seamless (lag ~1-2h vs 4-6h da análise NWP).
    # Cria cópia local — não altera _CACHE_OM_CHUVA_RAW (garoa detection usa o cache original).
    nowcast_raw = _fetch_om_nowcast_bridge(trail)
    if nowcast_raw:
        precips = list(precips)
        horas_patchadas = []
        for i, t in enumerate(times):
            if t in nowcast_raw and i < len(precips):
                nw   = nowcast_raw[t]
                orig = float(precips[i] or 0.0)
                if nw > orig:
                    precips[i] = nw
                    horas_patchadas.append((t, orig, nw))
        if horas_patchadas:
            delta_total = sum(nw - orig for _, orig, nw in horas_patchadas)
            print(f"  [OM nowcast] {trail['name']}: {len(horas_patchadas)}h patchadas "
                  f"+{delta_total:.1f}mm bruto (NWP lag corrigido)")

    # chuva_penetracao: fração da precipitação que efetivamente chega ao solo (interceptação de dossel)
    mes              = datetime.now(BRT).month
    chuva_penetracao = _lookup_bioma(trail, mes).get("chuva_penetracao", 1.0)

    chuva_solo_mm      = 0.0
    chuva_ceu_mm       = 0.0   # precipitação bruta OM sem interceptação de dossel
    chuva_solo_48h_mm  = 0.0   # chuva_solo_mm restrito a 48h — janela comparável ao OW day_summary (hoje+ontem)
    chuva_ceu_48h_mm   = 0.0
    efetivo            = 0.0
    ultima_chuva_h     = None

    # OW day_summary cobre hoje + ontem (2 dias calendário). Para comparação de lag ser
    # justa, o chuva_solo_mm OM deve usar a mesma janela — senão chuva de 3+ dias atrás infla
    # om_chuva_solo_mm e dificulta detectar lag real de hoje.
    ontem_00h = (agora - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    for i, t in enumerate(times):
        if t > agora_str:
            continue
        p_bruto     = float(precips[i] or 0.0) if i < len(precips) else 0.0
        p           = p_bruto * chuva_penetracao   # interceptação de dossel aplicada
        dt_entry    = datetime.fromisoformat(t).replace(tzinfo=BRT)
        horas_atras = max(0, (agora - dt_entry).total_seconds() / 3600)

        chuva_solo_mm += p
        chuva_ceu_mm  += p_bruto
        peso           = 0.5 ** (horas_atras / meia_vida) if meia_vida > 0 else 0.0
        efetivo       += p * peso

        if dt_entry >= ontem_00h:
            chuva_solo_48h_mm += p
            chuva_ceu_48h_mm  += p_bruto

        if p_bruto >= 0.1 and (ultima_chuva_h is None or horas_atras < ultima_chuva_h):
            ultima_chuva_h = round(horas_atras, 1)

    return {
        "chuva_solo_mm":     round(chuva_solo_mm, 1),
        "chuva_solo_48h_mm": round(chuva_solo_48h_mm, 1),
        "chuva_ceu_mm":      round(chuva_ceu_mm, 1),
        "chuva_ceu_48h_mm":  round(chuva_ceu_48h_mm, 1),
        "efetivo":           round(efetivo, 1),
        "ultima_chuva_h":    ultima_chuva_h,
    }


def _fetch_om_nowcast_bridge(trail: dict) -> dict:
    """
    Busca últimas 6h via Open-Meteo ICON seamless (past_hours=6).
    ICON tem lag ~1-2h vs 4-6h da análise NWP — patch para chuva recente não assimilada.
    Retorna {time_str: precip_bruto_mm}. Vazio em caso de falha (degradação elegante).
    """
    lk = trail.get("local_key")
    if lk and lk in _CACHE_OM_NOWCAST_RAW:
        return _CACHE_OM_NOWCAST_RAW[lk]
    try:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={trail['lat']}&longitude={trail['lon']}"
            "&past_hours=6&forecast_days=0"
            "&hourly=precipitation"
            "&models=icon_seamless"
            "&timezone=America%2FSao_Paulo"
        )
        with _om_urlopen(url, timeout=15) as r:
            data = json.loads(r.read())
        times_nc   = data.get("hourly", {}).get("time", [])
        precips_nc = data.get("hourly", {}).get("precipitation", [])
        result = {t: float(p or 0.0) for t, p in zip(times_nc, precips_nc)}
        if lk:
            _CACHE_OM_NOWCAST_RAW[lk] = result
        return result
    except Exception as exc:
        print(f"  [OM nowcast] Falha para {trail['name']}: {exc}")
        return {}


def fetch_ow_day_summary(trail: dict) -> dict:
    """
    Precipitação diária via /data/3.0/onecall/day_summary (2 chamadas: hoje + ontem).
    Mais confiável que timemachine para chuva total — retorna o dia inteiro em 1 chamada.
    Retorna {"chuva_ow_mm": mm_total, "hoje": mm_hoje, "ontem": mm_ontem}.
    """
    lk = trail.get("local_key")
    if lk and lk in _CACHE_OW_DAY_SUMMARY:
        return _CACHE_OW_DAY_SUMMARY[lk]

    if not OPENWEATHER_KEY and not WEATHERAPI_KEY:
        return {"chuva_ow_mm": 0.0, "hoje": 0.0, "ontem": 0.0}

    agora  = datetime.now(BRT)
    totais: dict[str, float] = {}
    ow_falhou: set[str] = set()
    _ow_day_ok = 0
    _ow_day_fail = 0

    for delta in range(2):          # 0 = hoje, 1 = ontem
        dia = (agora - timedelta(days=delta)).strftime("%Y-%m-%d")
        if not OPENWEATHER_KEY:
            ow_falhou.add(dia)
            continue
        url = (
            f"https://api.openweathermap.org/data/3.0/onecall/day_summary"
            f"?lat={trail['lat']}&lon={trail['lon']}&date={dia}"
            f"&appid={OPENWEATHER_KEY}&units=metric"
        )
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=20) as r:
                    data = json.loads(r.read())
                totais[dia] = float(data.get("precipitation", {}).get("total", 0.0) or 0.0)
                _ow_day_ok += 1
                break
            except Exception as exc:
                if attempt == 2:
                    totais[dia] = 0.0
                    ow_falhou.add(dia)
                    _ow_day_fail += 1
                    print(f"  [OW day_summary] Falha {dia} para {trail['name']}: {exc}")
                else:
                    time.sleep(2 ** attempt)

    _log_api("openweathermap", "day_summary",
             chamadas=_ow_day_ok + _ow_day_fail,
             sucesso=_ow_day_ok, falhas=_ow_day_fail)

    for dia in ow_falhou:
        totais[dia] = _fetch_weatherapi_precip_dia(trail, dia)

    hoje_str  = agora.strftime("%Y-%m-%d")
    ontem_str = (agora - timedelta(days=1)).strftime("%Y-%m-%d")
    hoje_mm     = totais.get(hoje_str,  0.0)
    ontem_mm    = totais.get(ontem_str, 0.0)
    chuva_ow_mm = round(hoje_mm + ontem_mm, 1)

    print(f"  [OW day_summary] {trail['name']}: hoje={hoje_mm:.1f}mm ontem={ontem_mm:.1f}mm → total={chuva_ow_mm:.1f}mm")

    resultado = {"chuva_ow_mm": chuva_ow_mm, "hoje": hoje_mm, "ontem": ontem_mm}
    if lk:
        _CACHE_OW_DAY_SUMMARY[lk] = resultado
    return resultado


def fetch_openmeteo(trail: dict) -> dict | None:
    lk = trail.get("local_key")
    if lk and lk in _CACHE_OM_FORECAST:
        return _CACHE_OM_FORECAST[lk]
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={trail['lat']}&longitude={trail['lon']}"
        "&hourly=precipitation,windspeed_10m,windgusts_10m,precipitation_probability,temperature_2m"
        "&forecast_days=4&timezone=America%2FSao_Paulo"
    )
    resultado = None
    for attempt in range(3):
        try:
            with _om_urlopen(url) as r:
                resultado = json.loads(r.read().decode("utf-8"))
            break
        except (urllib.error.URLError, OSError):
            if attempt == 2:
                resultado = None
            else:
                time.sleep(2 ** attempt)
    if lk and resultado is not None:
        _CACHE_OM_FORECAST[lk] = resultado
    return resultado

# ---------------------------------------------------------------------------
# Modelo de secagem do solo — V5.21
# ---------------------------------------------------------------------------

def fator_tolerancia(trail: dict) -> float:
    base = _lookup_bioma(trail).get("tolerancia_bioma", 1.0)
    sens = float(trail.get("sensibilidade") or 1.0)
    return base * sens


def _meia_vida(trail: dict) -> float:
    solo  = trail.get("solo_type", "terra")
    expo  = trail.get("exposicao", "fechada")
    macro = _macro_regiao(trail.get("regiao") or "")   # 'SUL', 'SUDESTE', etc.
    tabela_mv = _carregar_meia_vida()
    return float(
        tabela_mv.get((solo, expo, macro)) or
        tabela_mv.get((solo, expo, "DEFAULT")) or
        24
    )

def _ajustar_meia_vida_clima(meia_vida_base: float, trail: dict,
                             temp_c: float | None = None,
                             wind_ms: float | None = None,
                             cloud_pct: float | None = None,
                             humidity_pct: float | None = None) -> float:
    meia_vida = float(meia_vida_base)
    registros = _carregar_meia_vida_clima_mult()

    # Coeficientes de dossel: filtram quanto do vento/sol externo chega ao solo
    mes       = datetime.now(BRT).month
    bioma_cfg = _lookup_bioma(trail, mes)
    vento_penetracao = bioma_cfg.get("vento_penetracao", 1.0)
    sol_penetracao   = bioma_cfg.get("sol_penetracao",   1.0)

    def _aplicar(valor: float, variavel: str, exposicao: str | None = None) -> None:
        nonlocal meia_vida
        for r in registros:
            if r["variavel"] != variavel:
                continue
            if exposicao is not None and r.get("exposicao") != exposicao:
                continue
            v_min = r["valor_min"]
            v_max = r["valor_max"]
            if (v_min is None or valor >= v_min) and (v_max is None or valor <= v_max):
                meia_vida *= r["multiplicador"]
                return

    if temp_c is not None:
        _aplicar(temp_c, "temperatura")

    if wind_ms is not None:
        # vento_penetracao: apenas a fração que chega ao nível do solo (dossel filtra o restante)
        wind_kmh = wind_ms * 3.6 * vento_penetracao
        _aplicar(wind_kmh, "vento")
        # Combo calor+vento: usa o vento efetivo ao solo
        if temp_c is not None and temp_c >= 30 and wind_kmh >= 20:
            combo = next((r["multiplicador"] for r in registros if r["variavel"] == "combo"), None)
            if combo is not None:
                meia_vida *= combo

    if cloud_pct is not None:
        # sol_penetracao: quanto do sol disponível realmente chega ao solo
        # cloud_efetivo: mesmo céu limpo, dossel fechado ≈ 98% de sombra
        cloud_efetivo = 100.0 - (100.0 - cloud_pct) * sol_penetracao
        _aplicar(cloud_efetivo, "nebulosidade")

    if humidity_pct is not None:
        _aplicar(humidity_pct, "umidade")

    # Combo garoa: umidade alta + nebulosidade alta simultaneamente
    # Captura dias frios/nublados com garoa persistente que não acumulam mm significativos
    if humidity_pct is not None and humidity_pct >= 85 and cloud_pct is not None and cloud_pct >= 70:
        combo_garoa = next(
            (r["multiplicador"] for r in registros if r["variavel"] == "umidade_nebulosidade_combo"),
            None,
        )
        if combo_garoa is not None:
            meia_vida *= combo_garoa

    # FIX #5: exposicao removida daqui — já está na tabela meia_vida_secagem (Supabase)
    # Manter aqui causava double counting (terra fechada=36h já embute o efeito)

    # trail_type_config: multiplica meia_vida por (trail_type × exposicao)
    # Substitui: bikepark rows em meia_vida_clima_mult + natural_meia_vida_mult em configuracoes_sistema
    meia_vida *= _lookup_trail_type(trail)["meia_vida_mult"]

    mv_min = float(_get_config("meia_vida_min") or 4.0)
    mv_max = float(_get_config("meia_vida_max") or 72.0)
    return round(max(mv_min, min(mv_max, meia_vida)), 1)


def _fetch_vento_weatherapi(trail: dict, agora: "datetime") -> tuple[float | None, float | None]:
    """
    Fallback de vento histórico via weatherapi.com quando Open-Meteo falha.
    Retorna (vento_max_kmh, rajada_max_kmh) das últimas 48h ou (None, None) se indisponível.
    """
    if not WEATHERAPI_KEY:
        print("  [WeatherAPI] WEATHERAPI_KEY ausente — fallback indisponível")
        return None, None
    vento_max  = None
    rajada_max = None
    try:
        for delta_dias in range(2):
            dia = (agora - timedelta(days=delta_dias)).strftime("%Y-%m-%d")
            url = (
                f"https://api.weatherapi.com/v1/history.json"
                f"?key={WEATHERAPI_KEY}"
                f"&q={trail['lat']},{trail['lon']}"
                f"&dt={dia}"
            )
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read().decode("utf-8"))
            for hora in data.get("forecast", {}).get("forecastday", [{}])[0].get("hour", []):
                v = hora.get("wind_kph")
                g = hora.get("gust_kph")
                if v is not None:
                    vento_max  = max(vento_max,  v) if vento_max  is not None else v
                if g is not None:
                    rajada_max = max(rajada_max, g) if rajada_max is not None else g
        print(f"  [WeatherAPI] vento={vento_max} km/h rajada={rajada_max} km/h")
    except Exception as exc:
        print(f"  [WeatherAPI] Falha no fallback: {exc}")
    return vento_max, rajada_max


def fetch_vento_historico(trail: dict, ow_vento_max_kmh: float | None = None) -> dict:
    """
    Busca rajadas históricas (Open-Meteo /archive — ERA5 observado).
    Vento sustentado OW é recebido como parâmetro já extraído de fetch_onecall_historico,
    eliminando chamada redundante ao timemachine da One Call API.
    """
    agora     = datetime.now(BRT)
    agora_str = agora.strftime("%Y-%m-%dT%H:00")

    # Open-Meteo /forecast com past_days=2: fonte de vento sustentado + rajadas históricas
    om_rajada_max = None
    om_vento_max  = None
    lk = trail.get("local_key")
    try:
        if lk and lk in _CACHE_OM_VENTO_RAW:
            times, speeds, gusts = _CACHE_OM_VENTO_RAW[lk]
        else:
            url_om = (
                "https://api.open-meteo.com/v1/forecast"
                f"?latitude={trail['lat']}&longitude={trail['lon']}"
                "&past_days=2&forecast_days=0"
                "&hourly=windspeed_10m,windgusts_10m"
                "&timezone=America%2FSao_Paulo"
            )
            data_om = None
            for tentativa in range(3):
                try:
                    with _om_urlopen(url_om) as r:
                        data_om = json.loads(r.read().decode("utf-8"))
                    break
                except Exception as exc_om:
                    if tentativa == 2:
                        raise
                    print(f"  [OM vento] Tentativa {tentativa + 1} falhou: {exc_om} — aguardando {2 ** tentativa}s")
                    time.sleep(2 ** tentativa)
            times  = data_om.get("hourly", {}).get("time", [])
            speeds = data_om.get("hourly", {}).get("windspeed_10m", [])
            gusts  = data_om.get("hourly", {}).get("windgusts_10m", [])
            if lk:
                _CACHE_OM_VENTO_RAW[lk] = (times, speeds, gusts)
        passados = [i for i, t in enumerate(times) if t <= agora_str]
        if passados:
            om_vento_max  = max((speeds[i] for i in passados if speeds[i] is not None), default=None)
            om_rajada_max = max((gusts[i]  for i in passados if i < len(gusts) and gusts[i] is not None), default=None)
    except Exception as exc:
        print(f"  [OM vento] Falha após 3 tentativas: {exc} — tentando WeatherAPI")
        om_vento_max, om_rajada_max = _fetch_vento_weatherapi(trail, agora)


    # Vento sustentado: média entre OW (timemachine, já coletado) e OM (archive)
    # OW fornece m/s → já convertido para km/h em fetch_onecall_historico
    fontes_sustentado = [v for v in [ow_vento_max_kmh, om_vento_max] if v is not None]
    vento_max_kmh  = round(sum(fontes_sustentado) / len(fontes_sustentado), 1) if fontes_sustentado else 0.0
    rajada_max_kmh = round(om_rajada_max, 1) if om_rajada_max is not None else None

    # Classificação graduada de risco de vento (3 níveis)
    raj = rajada_max_kmh or 0.0
    if vento_max_kmh > 90 or raj > 90:
        nivel_vento = 3   # Tempestade — alto risco de queda de árvores pela raiz
    elif vento_max_kmh > 65 or raj > 80:
        nivel_vento = 2   # Ventos fortes — árvores saudáveis em risco
    elif vento_max_kmh > 55 or raj > 60:
        nivel_vento = 1   # Moderado a forte — galhos comprometidos
    else:
        nivel_vento = 0

    fonte_str = []
    if om_vento_max is not None or om_rajada_max is not None:
        fonte_str.append("Open-Meteo (archive)")

    return {
        "vento_max_kmh":  vento_max_kmh,
        "rajada_max_kmh": rajada_max_kmh,
        "nivel_vento":    nivel_vento,
        "alerta_arvores": nivel_vento >= 1,
        "fonte":          " + ".join(fonte_str) if fonte_str else "indisponível",
    }


def resumo_openmeteo(data: dict) -> dict:
    if not data:
        return None
    try:
        hourly       = data["hourly"]
        precip       = hourly.get("precipitation", [])[:24]
        precip_48    = hourly.get("precipitation", [])[:48]
        wind         = hourly.get("windspeed_10m", [])[:24]
        gusts        = hourly.get("windgusts_10m", [])[:24]
        pop          = hourly.get("precipitation_probability", [])[:24]
        temps        = hourly.get("temperature_2m", [])[:24]
        wind_ms      = [w / 3.6 for w in wind if w is not None]
        gust_ms      = [g / 3.6 for g in gusts if g is not None]
        temps_valid  = [t for t in temps if t is not None]
        rain_mm      = sum(p for p in precip if p is not None)
        pop_max      = max((p for p in pop if p is not None), default=0)
        wind_max     = max(wind_ms, default=0)
        gust_max     = max(gust_ms, default=0)
        precip_clean = [p if p is not None else 0.0 for p in precip_48]
        pico_3h      = max(
            (sum(precip_clean[i:i+3]) for i in range(max(1, len(precip_clean) - 2))),
            default=0.0
        )
        tmax = round(max(temps_valid, default=25))
        tmin = round(min(temps_valid, default=tmax))
        return {
            "rain":     round(rain_mm, 1),
            "wind":     round(wind_max, 1),
            "pop":      round(pop_max),
            "pico_3h":  round(pico_3h, 1),
            "gust_max": round(gust_max, 1),
            "tmax":     tmax,
            "tmin":     tmin,
        }
    except (KeyError, TypeError):
        return None

# ---------------------------------------------------------------------------
# Solo — Tabela Mestra Supabase
# ---------------------------------------------------------------------------

_CACHE_SOLO: dict = {}
_CACHE_TABELA_SOLO: list = []
_CACHE_OW_ONECALL: dict = {}      # local_key → raw JSON forecast
_CACHE_OM_CLIMA_RAW: dict = {}     # local_key → {times, temp, humidity, clouds, wind_speed, dew_point, weather_codes} do batch hist
_CACHE_OW_DAY_SUMMARY: dict = {}   # local_key → {"chuva_ow_mm", "hoje", "ontem"}
_CACHE_OM_FORECAST: dict = {}      # local_key → raw JSON forecast
_CACHE_OM_CHUVA_RAW: dict = {}     # local_key → (times, precips)
_CACHE_OM_VENTO_RAW: dict = {}     # local_key → (times, speeds, gusts)
_CACHE_OM_NOWCAST_RAW: dict = {}   # local_key → {time_str: precip_bruto_mm} — ICON seamless, past_hours=6
_CACHE_THRESHOLD: dict = {}
_CACHE_MEIA_VIDA: dict = {}
_CACHE_ENSO_REGIONAL: dict = {}
_CACHE_CONFIG: dict = {}
_CACHE_ENSO_CONFIG: list = []
_CACHE_ADERENCIA_THRESHOLDS: list = []
_CACHE_VEREDICTO_PESOS: list = []
_CACHE_VEREDICTO_LIMIARES: list = []
_CACHE_MEIA_VIDA_CLIMA_MULT: list = []
_CACHE_BIOMAS: list = []
_CACHE_TRAIL_TYPE_CONFIG: list = []
_CACHE_SOLO_TYPE_CONFIG: list = []
_CACHE_INCLINACAO_CONFIG: list = []
_CACHE_SCORE_CONFIG: dict = {}
_CACHE_ADERENCIA_DESCRICOES: dict = {}

# Tabela local de fallback — usada se Supabase estiver indisponível
def _carregar_configuracoes() -> dict:
    """
    Carrega configurações do sistema da tabela configuracoes_sistema.
    Usa service key — não exposto para usuários.
    Fallback para variáveis de ambiente se Supabase falhar.
    """
    global _CACHE_CONFIG
    if _CACHE_CONFIG:
        return _CACHE_CONFIG
    try:
        url = f"{SUPABASE_URL}/rest/v1/configuracoes_sistema?select=chave,valor"
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        config = {row["chave"]: row["valor"] for row in dados}
        _CACHE_CONFIG = config
        print(f"  [Config] Carregado do Supabase: {list(config.keys())}")
        return config
    except Exception as exc:
        print(f"  [Config] Erro: {exc} — usando variáveis de ambiente")
        return {}


def _get_config(chave: str, fallback_env: str = None) -> str | None:
    """Busca configuração do Supabase com fallback para variável de ambiente."""
    config = _carregar_configuracoes()
    valor = config.get(chave)
    if valor:
        return valor
    if fallback_env:
        return os.getenv(fallback_env)
    return None


def _carregar_tabela_solo() -> list:
    """Carrega tabela mestra de solo do Supabase uma única vez por execução."""
    global _CACHE_TABELA_SOLO
    if _CACHE_TABELA_SOLO:
        return _CACHE_TABELA_SOLO

    if not SUPABASE_KEY:
        print("  [ERRO CRÍTICO] SUPABASE_KEY ausente — tabela_solo indisponível")
        return []

    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/tabela_solo"
            f"?select=solo_type,bioma,regiao,clay_pct,sand_pct,texture_class"
            f"&order=solo_type.asc"
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type":  "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_TABELA_SOLO = dados
        print(f"  [Solo] Tabela mestra carregada do Supabase: {len(dados)} registros")
        return dados
    except Exception as exc:
        print(f"  [ERRO CRÍTICO] tabela_solo indisponível no Supabase: {exc} — clay_pct não será calculado")
        return []


def _lookup_solo(solo_type: str, bioma: str, regiao: str) -> dict:
    """
    Consulta tabela mestra com prioridade:
    1. Match exato: solo_type + bioma + regiao
    2. Match: solo_type + bioma + regiao=NULL (wildcard de região)
    3. Fallback: solo_type + bioma=NULL + regiao=NULL (wildcard universal)
    4. Default misto padrão
    """
    tabela = _carregar_tabela_solo()
    regiao_upper = (regiao or "").upper().strip() or None
    bioma_norm   = (bioma or "").strip() or None
    solo_norm    = (solo_type or "misto").strip().lower()

    for row in tabela:
        if (row["solo_type"] == solo_norm and
                row["bioma"] == bioma_norm and
                row["regiao"] == regiao_upper):
            return {"clay_pct": row["clay_pct"], "sand_pct": row["sand_pct"], "texture_class": row["texture_class"]}

    for row in tabela:
        if (row["solo_type"] == solo_norm and
                row["bioma"] == bioma_norm and
                row["regiao"] is None):
            return {"clay_pct": row["clay_pct"], "sand_pct": row["sand_pct"], "texture_class": row["texture_class"]}

    for row in tabela:
        if row["solo_type"] == solo_norm and row["bioma"] is None and row["regiao"] is None:
            return {"clay_pct": row["clay_pct"], "sand_pct": row["sand_pct"], "texture_class": row["texture_class"]}

    return {"clay_pct": 32, "sand_pct": 35, "texture_class": "Franco-argiloso"}


def _carregar_threshold_sazonal() -> dict:
    global _CACHE_THRESHOLD
    if _CACHE_THRESHOLD:
        return _CACHE_THRESHOLD
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/threshold_sazonal"
            f"?select=regiao,mes,threshold_descansado,threshold_saturado"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        tabela: dict = {}
        for row in dados:
            regiao = row["regiao"]
            mes    = row["mes"]
            if regiao not in tabela:
                tabela[regiao] = {}
            tabela[regiao][mes] = (row["threshold_descansado"], row["threshold_saturado"])
        _CACHE_THRESHOLD = tabela
        print(f"  [Threshold] Carregado do Supabase: {len(dados)} registros")
        return tabela
    except Exception as exc:
        print(f"  [Threshold] Erro: {exc} — sem dados; threshold de mes usa (5.0, 10.0)")
        return {}


def _carregar_meia_vida() -> dict:
    global _CACHE_MEIA_VIDA
    if _CACHE_MEIA_VIDA:
        return _CACHE_MEIA_VIDA
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/meia_vida_secagem"
            f"?select=solo_type,exposicao,regiao,meia_vida_h"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        tabela: dict = {}
        for row in dados:
            # chave (solo_type, exposicao, regiao) — regiao pode ser None (entrada global)
            tabela[(row["solo_type"], row["exposicao"], row.get("regiao"))] = row["meia_vida_h"]
        _CACHE_MEIA_VIDA = tabela
        print(f"  [MeiaVida] Carregado do Supabase: {len(dados)} registros")
        return tabela
    except Exception as exc:
        print(f"  [ERRO CRÍTICO] meia_vida_secagem indisponível no Supabase: {exc} — meia_vida usará default 24h")
        return {}


def _carregar_enso_config() -> list:
    """Carrega multiplicadores ENSO do Supabase. Fallback: registro neutro (mult=1.0)."""
    global _CACHE_ENSO_CONFIG
    if _CACHE_ENSO_CONFIG:
        return _CACHE_ENSO_CONFIG
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/enso_config"
            f"?select=fase,oni_min,oni_max,multiplicador,emoji"
            f"&ativo=eq.true&order=oni_min.desc.nullslast"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_ENSO_CONFIG = dados
        print(f"  [ENSO] Config carregada do Supabase: {len(dados)} fases")
        return dados
    except Exception as exc:
        print(f"  [ENSO] Erro: {exc} — usando neutro como fallback")
        return [{"fase": "neutro", "oni_min": -0.5, "oni_max": 0.5, "multiplicador": 1.00, "emoji": "🌤️"}]


def _carregar_enso_regional_mult() -> dict:
    """Carrega multiplicadores ENSO por região. Estrutura: {(fase_raw, regiao): mult}."""
    global _CACHE_ENSO_REGIONAL
    if _CACHE_ENSO_REGIONAL:
        return _CACHE_ENSO_REGIONAL
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/enso_regional_mult"
            f"?select=fase,regiao,multiplicador&ativo=eq.true"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        tabela: dict = {}
        for row in dados:
            tabela[(row["fase"], row["regiao"])] = float(row["multiplicador"])
        _CACHE_ENSO_REGIONAL = tabela
        print(f"  [ENSO Regional] Carregado do Supabase: {len(dados)} registros")
        return tabela
    except Exception as exc:
        print(f"  [ENSO Regional] Erro: {exc} — usando multiplicador global")
        return {}


def _carregar_aderencia_thresholds() -> list:
    """Carrega thresholds de aderência do Supabase. Fallback: thresholds padrão."""
    global _CACHE_ADERENCIA_THRESHOLDS
    if _CACHE_ADERENCIA_THRESHOLDS:
        return _CACHE_ADERENCIA_THRESHOLDS
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/aderencia_thresholds"
            f"?select=status,ef_min,ef_max"
            f"&ativo=eq.true&order=ef_min.asc.nullsfirst"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_ADERENCIA_THRESHOLDS = dados
        print(f"  [Aderência] Thresholds carregados do Supabase: {len(dados)} registros")
        return dados
    except Exception as exc:
        print(f"  [Aderência] Erro: {exc} — usando thresholds padrão")
        return [
            {"status": "SECO",                  "ef_min": None, "ef_max": 0.0},
            {"status": "GRIP PERFEITO",         "ef_min": 0.0,  "ef_max": 3.0},
            {"status": "BOA ADERÊNCIA - ÚMIDO", "ef_min": 3.0,  "ef_max": 7.0},
            {"status": "BAIXA ADERÊNCIA",       "ef_min": 7.0,  "ef_max": None},
        ]


def _carregar_veredicto_pesos() -> list:
    """Carrega pesos de risco da tabela veredicto_pesos. Fallback: lista hardcoded."""
    global _CACHE_VEREDICTO_PESOS
    if _CACHE_VEREDICTO_PESOS:
        return _CACHE_VEREDICTO_PESOS
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/veredicto_pesos"
            f"?select=fator,peso"
            f"&ativo=eq.true"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_VEREDICTO_PESOS = dados
        print(f"  [Veredicto] Pesos carregados do Supabase: {len(dados)} fatores")
        return dados
    except Exception as exc:
        print(f"  [Veredicto] Erro ao carregar pesos: {exc} — usando fallback")
        return [
            {"fator": "aderencia_baixa",       "peso": 3},
            {"fator": "aderencia_boa_umido",    "peso": 2},
            {"fator": "aderencia_grip",        "peso": 1},
            {"fator": "pico_3h_muito_alto",    "peso": 2},
            {"fator": "pico_3h_alto",          "peso": 1},
            {"fator": "rain_alto",             "peso": 1},
            {"fator": "vento_alto",            "peso": 1},
            {"fator": "inclinacao_alta",       "peso": 2},
            {"fator": "inclinacao_media",      "peso": 1},
            {"fator": "vento_estrutural_alto", "peso": 2},
            {"fator": "vento_estrutural_med",  "peso": 1},
            {"fator": "solo_encharcado",       "peso": 1},
            {"fator": "chuva_iminente_alta",   "peso": 2},
            {"fator": "chuva_iminente",        "peso": 1},
        ]


def _carregar_veredicto_limiares() -> list:
    """Carrega limiares de decisão da tabela veredicto_limiares. Fallback: DROP≤1, ALERTAS≤3."""
    global _CACHE_VEREDICTO_LIMIARES
    if _CACHE_VEREDICTO_LIMIARES:
        return _CACHE_VEREDICTO_LIMIARES
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/veredicto_limiares"
            f"?select=limiar_max,texto_veredicto"
            f"&ativo=eq.true&order=ordem.asc"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_VEREDICTO_LIMIARES = dados
        print(f"  [Veredicto] Limiares carregados do Supabase: {len(dados)} registros")
        return dados
    except Exception as exc:
        print(f"  [Veredicto] Erro ao carregar limiares: {exc} — usando fallback")
        return [
            {"limiar_max": 1, "texto_veredicto": "DROP LIBERADO"},
            {"limiar_max": 3, "texto_veredicto": "DROP LIBERADO - Veja os alertas"},
        ]


def _carregar_meia_vida_clima_mult() -> list:
    """Carrega multiplicadores climáticos de meia-vida do Supabase. Fallback: valores originais hardcoded."""
    global _CACHE_MEIA_VIDA_CLIMA_MULT
    if _CACHE_MEIA_VIDA_CLIMA_MULT:
        return _CACHE_MEIA_VIDA_CLIMA_MULT
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/meia_vida_clima_mult"
            f"?select=variavel,valor_min,valor_max,exposicao,multiplicador"
            f"&ativo=eq.true&order=id.asc"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_MEIA_VIDA_CLIMA_MULT = dados
        print(f"  [MeiaVida] Mult clima carregados do Supabase: {len(dados)} registros")
        return dados
    except Exception as exc:
        print(f"  [MeiaVida] Erro: {exc} — usando multiplicadores padrão")
        return [
            {"variavel": "temperatura",  "valor_min": 35,   "valor_max": None, "exposicao": None,      "multiplicador": 0.65},
            {"variavel": "temperatura",  "valor_min": 30,   "valor_max": 35,   "exposicao": None,      "multiplicador": 0.75},
            {"variavel": "temperatura",  "valor_min": 26,   "valor_max": 30,   "exposicao": None,      "multiplicador": 0.86},
            {"variavel": "temperatura",  "valor_min": None, "valor_max": 16,   "exposicao": None,      "multiplicador": 1.12},
            {"variavel": "vento",        "valor_min": 40,   "valor_max": None, "exposicao": None,      "multiplicador": 0.75},
            {"variavel": "vento",        "valor_min": 20,   "valor_max": 40,   "exposicao": None,      "multiplicador": 0.85},
            {"variavel": "vento",        "valor_min": 10.8, "valor_max": 20,   "exposicao": None,      "multiplicador": 0.92},
            {"variavel": "vento",        "valor_min": None, "valor_max": 3.6,  "exposicao": None,      "multiplicador": 1.05},
            {"variavel": "combo",        "valor_min": None, "valor_max": None, "exposicao": None,      "multiplicador": 0.80},
            {"variavel": "nebulosidade", "valor_min": 90,   "valor_max": None, "exposicao": None,      "multiplicador": 1.12},
            {"variavel": "nebulosidade", "valor_min": 70,   "valor_max": 90,   "exposicao": None,      "multiplicador": 1.06},
            {"variavel": "nebulosidade", "valor_min": None, "valor_max": 25,   "exposicao": None,      "multiplicador": 0.94},
            {"variavel": "umidade",      "valor_min": 95,   "valor_max": None, "exposicao": None,      "multiplicador": 1.15},
            {"variavel": "umidade",      "valor_min": 85,   "valor_max": 95,   "exposicao": None,      "multiplicador": 1.08},
            {"variavel": "umidade",      "valor_min": None, "valor_max": 45,   "exposicao": None,      "multiplicador": 0.93},
            {"variavel": "bikepark",     "valor_min": None, "valor_max": None, "exposicao": "fechada", "multiplicador": 0.60},
            {"variavel": "bikepark",     "valor_min": None, "valor_max": None, "exposicao": "aberta",  "multiplicador": 0.35},
        ]


def _carregar_biomas() -> list:
    """Fonte única de verdade para coeficientes de dossel por bioma × exposição.
    Substitui microclima_config para drying logic (chuva_penetracao, vento_penetracao, sol_penetracao, tolerancia_bioma)."""
    global _CACHE_BIOMAS
    if _CACHE_BIOMAS:
        return _CACHE_BIOMAS
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/biomas"
            f"?select=bioma,exposicao,altitude_min,chuva_penetracao,vento_penetracao,sol_penetracao"
            f",mes_sazonal_inicio,mes_sazonal_fim"
            f",chuva_penetracao_sazonal,vento_penetracao_sazonal,sol_penetracao_sazonal"
            f",tolerancia_bioma"
            f"&ativo=eq.true&order=altitude_min.desc.nullslast"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_BIOMAS = dados
        print(f"  [Biomas] Tabela carregada: {len(dados)} registros")
        return dados
    except Exception as exc:
        print(f"  [Biomas] Erro: {exc} — usando fallback conservador")
        return [
            {"bioma": "Mata Atlântica", "exposicao": "fechada", "altitude_min": 600,  "chuva_penetracao": 0.180, "vento_penetracao": 0.100, "sol_penetracao": 0.025, "tolerancia_bioma": 0.50, "mes_sazonal_inicio": None, "mes_sazonal_fim": None, "chuva_penetracao_sazonal": None, "vento_penetracao_sazonal": None, "sol_penetracao_sazonal": None},
            {"bioma": "Mata Atlântica", "exposicao": "fechada", "altitude_min": None, "chuva_penetracao": 0.225, "vento_penetracao": 0.125, "sol_penetracao": 0.035, "tolerancia_bioma": 0.90, "mes_sazonal_inicio": None, "mes_sazonal_fim": None, "chuva_penetracao_sazonal": None, "vento_penetracao_sazonal": None, "sol_penetracao_sazonal": None},
            {"bioma": "Mata Atlântica", "exposicao": "aberta",  "altitude_min": None, "chuva_penetracao": 0.965, "vento_penetracao": 0.600, "sol_penetracao": 0.775, "tolerancia_bioma": 0.90, "mes_sazonal_inicio": None, "mes_sazonal_fim": None, "chuva_penetracao_sazonal": None, "vento_penetracao_sazonal": None, "sol_penetracao_sazonal": None},
        ]


def _lookup_bioma(trail: dict, mes: int = None) -> dict:
    """Retorna coeficientes do bioma para a trilha, aplicando sazonalidade se aplicável.
    Prioridade: altitude_min preenchida (mais específico) antes de NULL (geral).
    Fallback: sem interceptação (coeficientes = 1.0).
    mista → usa 'fechada' como proxy conservador (biomas não tem linha mista)."""
    bioma     = trail.get("bioma", "Desconhecido")
    exposicao = trail.get("exposicao", "fechada")
    altitude  = trail.get("altitude_m", 0) or 0
    lookup_exposicao = "fechada" if exposicao == "mista" else exposicao

    for row in _carregar_biomas():
        if row["bioma"] != bioma or row["exposicao"] != lookup_exposicao:
            continue
        alt_min = row.get("altitude_min")
        if alt_min is not None and altitude < alt_min:
            continue
        # Aplica sazonalidade se estiver no período de dossel aberto
        ini = row.get("mes_sazonal_inicio")
        fim = row.get("mes_sazonal_fim")
        if mes and ini and fim and ini <= mes <= fim:
            return {**row,
                "chuva_penetracao": row["chuva_penetracao_sazonal"],
                "vento_penetracao": row["vento_penetracao_sazonal"],
                "sol_penetracao":   row["sol_penetracao_sazonal"],
            }
        return row

    return {"chuva_penetracao": 1.0, "vento_penetracao": 1.0, "sol_penetracao": 1.0, "tolerancia_bioma": 1.0}


def _carregar_trail_type_config() -> list:
    """Multiplicadores de meia_vida e score por trail_type × exposição.
    Centraliza: natural_meia_vida_mult (era configuracoes_sistema) e bikepark mult
    (era meia_vida_clima_mult variavel=bikepark, agora desativados nessa tabela)."""
    global _CACHE_TRAIL_TYPE_CONFIG
    if _CACHE_TRAIL_TYPE_CONFIG:
        return _CACHE_TRAIL_TYPE_CONFIG
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/trail_type_config"
            f"?select=trail_type,exposicao,meia_vida_mult,score_mult"
            f"&ativo=eq.true"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_TRAIL_TYPE_CONFIG = dados
        print(f"  [TrailType] Config carregada do Supabase: {len(dados)} registros")
        return dados
    except Exception as exc:
        print(f"  [TrailType] Erro: {exc} — usando valores padrão")
        return [
            {"trail_type": "natural",  "exposicao": "aberta",  "meia_vida_mult": 1.08, "score_mult": 1.00},
            {"trail_type": "natural",  "exposicao": "mista",   "meia_vida_mult": 1.15, "score_mult": 1.00},
            {"trail_type": "natural",  "exposicao": "fechada", "meia_vida_mult": 1.22, "score_mult": 1.00},
            {"trail_type": "bikepark", "exposicao": "aberta",  "meia_vida_mult": 0.35, "score_mult": 0.90},
            {"trail_type": "bikepark", "exposicao": "mista",   "meia_vida_mult": 0.48, "score_mult": 0.90},
            {"trail_type": "bikepark", "exposicao": "fechada", "meia_vida_mult": 0.60, "score_mult": 0.90},
        ]


def _lookup_trail_type(trail: dict) -> dict:
    """Retorna multiplicadores (meia_vida_mult, score_mult) para (trail_type, exposicao).
    Prioridade: match exato de exposição → row com exposicao NULL → padrão neutro."""
    trail_type = trail.get("trail_type", "natural")
    exposicao  = trail.get("exposicao", "fechada")
    rows       = _carregar_trail_type_config()

    exact   = next((r for r in rows if r["trail_type"] == trail_type and r["exposicao"] == exposicao), None)
    if exact:
        return exact
    generic = next((r for r in rows if r["trail_type"] == trail_type and r["exposicao"] is None), None)
    if generic:
        return generic
    return {"meia_vida_mult": 1.0, "score_mult": 1.0}


def _carregar_solo_type_config() -> list:
    """Carrega configuração de solo_type do Supabase. Fallback: valores originais hardcoded."""
    global _CACHE_SOLO_TYPE_CONFIG
    if _CACHE_SOLO_TYPE_CONFIG:
        return _CACHE_SOLO_TYPE_CONFIG
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/solo_type_config"
            f"?select=solo_type,fator_absorcao_base,score_mult"
            f"&ativo=eq.true"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_SOLO_TYPE_CONFIG = dados
        print(f"  [Solo] Config carregada do Supabase: {len(dados)} tipos")
        return dados
    except Exception as exc:
        print(f"  [Solo] Erro: {exc} — usando valores padrão")
        return [
            {"solo_type": "terra",    "fator_absorcao_base": 0.80, "score_mult": 1.05},
            {"solo_type": "preto",    "fator_absorcao_base": 0.60, "score_mult": 0.95},
            {"solo_type": "misto",    "fator_absorcao_base": 0.55, "score_mult": 1.00},
            {"solo_type": "misto_mg", "fator_absorcao_base": 0.45, "score_mult": 0.92},
            {"solo_type": "pedra",    "fator_absorcao_base": 0.25, "score_mult": 0.80},
            {"solo_type": "ferro",    "fator_absorcao_base": 0.30, "score_mult": 0.85},
        ]


def _carregar_inclinacao_config() -> list:
    """Carrega penalizadores de inclinação do Supabase. Fallback: valores originais hardcoded."""
    global _CACHE_INCLINACAO_CONFIG
    if _CACHE_INCLINACAO_CONFIG:
        return _CACHE_INCLINACAO_CONFIG
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/inclinacao_config"
            f"?select=tipo,valor_min,valor_max,delta_fator"
            f"&ativo=eq.true&order=id.asc"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_INCLINACAO_CONFIG = dados
        print(f"  [Inclinação] Config carregada do Supabase: {len(dados)} registros")
        return dados
    except Exception as exc:
        print(f"  [Inclinação] Erro: {exc} — usando valores padrão")
        return [
            {"tipo": "inclinacao", "valor_min": 30,  "valor_max": None, "delta_fator": -0.22},
            {"tipo": "inclinacao", "valor_min": 20,  "valor_max": 30,   "delta_fator": -0.15},
            {"tipo": "inclinacao", "valor_min": 10,  "valor_max": 20,   "delta_fator": -0.08},
            {"tipo": "desnivel",   "valor_min": 800, "valor_max": None, "delta_fator": -0.18},
            {"tipo": "desnivel",   "valor_min": 500, "valor_max": 800,  "delta_fator": -0.10},
            {"tipo": "desnivel",   "valor_min": 300, "valor_max": 500,  "delta_fator": -0.05},
        ]


def _carregar_score_config() -> dict:
    """Carrega coeficientes de score de configuracoes_sistema (grupo=scoring). Fallback: hardcoded."""
    global _CACHE_SCORE_CONFIG
    if _CACHE_SCORE_CONFIG:
        return _CACHE_SCORE_CONFIG
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/configuracoes_sistema"
            f"?select=chave,valor"
            f"&grupo=eq.scoring&ativo=eq.true"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        config = {}
        for row in dados:
            try:
                config[row["chave"]] = float(row["valor"])
            except (ValueError, TypeError):
                pass  # ignora linhas com valor não-numérico (ex: notas de migração)
        _CACHE_SCORE_CONFIG = config
        print(f"  [Score] Config carregada do Supabase: {len(config)} chaves")
        return config
    except Exception as exc:
        print(f"  [Score] Erro: {exc} — usando valores padrão")
        return {
            "coef_rain":                  0.6,
            "coef_pico_descansado":       0.7,
            "coef_pico_molhado":          1.0,
            "coef_acumulo":               0.3,
            "coef_base":                 10.0,
            "pico_threshold":            10.0,
            "bikepark_acumulo_threshold":  5.0,
            "bikepark_score_mult":         0.90,
            "bikepark_saturado_threshold": 10.0,
        }


def _carregar_aderencia_descricoes() -> dict:
    """Carrega descrições de aderência do Supabase. Fallback: {} (dict inline de _descricao_aderencia())."""
    global _CACHE_ADERENCIA_DESCRICOES
    if _CACHE_ADERENCIA_DESCRICOES:
        return _CACHE_ADERENCIA_DESCRICOES
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/aderencia_descricoes"
            f"?select=status,solo_type,texto"
            f"&ativo=eq.true"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        config = {(row["status"], row["solo_type"]): row["texto"] for row in dados}
        _CACHE_ADERENCIA_DESCRICOES = config
        print(f"  [Aderência] Descrições carregadas do Supabase: {len(config)} registros")
        return config
    except Exception as exc:
        print(f"  [Aderência] Erro ao carregar descrições: {exc} — usando dict inline")
        return {}


def _resolver_solo(lat: float, lon: float, solo_type: str = "misto",
                   bioma: str = "Desconhecido", regiao: str = "SP") -> dict | None:
    """Resolve clay_pct/sand_pct/texture_class via tabela mestra do Supabase."""
    key = (round(lat, 4), round(lon, 4))
    if key in _CACHE_SOLO:
        return _CACHE_SOLO[key]

    resultado = _lookup_solo(solo_type, bioma, regiao)
    _CACHE_SOLO[key] = resultado
    print(f"  [Solo] {solo_type}/{bioma}/{regiao} → clay={resultado['clay_pct']}%, sand={resultado['sand_pct']}%, texture={resultado['texture_class']}")
    return resultado


def fator_absorcao(trail: dict) -> float:
    solo_cfgs = _carregar_solo_type_config()
    solo_cfg  = next((c for c in solo_cfgs if c["solo_type"] == trail.get("solo_type")), None)

    if trail.get("clay_pct") is not None:
        base = round(0.20 + (trail["clay_pct"] / 100) * 1.60, 3)
        base = max(0.25, min(0.90, base))
    else:
        base = solo_cfg["fator_absorcao_base"] if solo_cfg else 0.55

    # FIX #5: exposicao removida daqui — já está embutida na meia_vida base por (solo_type, exposicao)
    # Manter aqui causava triple counting: fator_absorcao + _meia_vida + _ajustar_meia_vida_clima
    alt_bonus_min = float(_get_config("altitude_bonus_min") or 1200)
    alt_bonus     = float(_get_config("altitude_bonus")     or 0.05)
    if trail.get("altitude_m") is not None and trail["altitude_m"] > alt_bonus_min:
        base += alt_bonus
    # bikepark: terra compactada e drenagem projetada — comportamento neutro
    # penalizador removido; proteção de veredicto já garantida pela regra BAIXA ADERÊNCIA

    inclinacao = calcular_inclinacao(trail)
    inclinacao_cfgs = _carregar_inclinacao_config()
    if inclinacao is not None:
        for ic in (c for c in inclinacao_cfgs if c["tipo"] == "inclinacao"):
            if inclinacao >= ic["valor_min"] and (ic["valor_max"] is None or inclinacao <= ic["valor_max"]):
                base += ic["delta_fator"]
                break
    elif trail.get("desnivel_m") is not None:
        d = trail["desnivel_m"]
        for ic in (c for c in inclinacao_cfgs if c["tipo"] == "desnivel"):
            if d >= ic["valor_min"] and (ic["valor_max"] is None or d <= ic["valor_max"]):
                base += ic["delta_fator"]
                break

    return max(0.05, min(1.0, base))

def calcular_score_trilha(rain_mm: float, acumulo_ef: float, pico_3h: float,
                          trail: dict, mes: int, enso: dict) -> dict:
    sc              = _carregar_score_config()
    pico_thr        = float(sc.get("pico_threshold",           10.0))
    coef_pico_desc  = float(sc.get("coef_pico_descansado",      0.7))
    coef_pico_mol   = float(sc.get("coef_pico_molhado",         1.0))
    coef_rain       = float(sc.get("coef_rain",                 0.6))
    coef_acumulo    = float(sc.get("coef_acumulo",              0.3))
    coef_base       = float(sc.get("coef_base",                10.0))
    bk_acumulo_thr  = float(sc.get("bikepark_acumulo_threshold", 5.0))
    ttc_score_mult  = _lookup_trail_type(trail)["score_mult"]

    limiar_descanso = threshold_solo_descansado(mes, enso, trail)
    fator  = fator_absorcao(trail)
    solo_descansado = acumulo_ef < limiar_descanso

    if pico_3h >= pico_thr:
        impacto = pico_3h * (coef_pico_desc if solo_descansado else coef_pico_mol)
    else:
        impacto = rain_mm * coef_rain if solo_descansado else (rain_mm + acumulo_ef * coef_acumulo)

    impacto *= fator

    # FIX #7: solo_mult só aplicado quando clay_pct NÃO disponível
    # Quando clay_pct vem da tabela mestra, fator_absorcao já é calculado por ele
    # aplicar solo_mult manual por cima contradiz o dado real de argila
    if trail.get("clay_pct") is None:
        solo_cfg = next(
            (c for c in _carregar_solo_type_config() if c["solo_type"] == trail.get("solo_type", "terra")),
            None,
        )
        impacto *= solo_cfg["score_mult"] if solo_cfg else 1.0

    if trail.get("trail_type") == "bikepark":
        if acumulo_ef < bk_acumulo_thr:
            impacto *= ttc_score_mult

    score = max(0.0, min(100.0, impacto * coef_base))
    return {
        "score": round(score, 1),
        "solo_descansado": solo_descansado,
        "limiar_descanso": round(limiar_descanso, 1),
        "impacto": round(impacto, 2),
    }

def _descricao_aderencia(status: str, trail: dict, saturado: bool = False) -> str:
    trail_type = trail.get("trail_type", "natural")
    descricoes = _carregar_aderencia_descricoes()
    if trail_type == "bikepark" and saturado:
        texto = descricoes.get(("BIKEPARK_SATURADO", "default"))
        return texto or "Bike park saturado. Drenagem insuficiente para o volume acumulado — risco de lama, valetas e perda de tração."
    solo_type = trail["solo_type"]
    texto = descricoes.get((status, solo_type)) or descricoes.get((status, "default"))
    return texto or f"Solo em condição de {status.lower()}."

def calcular_aderencia(rain_mm: float, trail: dict, acumulo_ef: float = 0.0,
                       pico_3h: float = 0.0, mes: int = None, enso: dict = None,
                       garoa_ativa: bool = False,
                       secagem_bloqueada: bool = False) -> dict:
    if mes is None:
        mes = datetime.now(timezone(timedelta(hours=-3))).month
    if enso is None:
        enso = {"mult": 1.0, "fase": "ENSO Neutro"}

    base = calcular_score_trilha(rain_mm, acumulo_ef, pico_3h, trail, mes, enso)
    s = base["score"]

    # ef_normalizado calculado antes de _bikepark_saturado: ambas as comparações
    # (aderência e saturação de bikepark) precisam operar no mesmo espaço normalizado
    # para evitar o gap onde ef_norm > 7.0 (BAIXA) mas acumulo_ef < sat×fator_tol (BOA).
    fator_tol = fator_tolerancia(trail)
    ef_normalizado = acumulo_ef / fator_tol if fator_tol > 0 else acumulo_ef

    saturado = _bikepark_saturado(trail, acumulo_ef, ef_normalizado, mes, enso)

    # Thresholds carregados do Supabase (tabela aderencia_thresholds).
    # aderencia_status reflete o estado ATUAL do solo (histórico), sem pico_3h forecast.
    # pico_3h entra no veredicto como fator de risco, não na condição presente do solo.

    status = "BAIXA ADERÊNCIA"  # default seguro caso nenhum threshold dê match
    for thr in _carregar_aderencia_thresholds():
        ef_min = thr["ef_min"]
        ef_max = thr["ef_max"]
        # SECO (ef_min=null): inclusivo no upper (captura ef==0)
        # Demais: lower inclusivo, upper exclusivo
        acima  = ef_min is None or ef_normalizado >= ef_min
        abaixo = (ef_max is None or
                  (ef_normalizado <= ef_max if ef_min is None else ef_normalizado < ef_max))
        if acima and abaixo:
            status = thr["status"]
            break

    # Fator de recuperação: solo abaixo de 1.5x o threshold sazonal não justifica BAIXA ADERÊNCIA
    # 2.5x era excessivo: com base=8mm em junho (SP), bloqueava BAIXA até 18mm de ef — irreal.
    # 1.5x: em verão (base≈2mm) o guard nunca dispara (BAIXA começa em 6.3mm); em inverno
    # (base=8mm, limiar_descanso≈7.2) bloqueia até 10.8mm, deixando trilhas >11mm irem a BAIXA.
    # Exceções: bikepark saturado mantém BAIXA; chuva chegando ou atmosfera saturada bloqueiam
    # a recuperação — solo úmido em dia de garoa fechada com chuva prevista NÃO está se recuperando.
    limiar_descanso = threshold_solo_descansado(mes, enso, trail)
    chuva_iminente_rec = rain_mm > 3.0        # chuva prevista impede secagem real
    if (status == "BAIXA ADERÊNCIA"
            and acumulo_ef < limiar_descanso * 1.5
            and not saturado
            and not chuva_iminente_rec
            and not secagem_bloqueada):
        status = "BOA ADERÊNCIA - ÚMIDO"

    if trail.get("trail_type") == "bikepark":
        if saturado:
            pass  # BAIXA ADERÊNCIA permitida — solo saturado (threshold dinâmico com sensibilidade)
        else:
            if status == "BAIXA ADERÊNCIA":
                status = "BOA ADERÊNCIA - ÚMIDO"  # teto quando solo não está saturado
        if acumulo_ef >= 2.0 and status == "SECO":
            status = "GRIP PERFEITO"  # nunca SECO com umidade real no solo

    # Garoa ativa: superfície molhada mesmo com solo em GRIP PERFEITO.
    # O dossel intercepta ~80% dos mm (chuva_penetracao), mas raízes/pedras/folhas da trilha
    # ficam molhadas. Badge verde enganaria o rider — sinalizar como ÚMIDO.
    if garoa_ativa and status == "GRIP PERFEITO":
        status = "BOA ADERÊNCIA - ÚMIDO"

    emojis = {"SECO": "🟡", "GRIP PERFEITO": "🟢", "BOA ADERÊNCIA - ÚMIDO": "🔵", "BAIXA ADERÊNCIA": "🔴"}
    cores  = {"SECO": "#eab308", "GRIP PERFEITO": "#22c55e", "BOA ADERÊNCIA - ÚMIDO": "#84cc16", "BAIXA ADERÊNCIA": "#ef4444"}
    desc = _descricao_aderencia(status, trail, saturado=saturado)

    # Threshold efetivo para GRIP PERFEITO em unidades de acumulo_ef (estado histórico do solo).
    # Frontend usa este valor para a barra de progresso — elimina o 3.0 hardcoded.
    grip_ef_max = next(
        (t["ef_max"] for t in _carregar_aderencia_thresholds() if t.get("status") == "GRIP PERFEITO"),
        3.0
    )
    grip_threshold_ef = round(grip_ef_max * fator_tol, 3) if fator_tol > 0 else grip_ef_max

    return {
        "status": status,
        "score": s,
        "solo_descansado": base["solo_descansado"],
        "limiar_descanso": base["limiar_descanso"],
        "impacto": base["impacto"],
        "saturado": saturado,
        "emoji": emojis[status],
        "cor": cores[status],
        "desc": desc,
        "grip_threshold_ef": grip_threshold_ef,
    }

def veredicto(aderencia: dict, rain_mm: float, wind_ms: float, pico_3h: float = 0.0,
              inclinacao: float | None = None, trail: dict | None = None,
              acumulo_ef: float = 0.0, vento_hist: dict | None = None,
              aderencia_futura: dict = None,
              pico_proximas_3h: float = 0.0) -> dict:
    # NOTA: avaliação sempre acontece em Python. Adicionar fator no banco
    # sem atualizar o código não tem efeito.
    peso_por_fator = {p["fator"]: p["peso"] for p in _carregar_veredicto_pesos()}
    limiares       = _carregar_veredicto_limiares()
    lim_liberado   = limiares[0]["limiar_max"] if len(limiares) > 0 else 1
    lim_alertas    = limiares[1]["limiar_max"] if len(limiares) > 1 else 3

    status = aderencia["status"]
    risco = 0
    motivos = []

    if status == "BAIXA ADERÊNCIA":
        risco += peso_por_fator.get("aderencia_baixa", 3)
        motivos.append("aderência baixa")
    elif status == "BOA ADERÊNCIA - ÚMIDO":
        risco += peso_por_fator.get("aderencia_boa_umido", 2)
        motivos.append("solo úmido")
    elif status == "GRIP PERFEITO":
        risco += peso_por_fator.get("aderencia_grip", 1)
        motivos.append("aderência boa")

    if pico_3h >= 15.0:
        risco += peso_por_fator.get("pico_3h_muito_alto", 2)
        motivos.append("pico_3h muito alto")
    elif pico_3h >= 10.0:
        risco += peso_por_fator.get("pico_3h_alto", 1)
        motivos.append("pico_3h alto")

    if pico_proximas_3h >= 10.0:
        risco += peso_por_fator.get("chuva_iminente_alta", 2)
        motivos.append("chuva intensa iminente nas próximas 3h")
    elif pico_proximas_3h >= 5.0:
        risco += peso_por_fator.get("chuva_iminente", 1)
        motivos.append("chuva iminente nas próximas 3h")

    if rain_mm >= 8.0:
        risco += peso_por_fator.get("rain_alto", 1)
        motivos.append("chuva acumulada relevante")

    if wind_ms >= 12.0:
        risco += peso_por_fator.get("vento_alto", 1)
        motivos.append("vento forte")

    if inclinacao is not None:
        # FIX #4: inclinação só agrava risco quando há umidade real ou chuva prevista
        solo_com_umidade = rain_mm > 0 or acumulo_ef > 0
        if solo_com_umidade:
            if inclinacao > 30:
                risco += peso_por_fator.get("inclinacao_alta", 2)
                motivos.append("inclinação muito alta")
            elif inclinacao > 20:
                risco += peso_por_fator.get("inclinacao_media", 1)
                motivos.append("inclinação alta")

    if trail is not None and trail.get("trail_type") == "bikepark":
        # Solo em BAIXA ADERÊNCIA = encharcado além da drenagem do bikepark — não reduz
        if status != "BAIXA ADERÊNCIA":
            risco -= peso_por_fator.get("bikepark_reduz", 1)
            motivos.append("bikepark reduz severidade")
        if aderencia.get("saturado"):
            risco += peso_por_fator.get("bikepark_saturado", 2)
            motivos.append("bikepark saturado")

    if trail is not None and trail.get("trail_type") == "natural":
        if status in ("BOA ADERÊNCIA - ÚMIDO", "BAIXA ADERÊNCIA"):
            risco += peso_por_fator.get("trilha_natural_umida", 1)
            motivos.append("trilha natural com solo úmido")
        elif inclinacao is not None and inclinacao > 20 and rain_mm > 0:
            risco += peso_por_fator.get("trilha_natural_inclinada", 1)
            motivos.append("trilha natural inclinada com chuva prevista")

    # Vento histórico: impacto no veredicto por nível graduado
    if vento_hist is not None:
        nivel = vento_hist.get("nivel_vento", 0)
        solo_encharcado = aderencia.get("solo_descansado") is False  # acumulo_ef >= threshold

        if nivel >= 3:
            # Tempestade (>90 km/h): sobe veredicto automaticamente
            risco += peso_por_fator.get("vento_estrutural_alto", 2)
            motivos.append("vento de tempestade — risco alto de queda de árvores")
        elif nivel == 2:
            # Ventos fortes (65–90 km/h)
            risco += peso_por_fator.get("vento_estrutural_med", 1)
            motivos.append("ventos fortes — árvores saudáveis em risco")
            # Combinação solo encharcado + ventos fortes: raízes instáveis → adicional
            if solo_encharcado:
                risco += peso_por_fator.get("solo_encharcado", 1)
                motivos.append("solo encharcado agrava risco de queda")
        elif nivel == 1:
            # Moderado a forte (55–65 km/h): impacto só se solo encharcado
            if solo_encharcado:
                risco += peso_por_fator.get("solo_encharcado", 1)
                motivos.append("vento moderado com solo encharcado — galhos comprometidos")

    gust_kmh = trail.get("gust_max_kmh", 0.0) if trail else 0.0
    exposicao = (trail or {}).get("exposicao", "aberta")
    thresh_gust = 30.0 if exposicao == "aberta" else 50.0
    if gust_kmh >= thresh_gust:
        risco += peso_por_fator.get("rajada_prevista", 1)
        motivos.append(f"rajada prevista {gust_kmh} km/h ({exposicao})")

    _sev = {"SECO": 0, "GRIP PERFEITO": 1, "BOA ADERÊNCIA - ÚMIDO": 2, "BAIXA ADERÊNCIA": 3}
    if aderencia_futura is not None:
        sev_a = _sev.get(status, 0)
        sev_f = _sev.get(aderencia_futura.get("status", status), 0)
        if sev_f > sev_a:
            if aderencia_futura["status"] == "BAIXA ADERÊNCIA" and status != "BAIXA ADERÊNCIA":
                risco += peso_por_fator.get("piora_prevista_severa", 2)
                motivos.append("piora prevista severa")
            elif aderencia_futura["status"] == "BOA ADERÊNCIA - ÚMIDO" and status in ("SECO", "GRIP PERFEITO"):
                risco += peso_por_fator.get("piora_prevista", 1)
                motivos.append("piora prevista")
        elif sev_f < sev_a:
            risco = max(0, risco - peso_por_fator.get("melhora_prevista", 1))
            motivos.append("melhora prevista")

    risco = max(0, risco)

    if risco <= lim_liberado:
        return {
            "texto": "DROP LIBERADO",
            "emoji": "✅",
            "cor": "#16a34a",
            "bg": "#f0fdf4",
            "risco": risco,
            "motivo": ", ".join(motivos) if motivos else "condição favorável",
            "texto_dinamico": "",
        }
    elif risco <= lim_alertas:
        return {
            "texto": "DROP LIBERADO - Veja os alertas",
            "emoji": "⚠️",
            "cor": "#d97706",
            "bg": "#fffbeb",
            "risco": risco,
            "motivo": ", ".join(motivos) if motivos else "atenção por combinação de fatores",
            "texto_dinamico": "",
        }
    return {
        "texto": "MELHOR ESPERAR",
        "emoji": "🛑",
        "cor": "#ef4444",
        "bg": "#fef2f2",
        "risco": risco,
        "motivo": ", ".join(motivos) if motivos else "risco elevado",
        "texto_dinamico": "",
    }


def _carregar_ids_com_favorito() -> set | None:
    """
    Retorna conjunto de trilha_id (UUID) que possuem ao menos 1 favorito.
    Retorna None em caso de erro na API — o chamador deve processar tudo como fallback.
    """
    if not SUPABASE_KEY:
        return None
    try:
        url = f"{SUPABASE_URL}/rest/v1/favoritos?select=trilha_id"
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            rows = json.loads(r.read())
        ids = {row["trilha_id"] for row in rows}
        print(f"  [Favoritos] {len(ids)} trilha(s) com ao menos 1 favorito")
        return ids
    except Exception as exc:
        print(f"  [Favoritos] Erro ao carregar: {exc} — processando todas as trilhas")
        return None


def gravar_sem_favorito_bulk(trilhas: list) -> None:
    """
    Grava em lote registros 'SEM FAVORITO' em condicoes.
    Usa DELETE bulk + INSERT bulk: 2 chamadas API no total, independente da quantidade.
    """
    if not SUPABASE_KEY or not trilhas:
        return
    gerado_em = datetime.now(BRT).isoformat()
    ids_str   = ",".join(t["id"] for t in trilhas)

    url_del = f"{SUPABASE_URL}/rest/v1/condicoes?trilha_id=in.({ids_str})"
    req_del = urllib.request.Request(url_del, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    req_del.get_method = lambda: "DELETE"
    try:
        with urllib.request.urlopen(req_del, timeout=15):
            pass
    except Exception:
        pass

    payload = json.dumps([{
        "trilha_id":        t["id"],
        "gerado_em":        gerado_em,
        "aderencia_status": "SEM FAVORITO",
        "veredicto":        "Favorite esta trilha para gerar as condições",
        "veredicto_12h":    "Favorite esta trilha para gerar as condições",
    } for t in trilhas]).encode("utf-8")

    url_ins = f"{SUPABASE_URL}/rest/v1/condicoes"
    req_ins = urllib.request.Request(url_ins, data=payload, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    })
    req_ins.get_method = lambda: "POST"
    try:
        with urllib.request.urlopen(req_ins, timeout=15):
            pass
        print(f"  [SEM FAVORITO] {len(trilhas)} trilha(s) gravadas em lote (2 chamadas API)")
    except Exception as exc:
        print(f"  [Supabase] [ERRO] gravar_sem_favorito_bulk: {exc}")


def gravar_supabase(trilha_name: str, resultado: dict):
    """
    Grava condições da trilha no Supabase após processar.
    Retorna trilha_id (str) em caso de sucesso, None caso contrário.
    Falha silenciosa — nunca interrompe o fluxo do agent.
    """
    if not SUPABASE_KEY:
        return None
    try:
        # Busca o id da trilha pelo nome
        url_busca = (
            f"{SUPABASE_URL}/rest/v1/trilhas"
            f"?name=eq.{urllib.parse.quote(trilha_name)}"
            f"&select=id"
            f"&limit=1"
        )
        req = urllib.request.Request(
            url_busca,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            trilhas = json.loads(r.read())
        if not trilhas:
            print(f"  [Supabase] Trilha '{trilha_name}' não encontrada no banco.")
            return False
        trilha_id = trilhas[0]["id"]

        # Monta payload com condições
        aderencia = resultado.get("aderencia", {})
        veredicto = resultado.get("veredicto", {})
        veredicto_12h = resultado.get("veredicto_12h", {})
        vento_hist = resultado.get("vento_hist", {})
        enso = resultado.get("enso", {})
        fds = resultado.get("fds", {})

        payload = json.dumps({
            "trilha_id":          trilha_id,
            "gerado_em":          datetime.now(BRT).isoformat(),
            "aderencia_status":   aderencia.get("status"),
            "aderencia_score":    aderencia.get("score"),
            "aderencia_desc":     aderencia.get("desc"),
            "veredicto":          veredicto.get("texto"),
            "veredicto_12h":      veredicto_12h.get("veredicto", {}).get("texto"),
            "rain_mm":            resultado.get("rain"),
            "rain_12h":           veredicto_12h.get("rain"),
            "wind_ms":            resultado.get("wind"),
            "wind_12h":           veredicto_12h.get("wind"),
            "pop_48h":            resultado.get("pop"),
            "pop_12h":            veredicto_12h.get("pop"),
            "temp_max":           resultado.get("temp_max"),
            "temp_min":           resultado.get("temp_min"),
            "pico_3h":            resultado.get("pico_3h"),
            "acumulo_48h":        resultado.get("acumulo_48h"),
            "acumulo_ef":         resultado.get("acumulo_ef"),
            "ultima_chuva_h":     resultado.get("ultima_chuva_h"),
            "meia_vida_base_h":   resultado.get("meia_vida_base_h"),
            "meia_vida_h":        resultado.get("meia_vida_h"),
            "cloud_pct":          resultado.get("nublado_pct"),
            "humidity_pct":       resultado.get("umidade_pct"),
            "temp_media_c":       resultado.get("temp_media_c"),
            "gust_max_kmh":       resultado.get("gust_max_kmh"),
            "horarios_chuva":     resultado.get("horarios_chuva"),
            "frase_secagem":      resultado.get("resumo_secagem_frase"),
            "solo_descansado":    aderencia.get("solo_descansado"),
            "limiar_descanso":    resultado.get("limiar_descanso"),
            "clay_pct":           resultado.get("clay_pct"),
            "sand_pct":           resultado.get("sand_pct"),
            "texture_class":      resultado.get("texture_class"),
            "inclinacao":         resultado.get("inclinacao"),
            "enso_fase":          enso.get("fase"),
            "enso_oni":           enso.get("oni"),
            "fonte":              resultado.get("fonte"),
            "alerta_vento_nivel": vento_hist.get("nivel_vento"),
            "alerta_vento_kmh":   vento_hist.get("vento_max_kmh"),
            "alerta_rajada_kmh":  vento_hist.get("rajada_max_kmh"),
            "aderencia_futura_status": resultado.get("aderencia_futura", {}).get("status"),
            "aderencia_futura_label":  resultado.get("aderencia_futura", {}).get("label"),
            "aderencia_futura_rain":   resultado.get("aderencia_futura", {}).get("rain_mm"),
            "texto_dinamico":          veredicto.get("texto_dinamico"),
            "motivo_veredicto":        veredicto.get("motivo"),
            "grip_threshold_ef":       aderencia.get("grip_threshold_ef"),
            "fds_d1_veredicto":   fds.get("d1", {}).get("veredicto", {}).get("texto"),
            "fds_d1_rain":        fds.get("d1", {}).get("rain"),
            "fds_d1_wind":        fds.get("d1", {}).get("wind"),
            "fds_d1_temp":        fds.get("d1", {}).get("temp_max"),
            "fds_d1_temp_min":    fds.get("d1", {}).get("temp_min"),
            "fds_d1_pop":         fds.get("d1", {}).get("pop"),
            "fds_d2_veredicto":   fds.get("d2", {}).get("veredicto", {}).get("texto"),
            "fds_d2_rain":        fds.get("d2", {}).get("rain"),
            "fds_d2_wind":        fds.get("d2", {}).get("wind"),
            "fds_d2_temp":        fds.get("d2", {}).get("temp_max"),
            "fds_d2_temp_min":    fds.get("d2", {}).get("temp_min"),
            "fds_d2_pop":         fds.get("d2", {}).get("pop"),
            "fds_d3_veredicto":   fds.get("d3", {}).get("veredicto", {}).get("texto"),
            "fds_d3_rain":        fds.get("d3", {}).get("rain"),
            "fds_d3_wind":        fds.get("d3", {}).get("wind"),
            "fds_d3_temp":        fds.get("d3", {}).get("temp_max"),
            "fds_d3_temp_min":    fds.get("d3", {}).get("temp_min"),
            "fds_d3_pop":         fds.get("d3", {}).get("pop"),
            "dados_json":              json.dumps({
                "bioma":      resultado.get("bioma"),
                "trail_type": resultado.get("trail_type"),
                "exposicao":  resultado.get("exposicao_raw"),
            }),
            "historico_atualizado_em": resultado.get("historico_atualizado_em"),
        }).encode("utf-8")

        # DELETE registro anterior
        url_delete = f"{SUPABASE_URL}/rest/v1/condicoes?trilha_id=eq.{trilha_id}"
        req_delete = urllib.request.Request(
            url_delete,
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type":  "application/json",
            }
        )
        req_delete.get_method = lambda: "DELETE"
        try:
            with urllib.request.urlopen(req_delete, timeout=10) as r:
                pass
        except Exception:
            pass

        # INSERT novo registro
        url_insert = f"{SUPABASE_URL}/rest/v1/condicoes"
        req_insert = urllib.request.Request(
            url_insert,
            data=payload,
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type":  "application/json",
                "Prefer":        "return=minimal",
            }
        )
        req_insert.get_method = lambda: "POST"
        with urllib.request.urlopen(req_insert, timeout=10) as r:
            print(f"  [Supabase] [OK] {trilha_name} gravado (status {r.status})")

        # Grava previsao_blocos (4 linhas — uma por bloco de 6h)
        blocos = resultado.get("previsao_24h") or []
        if blocos:
            url_del_blocos = f"{SUPABASE_URL}/rest/v1/previsao_blocos?trilha_id=eq.{trilha_id}"
            req_del = urllib.request.Request(
                url_del_blocos,
                headers={
                    "apikey":        SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type":  "application/json",
                }
            )
            req_del.get_method = lambda: "DELETE"
            try:
                with urllib.request.urlopen(req_del, timeout=10) as r:
                    pass
            except Exception:
                pass

            gerado_em = datetime.now(BRT).isoformat()
            payload_blocos = json.dumps([
                {
                    "trilha_id": trilha_id,
                    "bloco":     i,
                    "label":     b.get("label", f"bloco_{i}"),
                    "rain_mm":   b.get("rain_mm", 0),
                    "wind_max":  b.get("wind_max", 0),
                    "pop_max":   b.get("pop_max", 0),
                    "temp_med":  b.get("temp_med", 0),
                    "gerado_em": gerado_em,
                }
                for i, b in enumerate(blocos[:4])
            ]).encode("utf-8")

            url_ins_blocos = f"{SUPABASE_URL}/rest/v1/previsao_blocos"
            req_ins = urllib.request.Request(
                url_ins_blocos,
                data=payload_blocos,
                headers={
                    "apikey":        SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type":  "application/json",
                    "Prefer":        "return=minimal",
                }
            )
            req_ins.get_method = lambda: "POST"
            with urllib.request.urlopen(req_ins, timeout=10) as r:
                pass

        return trilha_id

    except Exception as exc:
        print(f"  [Supabase] [ERRO] {trilha_name}: {exc}")
        return None





def _buscar_ultima_condicao_supabase(trail: dict) -> dict | None:
    """
    Busca o registro mais recente de condicoes para a trilha usando supabase_id.
    Usado como fallback quando fetch_historico_chuva_om falha por indisponibilidade de rede.
    """
    if not SUPABASE_KEY:
        return None
    trilha_id = trail.get("supabase_id")
    if not trilha_id:
        return None
    try:
        campos = (
            "acumulo_ef,acumulo_48h,meia_vida_h,ultima_chuva_h,gerado_em,"
            "alerta_vento_nivel,alerta_vento_kmh,alerta_rajada_kmh,"
            "historico_atualizado_em"
        )
        url = (
            f"{SUPABASE_URL}/rest/v1/condicoes"
            f"?trilha_id=eq.{trilha_id}"
            f"&select={campos}"
            f"&limit=1"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            rows = json.loads(r.read())
        return rows[0] if rows else None
    except Exception as exc:
        print(f"  [OM hist] Falha ao buscar condição Supabase (fallback): {exc}")
        return None



def processar_trilha(trail: dict, datas: dict) -> dict:
    oc_raw = fetch_onecall(trail)
    oc     = resumo_onecall(oc_raw)

    om_raw = fetch_openmeteo(trail)
    om     = resumo_openmeteo(om_raw)

    if oc:
        rain        = oc["rain"]
        wind        = oc["wind"]
        pop         = oc["pop"]
        pico_3h     = oc["pico_3h"]
        gust_max_ms = oc.get("gust_max", 0.0)
        tmax        = oc["tmax"]
        tmin        = oc.get("tmin")
        fonte       = "OpenWeather"
    elif om:
        rain        = om["rain"]
        wind        = om["wind"]
        pop         = om["pop"]
        pico_3h     = om["pico_3h"]
        gust_max_ms = om.get("gust_max", 0.0)
        tmax        = om.get("tmax", 25)
        tmin        = om.get("tmin")
        fonte       = "Open-Meteo (fallback OW)"
    else:
        wapi_raw    = _fetch_weatherapi_forecast_as_ow(trail)
        wapi        = resumo_onecall(wapi_raw) if wapi_raw else None
        if wapi:
            rain        = wapi["rain"]
            wind        = wapi["wind"]
            pop         = wapi["pop"]
            pico_3h     = wapi["pico_3h"]
            gust_max_ms = wapi.get("gust_max", 0.0)
            tmax        = wapi.get("tmax", 25)
            tmin        = wapi.get("tmin")
            fonte       = "WeatherAPI (fallback OW+OM)"
        else:
            windy = _fetch_windy_forecast(trail)
            if windy:
                rain        = windy["rain"]
                wind        = windy["wind"]
                pop         = windy["pop"]
                pico_3h     = windy["pico_3h"]
                gust_max_ms = windy.get("gust_max", 0.0)
                tmax        = windy.get("tmax", 25)
                tmin        = windy.get("tmin")
                fonte       = "Windy (fallback OW+OM+WeatherAPI)"
            else:
                rain        = 0.0
                wind        = 0.0
                pop         = 0
                pico_3h     = 0.0
                gust_max_ms = 0.0
                tmax        = 25
                tmin        = None
                fonte       = "sem dados"

    gust_max_kmh = round(gust_max_ms * 3.6, 1)

    inclinacao = calcular_inclinacao(trail)

    mes  = datetime.now(BRT).month
    oni  = fetch_oni_atual()
    enso = classificar_enso(oni)
    limiar_descanso = threshold_solo_descansado(mes, enso, trail)

    hist         = fetch_onecall_historico(trail)
    hist_om      = fetch_historico_chuva_om(trail, hist["meia_vida_h"])

    # ── Blend OW day_summary + OM past_days ───────────────────────────────
    # OW day_summary: total diário real (hoje + ontem), sem lag NWP
    # OM past_days: série horária completa com decaimento exponencial por hora
    # Fonte primária de efetivo = OM (granularidade horária)
    # OW detecta lag: se OW > OM + 1mm, chuva não chegou ao OM ainda

    day_sum     = fetch_ow_day_summary(trail)
    ow_chuva_ceu_mm = day_sum["chuva_ow_mm"]

    # Aplicar chuva_penetracao (interceptação de dossel) ao OW — mesma escala do OM
    mes_atual = datetime.now(BRT).month
    chuva_penetracao_blend = _lookup_bioma(trail, mes_atual).get("chuva_penetracao", 1.0)
    ow_chuva_solo_mm = round(ow_chuva_ceu_mm * chuva_penetracao_blend, 1)

    om_chuva_solo_mm     = hist_om["chuva_solo_mm"]
    om_chuva_solo_48h_mm = hist_om["chuva_solo_48h_mm"]   # OM restrito à janela hoje+ontem — comparável ao OW
    om_chuva_ceu_mm      = hist_om.get("chuva_ceu_mm", om_chuva_solo_mm)
    om_ef         = hist_om["efetivo"]
    om_uc         = hist_om["ultima_chuva_h"]

    acumulo_48h    = max(om_chuva_solo_48h_mm, ow_chuva_solo_mm)
    chuva_bruta_mm = round(max(hist_om.get("chuva_ceu_48h_mm", om_chuva_ceu_mm), ow_chuva_ceu_mm), 1)

    # Comparação de lag usa janela alinhada (ambas cobrem hoje+ontem)
    LAG_THRESHOLD = 1.0   # mm de diferença para considerar lag do OM
    lag_detectado = ow_chuva_solo_mm > om_chuva_solo_48h_mm + LAG_THRESHOLD

    if lag_detectado:
        # Chuva vista pelo OW mas não pelo OM (lag NWP) — tratar como RECENTE
        # Peso 0.9 = conservador: protege o rider de falso "solo seco"
        acumulo_ef   = round(om_ef + (ow_chuva_solo_mm - om_chuva_solo_48h_mm) * 0.9, 2)
        print(f"  [chuva hist] lag OM detectado: OW={ow_chuva_solo_mm:.1f}mm OM_48h={om_chuva_solo_48h_mm:.1f}mm (chuva_penetracao={chuva_penetracao_blend:.2f}) → ef={acumulo_ef:.2f}mm")
    else:
        acumulo_ef = om_ef

    if lag_detectado and om_uc is None:
        ultima_chuva = 2.0
        print(f"  [chuva hist] lag detectado e OM sem ultima_chuva — setando 2.0h (conservador)")
    else:
        ultima_chuva = om_uc

    # Umidade residual de inverno: Mata Atlântica com dossel denso retém umidade
    # estrutural no solo mesmo sem precipitação registrada — condensação noturna,
    # serrapilheira e sombra mantêm o solo levemente úmido (≈ GRIP PERFEITO).
    # Aplica baseline 0.3mm apenas quando acumulo_ef=0 para evitar classificação
    # SECO em dias frios+úmidos sem chuva recente.
    _bioma_str = (trail.get("bioma") or "").lower()
    if (acumulo_ef == 0.0
            and "mata atlântica" in _bioma_str
            and 5 <= mes <= 9
            and (hist.get("umidade_pct") or 0) >= 70):
        acumulo_ef = 0.3
        print(f"  [umid-residual] {trail['name']}: Mata Atlântica inverno "
              f"umid={hist.get('umidade_pct', 0):.0f}% → ef baseline=0.3mm (GRIP PERFEITO)")

    # Correção de timing: se OW viu chuva hoje mas OM não capturou horário recente
    ow_hoje_raw = day_sum.get("hoje", 0.0)
    if ow_hoje_raw > 0.5 and (ultima_chuva is None or ultima_chuva > 12.0):
        agora_brt         = datetime.now(BRT)
        horas_decorridas  = agora_brt.hour + agora_brt.minute / 60
        estimativa        = round(max(1.0, min(horas_decorridas / 2, 12.0)), 1)
        if ultima_chuva is None or estimativa < ultima_chuva:
            print(f"  [chuva-timing] {trail.get('name','?')}: OW hoje={ow_hoje_raw:.1f}mm mas OM={om_uc}h → estimando {estimativa}h")
            ultima_chuva = estimativa

    vento_hist   = fetch_vento_historico(trail, ow_vento_max_kmh=hist.get("vento_max_kmh_ow"))

    meia_vida_h = hist["meia_vida_h"]

    # Garoa ativa: superfície molhada não capturada pelo acumulo_ef.
    # Precipitação (qualquer fonte que detecte chuva leve/garoa agora):
    ow_current    = (oc_raw or {}).get("current", {})
    chuva_1h_ow   = float((ow_current.get("rain") or {}).get("1h", 0.0) or 0.0)
    weather_id_ow = ((ow_current.get("weather") or [{}])[0]).get("id", 0)
    is_garoa_ow   = chuva_1h_ow > 0 or (300 <= weather_id_ow < 322)   # nowcast OW
    is_garoa_wmo         = hist.get("is_garoa_wmo", False)                    # WMO 45/48/51-57 nas últimas 4h
    is_garoa_era5        = ultima_chuva is not None and ultima_chuva <= 4.0   # fallback ERA5
    is_garoa_persistente = hist.get("is_garoa_persistente", False)            # ≥6h húmido+nublado+chuva nas 48h
    garoa_horas_hist     = hist.get("garoa_horas_hist", 0)

    # Condição atmosférica (instantânea): OW current preferível à média 48h do OM.
    # Dew point: temp - dew_point < 2°C = ar fisicamente saturado (garoa/névoa).
    umidade_ref    = ow_current.get("humidity") or hist.get("umidade_pct") or 0
    dew_point_m    = hist.get("dew_point_media")
    temp_m         = hist.get("temp_media_c")
    ar_saturado    = (dew_point_m is not None and temp_m is not None
                      and (temp_m - dew_point_m) < 2.0)
    cond_atmo = ar_saturado or umidade_ref >= 85

    garoa_ativa = acumulo_ef < 2.0 and (
        # Garoa ativa agora: sinal instantâneo + confirmação atmosférica
        ((is_garoa_ow or is_garoa_wmo or is_garoa_era5) and cond_atmo)
        or
        # Padrão persistente de 48h: umidade já embutida na contagem de horas
        is_garoa_persistente
    )
    if garoa_ativa:
        sinais = []
        if is_garoa_ow:          sinais.append(f"OW current (1h={chuva_1h_ow:.2f}mm id={weather_id_ow})")
        if is_garoa_wmo:         sinais.append("OM WMO drizzle/fog")
        if is_garoa_era5:        sinais.append(f"ERA5 (últ. chuva {ultima_chuva:.1f}h)")
        if is_garoa_persistente: sinais.append(f"persistente {garoa_horas_hist}h/48h")
        if ar_saturado:          sinais.append(f"ar saturado (Td={dew_point_m:.1f}°C ΔT={temp_m-dew_point_m:.1f}°C)")
        print(f"  [garoa] {trail['name']}: {' + '.join(sinais)}, ef={acumulo_ef:.2f}mm, umidade={umidade_ref:.0f}% → superfície escorregadia")
    else:
        # Log de diagnóstico: mostra por que garoa não disparou
        bloq = []
        if not (is_garoa_ow or is_garoa_wmo or is_garoa_era5 or is_garoa_persistente):
            ult_h = f"{ultima_chuva:.1f}h" if ultima_chuva is not None else "?"
            bloq.append(f"sem sinal (OW={chuva_1h_ow:.2f}mm id={weather_id_ow} | WMO={is_garoa_wmo} | ERA5 últ={ult_h} | persist={garoa_horas_hist}h)")
        if acumulo_ef >= 2.0:
            bloq.append(f"ef={acumulo_ef:.2f}≥2.0")
        if not cond_atmo and (is_garoa_ow or is_garoa_wmo or is_garoa_era5):
            bloq.append(f"cond_atmo False (umid={umidade_ref:.0f}% Δdewpt={f'{temp_m-dew_point_m:.1f}°C' if dew_point_m and temp_m else '?'})")
        print(f"  [garoa-no] {trail['name']}: {' | '.join(bloq) if bloq else 'garoa=False'}")

    # Atmosfera bloqueia secagem: umidade ≥85% + nebulosidade ≥70% — solo úmido não se recupera
    # mesmo com ef abaixo do threshold de BAIXA. Passa ao fator de recuperação para impedir
    # que condições de garoa/dia fechado gerem BOA ADERÊNCIA incorretamente.
    _cloud_ref = hist.get("nublado_pct") or 0
    secagem_bloqueada = umidade_ref >= 85 and _cloud_ref >= 70
    aderencia = calcular_aderencia(rain, trail, acumulo_ef, pico_3h, mes, enso,
                                   garoa_ativa=garoa_ativa,
                                   secagem_bloqueada=secagem_bloqueada)
    trail["gust_max_kmh"] = gust_max_kmh
    hourly_oc = (oc_raw or {}).get("hourly", [])[:48]

    # Horas do Open-Meteo para fallback de D+3 (4 dias = ~96h)
    # Estrutura diferente: chaves separadas por variável em vez de lista de dicts
    _om_hourly_raw = (om_raw or {}).get("hourly", {})
    _om_times  = _om_hourly_raw.get("time", [])
    _om_precip = _om_hourly_raw.get("precipitation", [])
    _om_wind   = _om_hourly_raw.get("windspeed_10m", [])
    _om_pop    = _om_hourly_raw.get("precipitation_probability", [])
    _om_temp   = _om_hourly_raw.get("temperature_2m", [])
    # Montar lista de dicts compatível com o formato interno usado por resumo_dia_oc
    hourly_om = [
        {
            "dt":    int(datetime.fromisoformat(t).replace(tzinfo=BRT).timestamp()),
            "precip": float(_om_precip[i] or 0.0),
            "wind":   float(_om_wind[i] or 0.0) / 3.6,   # km/h → m/s
            "pop":    float(_om_pop[i] or 0.0) / 100.0,  # % → fração
            "temp":   float(_om_temp[i]) if i < len(_om_temp) and _om_temp[i] is not None else 0.0,
        }
        for i, t in enumerate(_om_times)
        if i < len(_om_precip)
    ] if _om_times else []

    def _precip_hora(h: dict) -> float:
        return h.get("rain", {}).get("1h", 0.0) or 0.0

    def acumulo_ate(alvo: date) -> float:
        # FIX #8: aplicar decaimento exponencial sobre acumulo_ef até o dia alvo
        # Sem isso, D+2 e D+3 superestimavam umidade residual pois ignoravam secagem
        agora_dt = datetime.now(BRT)
        alvo_dt  = datetime(alvo.year, alvo.month, alvo.day, 7, 0, tzinfo=BRT)
        horas_ate_alvo = max(0, (alvo_dt - agora_dt).total_seconds() / 3600)
        # Decaimento do acumulo_ef atual até o momento do alvo
        ef_decaido = acumulo_ef * (0.5 ** (horas_ate_alvo / meia_vida_h)) if meia_vida_h > 0 else 0.0
        alvo_str = str(alvo)
        chuva_prevista = sum(
            _precip_hora(h) for h in hourly_oc
            if datetime.fromtimestamp(h["dt"], tz=BRT).strftime("%Y-%m-%d") < alvo_str
        )
        return round(ef_decaido + chuva_prevista, 1)

    def resumo_12h_oc() -> dict:
        h12      = hourly_oc[:12]
        r        = round(sum(_precip_hora(h) for h in h12), 1)
        p3       = round(max((sum([_precip_hora(h) for h in h12][i:i+3])
                              for i in range(max(1, len(h12) - 2))), default=0.0), 1)
        p3_iminente = round(sum(_precip_hora(h) for h in h12[:3]), 1)
        pp       = round(max((h.get("pop", 0) or 0 for h in h12), default=0) * 100)
        w        = round(max((h.get("wind_speed", 0) or 0 for h in h12), default=0), 1)
        tm       = round(max((h.get("temp", 0) or 0 for h in h12), default=0))
        inc      = calcular_inclinacao(trail)
        # Rajada máxima restrita às próximas 12h — evita que rajadas de h36–48
        # contaminem o veredicto de curto prazo com ATENÇÃO indevida
        gust_12h = round(
            max((h.get("wind_gust", 0.0) or 0.0 for h in h12), default=0.0) * 3.6, 1
        )
        trail_12h = {**trail, "gust_max_kmh": gust_12h}
        ader = calcular_aderencia(r, trail, acumulo_ef, p3, mes, enso)
        return {
            "rain": r, "pico_3h": p3, "pop": pp, "wind": w, "temp_max": tm,
            "veredicto": veredicto(ader, r, w, p3, inc, trail_12h, acumulo_ef,
                                   pico_proximas_3h=p3_iminente),
        }

    def calcular_blocos_24h_oc() -> list:
        agora  = datetime.now(BRT)
        blocos = []
        for i in range(4):
            ini_dt  = agora + timedelta(hours=i * 6)
            fim_dt  = agora + timedelta(hours=(i + 1) * 6)
            label   = f"{ini_dt.hour:02d}h→{fim_dt.hour:02d}h"
            horas   = [
                h for h in hourly_oc
                if ini_dt <= datetime.fromtimestamp(h["dt"], tz=BRT) < fim_dt
            ]
            rain_mm  = round(sum(_precip_hora(h) for h in horas), 1)
            pop_max  = round(max((h.get("pop", 0) or 0 for h in horas), default=0) * 100)
            wind_max = round(max((h.get("wind_speed", 0) or 0 for h in horas), default=0), 1)
            temps    = [h.get("temp", 0) or 0 for h in horas]
            temp_med = round(sum(temps) / len(temps)) if temps else 0
            blocos.append({"label": label, "rain_mm": rain_mm, "pop_max": pop_max,
                           "wind_max": wind_max, "temp_med": temp_med})
        return blocos

    def calcular_aderencia_futura_oc() -> dict:
        _ordem = {"SECO": 0, "GRIP PERFEITO": 1, "BOA ADERÊNCIA - ÚMIDO": 2, "BAIXA ADERÊNCIA": 3}
        agora = datetime.now(BRT)
        chuva_anterior = 0.0
        pior = None
        pior_score = -1
        for i in range(4):
            ini_dt = agora + timedelta(hours=i * 6)
            fim_dt = agora + timedelta(hours=(i + 1) * 6)
            label  = f"{ini_dt.hour:02d}h→{fim_dt.hour:02d}h"
            horas  = [
                h for h in hourly_oc
                if ini_dt <= datetime.fromtimestamp(h["dt"], tz=BRT) < fim_dt
            ]
            precips    = [_precip_hora(h) for h in horas]
            rain_bloco = round(sum(precips), 1)
            pico_bloco = round(
                max((sum(precips[j:j+3]) for j in range(max(1, len(precips) - 2))), default=0.0), 1
            )
            horas_ate    = i * 6
            ef_projetado = (
                acumulo_ef * (0.5 ** (horas_ate / meia_vida_h)) if meia_vida_h > 0 else 0.0
            ) + chuva_anterior
            adh = calcular_aderencia(rain_bloco, trail, ef_projetado, pico_bloco, mes, enso)
            _sev_atual = _ordem.get(adh["status"], 0)
            if _sev_atual > pior_score:
                pior_score = _sev_atual
                pior = {"status": adh["status"], "emoji": adh["emoji"],
                        "cor": adh["cor"], "label": label, "score": adh["score"],
                        "rain_mm": rain_bloco}
            chuva_anterior += rain_bloco
        if pior is None or _ordem.get(pior["status"], 0) <= _ordem.get(aderencia["status"], 0):
            pior = {"status": aderencia["status"], "emoji": aderencia["emoji"],
                    "cor": aderencia["cor"], "label": "24h", "score": aderencia["score"],
                    "rain_mm": 0.0}
        return pior

    def resumo_dia_oc(alvo: date, acumulo_ate_val: float) -> dict:
        alvo_str = str(alvo)

        dia_oc = [h for h in hourly_oc
                  if datetime.fromtimestamp(h["dt"], tz=BRT).strftime("%Y-%m-%d") == alvo_str]
        dia_om = [h for h in hourly_om
                  if datetime.fromtimestamp(h["dt"], tz=BRT).strftime("%Y-%m-%d") == alvo_str]

        if dia_oc:
            # OWM One Call 3.0 (primário, até ~48h)
            precips_oc = [_precip_hora(h) for h in dia_oc]
            r_oc  = sum(precips_oc)
            p3_oc = max((sum(precips_oc[i:i+3]) for i in range(max(1, len(precips_oc) - 2))), default=0.0)
            pp_oc = max((h.get("pop", 0) or 0 for h in dia_oc), default=0) * 100
            tm    = round(max((h.get("temp", 0) or 0 for h in dia_oc), default=0))
            tm_min = round(min((h.get("temp", 999) or 999 for h in dia_oc), default=0))
            w     = round(max((h.get("wind_speed", 0) or 0 for h in dia_oc), default=0), 1)
            clouds_pct = round(sum(h.get("clouds", 0) or 0 for h in dia_oc) / len(dia_oc)) if dia_oc else None

            r  = round(r_oc, 1)
            p3 = round(p3_oc, 1)
            pp = round(pp_oc)
            fonte_dia = "OC"
        elif dia_om:
            # Fallback Open-Meteo (D+3 quando OC não alcança)
            precips = [h["precip"] for h in dia_om]
            r    = round(sum(precips), 1)
            p3   = round(max((sum(precips[i:i+3]) for i in range(max(1, len(precips) - 2))),
                             default=0.0), 1)
            pp   = round(max((h["pop"] for h in dia_om), default=0.0) * 100)
            temps_om = [h["temp"] for h in dia_om if h["temp"] > 0]
            tm     = round(max(temps_om, default=0))
            tm_min = round(min(temps_om, default=0))
            w    = round(max((h["wind"] for h in dia_om), default=0.0), 1)
            clouds_pct = None  # OM forecast sem cloudcover
            fonte_dia = "OM"
        else:
            return {"disponivel": False}

        inc  = calcular_inclinacao(trail)
        # Para dias futuros, o veredicto representa a condição APÓS a chuva do dia cair.
        # Sem isso, D+1 com 17mm aparece como DROP LIBERADO porque o solo "começa seco"
        # e a chuva do dia não entra em acumulo_ef — só aparecia no D+2.
        ef_pos_chuva = round(acumulo_ate_val + r, 1)
        ader = calcular_aderencia(r, trail, ef_pos_chuva, p3, mes, enso)
        return {
            "disponivel": True, "rain": r, "pop": pp, "temp_max": tm, "temp_min": tm_min,
            "clouds_pct": clouds_pct, "wind": w,
            "fonte_dia": fonte_dia,
            "veredicto": veredicto(ader, r, w, p3, inc, trail, ef_pos_chuva, vento_hist),
            "debug_model": {
                "acumulo_48h": acumulo_48h,
                "acumulo_ef": acumulo_ef,
                "limiar_descanso": limiar_descanso,
                "solo_descansado": aderencia["solo_descansado"],
                "meia_vida_h": meia_vida_h,
                "temp_media_c": hist.get("temp_media_c"),
                "vento_medio_ms": hist.get("vento_medio_ms"),
                "nublado_pct": hist.get("nublado_pct"),
                "umidade_pct": hist.get("umidade_pct"),
                "score": aderencia["score"],
                "impacto": aderencia["impacto"],
                "saturado": aderencia["saturado"],
                "risco_final": vered.get("risco"),
                "motivo_veredicto": vered.get("motivo"),
            },
        }

    def calcular_horarios_chuva_oc() -> str:
        # FIX #10: exibir blocos separados por gap > 3h em vez de intervalo contínuo enganoso
        blocos_chuva = []
        bloco_inicio = None
        bloco_fim    = None
        pop_max      = 0

        for h in hourly_oc:
            p  = _precip_hora(h)
            pp = (h.get("pop", 0) or 0) * 100
            dt = datetime.fromtimestamp(h["dt"], tz=BRT)
            tem_chuva = p >= 1.0 or pp >= 40

            if tem_chuva:
                if bloco_inicio is None:
                    bloco_inicio = dt
                bloco_fim = dt + timedelta(hours=1)
                if pp > pop_max:
                    pop_max = pp
            else:
                if bloco_inicio is not None:
                    # Gap detectado — fechar bloco atual
                    gap = (dt - bloco_fim).total_seconds() / 3600 if bloco_fim else 0
                    if gap > 3:
                        blocos_chuva.append((bloco_inicio, bloco_fim))
                        bloco_inicio = None
                        bloco_fim    = None

        if bloco_inicio is not None and bloco_fim is not None:
            blocos_chuva.append((bloco_inicio, bloco_fim))

        if not blocos_chuva:
            return "Sem chuva prevista nas próximas 48h"

        partes = []
        for ini, fim in blocos_chuva:
            if ini.date() == fim.date():
                partes.append(f"{ini.strftime('%d/%m')} {ini.strftime('%Hh')}–{fim.strftime('%Hh')}")
            else:
                partes.append(f"{ini.strftime('%d/%m %Hh')}–{fim.strftime('%d/%m %Hh')}")

        return " · ".join(partes) + f" · pico {round(pop_max)}%"

    aderencia_futura = calcular_aderencia_futura_oc()
    pico_iminente_3h = round(sum(_precip_hora(h) for h in hourly_oc[:3]), 1)
    vered = veredicto(aderencia, rain, wind, pico_3h, inclinacao, trail, acumulo_ef, vento_hist,
                      aderencia_futura=aderencia_futura, pico_proximas_3h=pico_iminente_3h)

    resumo_12h     = resumo_12h_oc()
    fds_resumo     = {
        "d1": resumo_dia_oc(datas["d1"], acumulo_ate(datas["d1"])),
        "d2": resumo_dia_oc(datas["d2"], acumulo_ate(datas["d2"])),
        "d3": resumo_dia_oc(datas["d3"], acumulo_ate(datas["d3"])),
    }
    horarios_chuva = calcular_horarios_chuva_oc()

    narrativa, cor_n, bg_n = _gerar_narrativa_claude({
        "acumulo_48h":      acumulo_48h,
        "chuva_bruta_mm":   chuva_bruta_mm,   # chuva sem interceptação de dossel (texto humano)
        "acumulo_ef":       acumulo_ef,
        "ultima_chuva_h":   ultima_chuva,
        "meia_vida_h":      meia_vida_h,
        "limiar_descanso":  limiar_descanso,
        "pico_3h":          pico_3h,
        "aderencia":        aderencia,
        "aderencia_futura": aderencia_futura,
        "veredicto":        vered,
        "veredicto_12h":    resumo_12h,
        "fds":              fds_resumo,
        "trail_name":       trail["name"],
        "bioma":            trail.get("bioma", ""),
    })
    _SUFIXO = " — avalie as condições antes de pedalar"
    _CHECK   = "avalie as condições antes de pedalar"
    if narrativa and not narrativa.rstrip().rstrip(".").rstrip().endswith(_CHECK):
        narrativa = narrativa.rstrip().rstrip(".") + _SUFIXO
    vered["texto_dinamico"] = narrativa

    return {
        "name":           trail["name"],
        "lat":            trail["lat"],
        "lon":            trail["lon"],
        "regiao":         trail["regiao"],
        "solo_type_raw":  trail["solo_type"],
        "rain":           rain, "pop": pop, "temp_max": tmax, "temp_min": tmin, "wind": wind,
        "pico_3h":        pico_3h,
        "acumulo_48h":    acumulo_48h,
        "acumulo_ef":     acumulo_ef,
        "ultima_chuva_h": ultima_chuva,
        "meia_vida_base_h": hist.get("meia_vida_base_h"),
        "meia_vida_h":    meia_vida_h,
        "temp_media_c":   hist.get("temp_media_c"),
        "vento_medio_ms": hist.get("vento_medio_ms"),
        "nublado_pct":    hist.get("nublado_pct"),
        "umidade_pct":    hist.get("umidade_pct"),
        "enso":           enso,
        "limiar_descanso": limiar_descanso,
        "fonte":          fonte,
        "bioma":          trail.get("bioma", "Desconhecido"),
        "trail_type":     trail.get("trail_type", "natural"),
        "exposicao_raw":  trail.get("exposicao", "aberta"),
        "gust_max_kmh":   gust_max_kmh,
        "desnivel_m":     trail.get("desnivel_m"),
        "extensao_km":    trail.get("extensao_km"),
        "inclinacao":     inclinacao,
        "aderencia":         aderencia,
        "aderencia_futura":  aderencia_futura,
        "veredicto":         vered,
        "veredicto_12h":  resumo_12h,
        "previsao_24h":   calcular_blocos_24h_oc(),
        "vento_hist":     vento_hist,
        "horarios_chuva": horarios_chuva,
        "fds": fds_resumo,
        "resumo_secagem_frase": narrativa,
        "resumo_secagem_cor":   cor_n,
        "resumo_secagem_bg":    bg_n,
        "historico_atualizado_em": datetime.now(BRT).isoformat(),
    }


def _aplicar_override_chuva_futura(resultado: dict) -> dict:
    """
    Override pós-modelo: se qualquer bloco das próximas 12h tiver rain_mm > 3mm,
    impede que o veredicto saia como DROP LIBERADO limpo.
    Se rain_12h total > 10mm, escala adicionalmente para MELHOR ESPERAR.
    Não toca em BAIXA ADERÊNCIA nem em MELHOR ESPERAR já definido.
    Para remover: apagar esta função e a chamada no loop principal.
    """
    blocos   = resultado.get("previsao_24h") or []
    rain_12h = resultado.get("veredicto_12h", {}).get("rain", 0) or 0

    tem_chuva_blocos = any(b.get("rain_mm", 0) > 3.0 for b in blocos[:2])
    if not tem_chuva_blocos and rain_12h <= 3.0:
        return resultado

    aderencia = resultado.get("aderencia", {})
    vered     = resultado.get("veredicto", {})
    status    = aderencia.get("status", "")

    if status == "BAIXA ADERÊNCIA":
        return resultado

    if status in ("SECO", "GRIP PERFEITO"):
        trail_mini = {
            "solo_type": resultado.get("solo_type_raw", "terra"),
            "trail_type": resultado.get("trail_type", "natural"),
        }
        aderencia["status"] = "BOA ADERÊNCIA - ÚMIDO"
        aderencia["desc"]   = _descricao_aderencia("BOA ADERÊNCIA - ÚMIDO", trail_mini)

    texto_atual = vered.get("texto", "")

    # Ângulo 1: >10mm nas próximas 12h → escala até MELHOR ESPERAR
    if rain_12h > 10.0 and texto_atual in ("DROP LIBERADO", "DROP LIBERADO - Veja os alertas"):
        vered["texto"]  = "MELHOR ESPERAR"
        vered["emoji"]  = "🚫"
        vered["cor"]    = "#dc2626"
        vered["bg"]     = "#fef2f2"
        alerta = f"chuva intensa prevista nas próximas 12h ({rain_12h:.0f}mm) — aguarde condições melhores"
        motivo = vered.get("motivo") or ""
        if alerta not in motivo:
            vered["motivo"] = (motivo + ", " + alerta).lstrip(", ")
        return resultado

    if texto_atual == "DROP LIBERADO":
        vered["texto"]  = "DROP LIBERADO - Veja os alertas"
        vered["emoji"]  = "⚠️"
        vered["cor"]    = "#d97706"
        vered["bg"]     = "#fffbeb"

    alerta = "chuva prevista nas próximas 12h — avalie as condições antes de pedalar"
    motivo = vered.get("motivo") or ""
    if alerta not in motivo:
        vered["motivo"] = (motivo + ", " + alerta).lstrip(", ")

    return resultado


# Mapeamento condição reportada → delta de risco (positivo = piora)
_CONDICAO_RISCO = {
    "seco":  -1,
    "grip":   0,
    "boa":    0,
    "baixa":  1,
    "lama":   2,
}

def ajustar_por_observacoes(resultado: dict, trail: dict) -> dict:
    """
    Pós-processador isolado: não toca em veredicto().
    Consulta observacoes_trilha das últimas 24h e ajusta o veredicto
    se riders reportaram condições piores que o previsto.
    Máximo de +2 no risco para não sobrescrever a física.
    """
    trilha_id = trail.get("supabase_id")
    if not trilha_id or not SUPABASE_KEY:
        return resultado

    try:
        desde = (datetime.now(BRT) - timedelta(hours=24)).isoformat()
        url = (
            f"{SUPABASE_URL}/rest/v1/observacoes_trilha"
            f"?select=condicao_encontrada,veredicto_sistema,created_at"
            f"&trilha_id=eq.{trilha_id}"
            f"&condicao_encontrada=not.is.null"
            f"&created_at=gte.{desde}"
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type":  "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            obs = json.loads(r.read()) or []

        if not obs:
            return resultado

        delta = 0
        condicoes_negativas = []
        for o in obs:
            d = _CONDICAO_RISCO.get(o.get("condicao_encontrada", ""), 0)
            if d > 0:
                delta += d
                condicoes_negativas.append(o["condicao_encontrada"])

        delta = min(delta, 2)  # cap: máximo +2

        if delta <= 0:
            return resultado

        vered = resultado.get("veredicto", {})
        risco_atual = vered.get("risco", 0)
        novo_risco  = risco_atual + delta

        if novo_risco > 3 and vered.get("texto") != "MELHOR ESPERAR":
            vered["texto"]  = "MELHOR ESPERAR"
            vered["emoji"]  = "🛑"
            vered["cor"]    = "#dc2626"
            vered["bg"]     = "#fef2f2"
        elif novo_risco > 1 and vered.get("texto") == "DROP LIBERADO":
            vered["texto"]  = "DROP LIBERADO - Veja os alertas"
            vered["emoji"]  = "⚠️"
            vered["cor"]    = "#d97706"
            vered["bg"]     = "#fffbeb"

        vered["risco"] = novo_risco
        tag = f"observacao_rider: +{delta} ({', '.join(set(condicoes_negativas))})"
        motivo = vered.get("motivo") or ""
        vered["motivo"] = (motivo + ", " + tag).lstrip(", ")
        resultado["veredicto"] = vered

        print(f"  [obs-ajuste] {trail['name']} — {len(condicoes_negativas)} relato(s) negativo(s), delta=+{delta}, novo_risco={novo_risco}")

    except Exception as exc:
        print(f"  [obs-ajuste] erro ignorado para {trail.get('name','?')}: {exc}")

    return resultado


def _resumo_secagem_local(r: dict) -> str:
    bruto           = r.get("chuva_bruta_mm") or r.get("acumulo_48h", 0)
    efetivo         = r.get("acumulo_ef", 0)
    ult_h           = r.get("ultima_chuva_h")
    meia_vida       = r.get("meia_vida_h", 24)
    limiar_descanso = r.get("limiar_descanso", 5.0)
    pico_3h         = r.get("pico_3h", 0)
    descansado = efetivo < limiar_descanso

    if bruto < 0.5:
        if pico_3h >= 3:
            return (
                f"Solo seco no momento, mas há previsão de até {pico_3h:.1f}mm "
                f"em janelas de 3h nas próximas horas — verifique as condições antes de sair.",
                "#d97706", "#fffbeb"
            )
        return "Não choveu nas últimas 48h. Solo seco e estável — condição ideal para pedalar.", "#16a34a", "#f0fdf4"

    reducao_pct = round((1 - efetivo / bruto) * 100) if bruto > 0 else 0
    if reducao_pct >= 70:
        parte_chuva = f"Choveu {bruto}mm nas últimas 48h, mas a maior parte já escoou — impacto real no solo é de apenas {efetivo}mm"
    elif reducao_pct >= 40:
        parte_chuva = f"Choveu {bruto}mm nas últimas 48h. Com a secagem natural, o impacto efetivo no solo é de {efetivo}mm"
    else:
        parte_chuva = f"Choveu {bruto}mm nas últimas 48h e boa parte ainda está retida — acúmulo efetivo de {efetivo}mm"

    if ult_h is None:     parte_tempo = ""
    elif ult_h < 3:       parte_tempo = f", e a chuva parou há menos de {max(1,round(ult_h))}h"
    elif ult_h < 12:      parte_tempo = f", com a última chuva há {round(ult_h)}h"
    else:                 parte_tempo = f", com a última chuva há {round(ult_h)}h atrás"

    if meia_vida <= 8:    parte_secagem = "Este solo drena muito rápido"
    elif meia_vida <= 14: parte_secagem = "Este solo drena bem"
    elif meia_vida <= 24: parte_secagem = "Este solo tem drenagem moderada"
    else:                 parte_secagem = "Este solo retém umidade por bastante tempo"

    if descansado:
        conclusao = "O solo está descansado e em ótima condição para pedalar." if efetivo < limiar_descanso * 0.4 else "O solo está descansado — boa condição para pedalar."
        cor, bg = "#16a34a", "#f0fdf4"
    elif efetivo > limiar_descanso * 2:
        conclusao = "O solo ainda está significativamente úmido — atenção na tração."
        cor, bg = "#dc2626", "#fef2f2"
    else:
        conclusao = "O solo está úmido — avalie as condições antes de pedalar."
        cor, bg = "#d97706", "#fffbeb"

    return f"{parte_chuva}{parte_tempo}. {parte_secagem}. {conclusao}", cor, bg


def _narrativa_cor_bg(r: dict) -> tuple:
    descansado      = r.get("acumulo_ef", 0) < r.get("limiar_descanso", 5.0)
    pico_3h         = r.get("pico_3h", 0)
    efetivo         = r.get("acumulo_ef", 0)
    limiar_descanso = r.get("limiar_descanso", 5.0)
    if descansado and pico_3h < 3:
        return "#16a34a", "#f0fdf4"
    elif efetivo > limiar_descanso * 2 or pico_3h >= 10:
        return "#dc2626", "#fef2f2"
    return "#d97706", "#fffbeb"


def _narrativa_via_gemini(prompt: str, r: dict) -> tuple | None:
    """Gemini 2.0 Flash fallback — retorna (texto, cor, bg) ou None se falhar."""
    if not GEMINI_KEY:
        return None
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={GEMINI_KEY}"
    )
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 250, "temperature": 0.7},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload,
                                  headers={"Content-Type": "application/json"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read())
                texto = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                meta = data.get("usageMetadata", {})
                _log_api("gemini", "generateContent",
                         tokens_in=meta.get("promptTokenCount", 0),
                         tokens_out=meta.get("candidatesTokenCount", 0),
                         sucesso=1)
                cor, bg = _narrativa_cor_bg(r)
                print("[Gemini Narrativa] OK")
                return texto, cor, bg
        except Exception as exc:
            print(f"[Gemini Narrativa] Erro (tentativa {attempt+1}): {exc}")
            if attempt == 1:
                _log_api("gemini", "generateContent", sucesso=0, falhas=1)
            else:
                time.sleep(2)
    return None


def _narrativa_via_groq(prompt: str, r: dict) -> tuple | None:
    """Groq llama-3.3-70b fallback — retorna (texto, cor, bg) ou None se falhar."""
    if not GROQ_KEY:
        return None
    payload = json.dumps({
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 250,
        "temperature": 0.7,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_KEY}",
        },
    )
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read())
                texto = data["choices"][0]["message"]["content"].strip()
                usage = data.get("usage", {})
                _log_api("groq", "chat_completions",
                         tokens_in=usage.get("prompt_tokens", 0),
                         tokens_out=usage.get("completion_tokens", 0),
                         sucesso=1)
                cor, bg = _narrativa_cor_bg(r)
                print("[Groq Narrativa] OK")
                return texto, cor, bg
        except Exception as exc:
            print(f"[Groq Narrativa] Erro (tentativa {attempt+1}): {exc}")
            if attempt == 1:
                _log_api("groq", "chat_completions", sucesso=0, falhas=1)
            else:
                time.sleep(2)
    return None


def _build_narrativa_prompt(r: dict) -> str:
    bruto           = r.get("chuva_bruta_mm") or r.get("acumulo_48h", 0)
    efetivo         = r.get("acumulo_ef", 0)
    ult_h           = r.get("ultima_chuva_h")
    meia_vida       = r.get("meia_vida_h", 24)
    limiar_descanso = r.get("limiar_descanso", 5.0)
    pico_3h         = r.get("pico_3h", 0)
    descansado      = efetivo < limiar_descanso
    ult_h_str       = f"{round(ult_h)}h atrás" if ult_h is not None else "não identificada"

    aderencia_status = r.get("aderencia", {}).get("status", "")
    ader_futura      = r.get("aderencia_futura") or {}
    af_status        = ader_futura.get("status", aderencia_status)
    af_label         = ader_futura.get("label", "24h")
    veredicto_texto  = r.get("veredicto", {}).get("texto", "")
    veredicto_12h    = r.get("veredicto_12h", {}).get("veredicto", {}).get("texto", "")
    trail_name       = r.get("trail_name", "trilha")
    bioma            = r.get("bioma", "")
    fds              = r.get("fds", {})

    def _fds_str(dia: dict) -> str:
        if not dia:
            return "sem dados"
        vt = dia.get("veredicto", {}).get("texto", "?")
        rn = dia.get("rain", 0)
        return f"{vt} · {rn}mm"

    return f"""Você é especialista em trilhas de mountain bike DH e Enduro no Brasil.
Escreva uma análise (3 a 5 frases) em português do Brasil contando a história completa das condições desta trilha: o que aconteceu nas últimas 48h, como está o solo agora e o que esperar nos próximos dias.

REGRA CRÍTICA: seja 100% consistente com os dados abaixo — eles são a verdade absoluta.
NUNCA contradiga o veredicto. NUNCA sugira condição melhor do que o veredicto indica.
NUNCA diga "solo secando rapidamente" se choveu recentemente ou há chuva prevista.
Se pico previsto (próximas 48h) >= 3mm: mencione que chuva está chegando e oriente o rider a monitorar.

Trilha: {trail_name}{f" · bioma {bioma}" if bioma else ""}

PASSADO — últimas 48h:
- Chuva acumulada (precipitação total captada): {bruto}mm
- Umidade retida no solo agora (após dossel + tempo): {efetivo}mm
- Última chuva: {ult_h_str}
- Meia-vida de secagem deste solo: {meia_vida}h
- Solo descansado (abaixo do limiar de grip): {"SIM" if descansado else "NÃO — solo saturado"}

AGORA:
- Aderência atual: {aderencia_status}
- Veredicto 12h: {veredicto_12h or veredicto_texto}
- Pico de chuva previsto (máx. janela 3h nas próximas 48h): {pico_3h}mm

FUTURO:
- Aderência esperada em {af_label}: {af_status}
- Veredicto 24h: {veredicto_texto}
- Dia 1: {_fds_str(fds.get("d1", {}))}
- Dia 2: {_fds_str(fds.get("d2", {}))}
- Dia 3: {_fds_str(fds.get("d3", {}))}

Estilo obrigatório — escreva como o exemplo abaixo, direto e com os números:
"Choveu 31.4mm nas últimas 48h, mas a maior parte já escoou — impacto real no solo é de apenas 6.3mm, com a última chuva há 9h. Este solo drena bem. O solo está úmido — avalie as condições antes de pedalar."

Regras:
- Frase 1: chuva bruta das últimas 48h + contraste com impacto real (acumulo_ef) + tempo desde última chuva
- Frase 2: característica do solo ou bioma (drenagem, meia-vida, dossel) — use o dado de meia-vida
- Frase 3: estado atual da aderência + recomendação direta coerente com o veredicto
- Se pico previsto >= 3mm: adicione frase curta alertando que chuva está chegando
- NUNCA contradiga o veredicto. NUNCA sugira condição melhor do que os dados indicam
- Sem markdown, sem bullet points, sem título, sem saudações
- Máximo 500 caracteres"""


def _gerar_narrativa_claude(r: dict) -> tuple:
    prompt = _build_narrativa_prompt(r)

    def _fallback():
        return (
            _narrativa_via_gemini(prompt, r)
            or _narrativa_via_groq(prompt, r)
            or _resumo_secagem_local(r)
        )

    if not ANTHROPIC_KEY:
        return _fallback()

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 250,
        "messages": [{"role": "user", "content": prompt}]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                narrativa = data["content"][0]["text"].strip()
                usage = data.get("usage", {})
                _log_api("anthropic", "messages",
                         tokens_in=usage.get("input_tokens", 0),
                         tokens_out=usage.get("output_tokens", 0),
                         sucesso=1)
                cor, bg = _narrativa_cor_bg(r)
                return narrativa, cor, bg
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            print(f"[Claude Narrativa] HTTP {exc.code}: {body}")
            # 400 = crédito esgotado ou request inválido — não adianta retry
            if exc.code == 400 or attempt == 2:
                _log_api("anthropic", "messages", sucesso=0, falhas=1)
                return _fallback()
            time.sleep(2 ** attempt)
        except Exception as exc:
            print(f"[Claude Narrativa] Erro: {exc}")
            if attempt == 2:
                _log_api("anthropic", "messages", sucesso=0, falhas=1)
                return _fallback()
            time.sleep(2 ** attempt)


def _disparar_workflows_notificacao() -> None:
    """Dispara mtb-email.yml e mtb-telegram.yml via GitHub Actions API."""
    token = os.getenv("GH_DISPATCH_TOKEN")
    repo  = os.getenv("GITHUB_REPOSITORY")
    ref   = os.getenv("GITHUB_REF_NAME", "main")

    if not token or not repo:
        print("  [GitHub] GH_DISPATCH_TOKEN ou GITHUB_REPOSITORY ausentes — workflows não disparados")
        return

    print(f"\n[MTBForecaster] Disparando workflows de notificação (ref={ref})...")
    for workflow in ("mtb-email.yml", "mtb-telegram.yml"):
        url     = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow}/dispatches"
        payload = json.dumps({"ref": ref}).encode("utf-8")
        req     = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Authorization":        f"Bearer {token}",
                "Accept":               "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type":         "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                # 204 No Content = sucesso
                print(f"  [GitHub] {workflow} disparado (HTTP {r.status})")
                _log_api("github_actions", "workflow_dispatch", sucesso=1)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            print(f"  [GitHub] Erro ao disparar {workflow}: HTTP {exc.code} — {body}")
            _log_api("github_actions", "workflow_dispatch", sucesso=0, falhas=1)
        except Exception as exc:
            print(f"  [GitHub] Erro ao disparar {workflow}: {exc}")
            _log_api("github_actions", "workflow_dispatch", sucesso=0, falhas=1)


def prefetch_om_batch(trails: list) -> None:
    """
    Pré-busca dados Open-Meteo em BATCH para todos os grupos de clima antes do loop de trilhas.
    3 chamadas batch cobrem todos os grupos: forecast (4d) + histórico NWP (48h) + nowcast ICON (6h).
    Popula _CACHE_OM_FORECAST, _CACHE_OM_CHUVA_RAW, _CACHE_OM_VENTO_RAW e _CACHE_OM_NOWCAST_RAW.
    Se qualquer batch falhar, o cache correspondente fica vazio e as funções individuais fazem fallback.
    """
    # Deduplica grupos por local_key (usa o primeiro trail do grupo como referência de coords)
    grupos: dict[str, dict] = {}
    for trail in trails:
        lk = trail.get("local_key")
        if lk and lk not in grupos:
            grupos[lk] = trail

    if not grupos:
        return

    keys  = list(grupos.keys())
    n     = len(keys)
    lat_s = ",".join(str(grupos[k]["lat"]) for k in keys)
    lon_s = ",".join(str(grupos[k]["lon"]) for k in keys)

    print(f"[OM batch] Pré-fetch de {n} grupo(s) de clima em 2 chamadas...")

    def _parse(raw):
        """Resposta com 1 coord = dict; com 2+ = lista. Normaliza para lista."""
        return raw if isinstance(raw, list) else [raw]

    # ── 1. Forecast (4 dias) — alimenta fetch_openmeteo ───────────────────────
    url_fc = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat_s}&longitude={lon_s}"
        "&hourly=precipitation,windspeed_10m,windgusts_10m,precipitation_probability,temperature_2m"
        "&forecast_days=4&timezone=America%2FSao_Paulo"
    )
    try:
        for attempt in range(3):
            try:
                with _om_urlopen(url_fc, timeout=120) as r:
                    fc_items = _parse(json.loads(r.read()))
                break
            except Exception as exc:
                if attempt == 2:
                    raise
                wait = 5 * (attempt + 1)
                print(f"  [OM batch forecast] Tentativa {attempt+1} falhou: {exc} — aguardando {wait}s")
                time.sleep(wait)
        for lk, item in zip(keys, fc_items):
            _CACHE_OM_FORECAST[lk] = item
        print(f"  [OM batch forecast] OK — {len(fc_items)} grupo(s) em cache")
        _log_api("open_meteo", "forecast_batch", sucesso=1)
    except Exception as exc:
        print(f"  [OM batch forecast] Falha: {exc} — chamadas individuais como fallback")
        _log_api("open_meteo", "forecast_batch", sucesso=0, falhas=1)

    # ── 2. Histórico past_days=2 — alimenta fetch_historico_chuva_om + fetch_vento_historico + fetch_onecall_historico
    url_hist = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat_s}&longitude={lon_s}"
        "&past_days=2&forecast_days=0"
        "&hourly=precipitation,windspeed_10m,windgusts_10m,temperature_2m,relative_humidity_2m,cloud_cover,dew_point_2m,weather_code"
        "&timezone=America%2FSao_Paulo"
    )
    try:
        for attempt in range(3):
            try:
                with _om_urlopen(url_hist, timeout=120) as r:
                    hist_items = _parse(json.loads(r.read()))
                break
            except Exception as exc:
                if attempt == 2:
                    raise
                wait = 5 * (attempt + 1)
                print(f"  [OM batch histórico] Tentativa {attempt+1} falhou: {exc} — aguardando {wait}s")
                time.sleep(wait)
        for lk, item in zip(keys, hist_items):
            h = item.get("hourly", {})
            times   = h.get("time", [])
            precips = h.get("precipitation", [])
            speeds  = h.get("windspeed_10m", [])
            gusts   = h.get("windgusts_10m", [])
            _CACHE_OM_CHUVA_RAW[lk] = (times, precips)
            _CACHE_OM_VENTO_RAW[lk] = (times, speeds, gusts)
            _CACHE_OM_CLIMA_RAW[lk] = {
                "times":         times,
                "temp":          h.get("temperature_2m", []),
                "humidity":      h.get("relative_humidity_2m", []),
                "clouds":        h.get("cloud_cover", []),
                "wind_speed":    speeds,
                "dew_point":     h.get("dew_point_2m", []),
                "weather_codes": h.get("weather_code", []),
            }
        print(f"  [OM batch histórico] OK — {len(hist_items)} grupo(s) em cache (chuva + vento + clima)")
        _log_api("open_meteo", "historico_era5_batch", sucesso=1)
    except Exception as exc:
        print(f"  [OM batch histórico] Falha: {exc} — chamadas individuais como fallback")
        _log_api("open_meteo", "historico_era5_batch", sucesso=0, falhas=1)

    # ── 3. Nowcast bridge past_hours=6 (ICON seamless) — patch últimas 6h sem lag NWP ──────────
    url_nowcast = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat_s}&longitude={lon_s}"
        "&past_hours=6&forecast_days=0"
        "&hourly=precipitation"
        "&models=icon_seamless"
        "&timezone=America%2FSao_Paulo"
    )
    try:
        for attempt in range(3):
            try:
                with _om_urlopen(url_nowcast, timeout=60) as r:
                    nowcast_items = _parse(json.loads(r.read()))
                break
            except Exception as exc:
                if attempt == 2:
                    raise
                wait = 5 * (attempt + 1)
                print(f"  [OM batch nowcast] Tentativa {attempt+1} falhou: {exc} — aguardando {wait}s")
                time.sleep(wait)
        for lk, item in zip(keys, nowcast_items):
            h = item.get("hourly", {})
            times_nc   = h.get("time", [])
            precips_nc = h.get("precipitation", [])
            _CACHE_OM_NOWCAST_RAW[lk] = {t: float(p or 0.0) for t, p in zip(times_nc, precips_nc)}
        print(f"  [OM batch nowcast] OK — {len(nowcast_items)} grupo(s) em cache (ICON seamless, lag ~1-2h)")
        _log_api("open_meteo", "nowcast_icon_batch", sucesso=1)
    except Exception as exc:
        print(f"  [OM batch nowcast] Falha: {exc} — bridge individual como fallback")
        _log_api("open_meteo", "nowcast_icon_batch", sucesso=0, falhas=1)


def main() -> None:
    import sys
    global TRAILS

    _validar_env()

    # 1. Carrega IDs com favorito (query leve: só trilha_id)
    ids_com_favorito = _carregar_ids_com_favorito()

    # 2. Carrega id+name de todas as trilhas aprovadas (query leve)
    todos_ids = _carregar_ids_trilhas_supabase()

    # 3. Separa favoritas e sem favorito
    if ids_com_favorito is not None:
        sem_favorito  = [t for t in todos_ids if t["id"] not in ids_com_favorito]
        ids_favoritas = {t["id"] for t in todos_ids if t["id"] in ids_com_favorito}
    else:
        # Erro na carga de favoritos — processa todas como fallback seguro
        sem_favorito  = []
        ids_favoritas = None

    # 4. Carrega dados completos apenas das trilhas favoritas
    TRAILS = _carregar_trilhas_supabase(ids=ids_favoritas)

    # 5. Filtra por estado se MTB_ESTADO estiver definido (execução manual por UF)
    estado_filtro = (os.getenv("MTB_ESTADO") or "").strip().upper()
    if estado_filtro:
        antes = len(TRAILS)
        TRAILS = [t for t in TRAILS if (t.get("regiao") or "").upper() == estado_filtro]
        print(f"[MTBForecaster] Filtro de estado: {estado_filtro} → {len(TRAILS)}/{antes} trilha(s)")

    # 5b. Filtros de debug — CIDADE_DEBUG e TRILHA_DEBUG (busca parcial, case-insensitive)
    cidade_debug = os.getenv("CIDADE_DEBUG", "").strip().lower()
    if cidade_debug:
        antes = len(TRAILS)
        TRAILS = [
            t for t in TRAILS
            if cidade_debug in (((t.get("localidades") or {}).get("cidade") or "") + " " + t["name"]).lower()
        ]
        print(f"[MTBForecaster] Filtro cidade '{cidade_debug}': {len(TRAILS)}/{antes} → {[t['name'] for t in TRAILS]}")

    trilha_debug = os.getenv("TRILHA_DEBUG", "").strip().lower()
    if trilha_debug:
        antes = len(TRAILS)
        TRAILS = [t for t in TRAILS if trilha_debug in t["name"].lower()]
        print(f"[MTBForecaster] Filtro trilha '{trilha_debug}': {len(TRAILS)}/{antes} → {[t['name'] for t in TRAILS]}")

    print("[MTBForecaster] Carregando configurações do Supabase...")
    _carregar_configuracoes()
    _carregar_tabela_solo()
    _carregar_threshold_sazonal()
    _carregar_meia_vida()
    _carregar_enso_config()
    _carregar_enso_regional_mult()
    _carregar_aderencia_thresholds()
    _carregar_veredicto_pesos()
    _carregar_veredicto_limiares()
    _carregar_meia_vida_clima_mult()
    _carregar_biomas()
    _carregar_trail_type_config()
    _carregar_solo_type_config()
    _carregar_inclinacao_config()
    _carregar_score_config()
    _carregar_aderencia_descricoes()

    hoje  = datetime.now(BRT).strftime("%d/%m/%Y")
    datas = proximos_dias()
    print(f"[MTBForecaster] {hoje} — D+1: {datas['d1_label']} | D+2: {datas['d2_label']} | D+3: {datas['d3_label']}")

    # 5. Grava "SEM FAVORITO" em lote para todas as trilhas sem favorito (2 chamadas API)
    if sem_favorito:
        print(f"\n[MTBForecaster] Gravando {len(sem_favorito)} trilha(s) sem favorito em lote...")
        gravar_sem_favorito_bulk(sem_favorito)

    resultados_global: list = []

    trails_por_regiao: dict[str, list] = {}
    for trail in TRAILS:
        trails_por_regiao.setdefault(trail["regiao"], []).append(trail)

    grupos: dict[str, int] = {}
    for trail in TRAILS:
        lk = trail.get("local_key")
        if lk:
            grupos[lk] = grupos.get(lk, 0) + 1
    sem_grupo = sum(1 for t in TRAILS if not t.get("local_key"))
    if grupos:
        resumo = ", ".join(f"{k}({v})" for k, v in sorted(grupos.items()))
        print(f"[MTBForecaster] Grupos de clima: {resumo}" + (f" | {sem_grupo} sem grupo" if sem_grupo else ""))

    prefetch_om_batch(TRAILS)

    print("[MTBForecaster] Buscando dados de solo via tabela mestra...")
    for trail in TRAILS:
        dados_solo = _resolver_solo(
            trail["lat"], trail["lon"],
            solo_type=trail.get("solo_type", "misto"),
            bioma=trail.get("bioma", "Desconhecido"),
            regiao=trail.get("regiao", "SP"),
        )
        if dados_solo:
            trail.update(dados_solo)
            print(f"  [Solo] {trail['name']}: clay={dados_solo['clay_pct']}%, sand={dados_solo['sand_pct']}% → {dados_solo['texture_class']}")
        else:
            print(f"  [Solo] {trail['name']}: API indisponível — usando fallback '{trail['solo_type']}'")

    for regiao, trails in sorted(trails_por_regiao.items()):

        print(f"\n[MTBForecaster] Processando região {regiao} ({len(trails)} trilha(s))...")
        resultados = []

        for trail in trails:
            try:
                dados = processar_trilha(trail, datas)
                dados = _aplicar_override_chuva_futura(dados)
                dados = ajustar_por_observacoes(dados, trail)
                resultados.append(dados)
                trilha_id = gravar_supabase(trail["name"], dados)
                dados["trilha_id"] = trilha_id
                resultados_global.append(dados)
                inc_str = f" | inclinação={dados['inclinacao']}%" if dados['inclinacao'] is not None else ""
                print(f"  [OK] {trail['name']} [{trail.get('trail_type','natural')} / {trail['solo_type']}]{inc_str} — {dados['aderencia']['status']} | pico={dados['pico_3h']}mm | 12h: {dados['veredicto_12h']['veredicto']['texto']} | 48h: {dados['veredicto']['texto']}")
            except Exception as exc:
                print(f"  [ERRO] {trail['name']}: {exc}")

            if DEBUG_MODEL:
                try:
                    dbg = dados["fds"]["d1"].get("debug_model", {})
                    print(
                        f"  [DEBUG] {trail['name']} | "
                        f"bruto={dbg.get('acumulo_48h')} | "
                        f"ef={dbg.get('acumulo_ef')} | "
                        f"th={dbg.get('limiar_descanso')} | "
                        f"solo_desc={dbg.get('solo_descansado')} | "
                        f"meia_vida={dbg.get('meia_vida_h')}h | "
                        f"temp={dbg.get('temp_media_c')}C | "
                        f"vento={dbg.get('vento_medio_ms')}m/s | "
                        f"umidade={dbg.get('umidade_pct')}% | "
                        f"nuvens={dbg.get('nublado_pct')}% | "
                        f"impacto={dbg.get('impacto')} | "
                        f"score={dbg.get('score')} | "
                        f"saturado={dbg.get('saturado')} | "
                        f"risco={dbg.get('risco_final')} | "
                        f"motivo={dbg.get('motivo_veredicto')}"
                    )
                except Exception:
                    pass

    # Processa pump tracks — apenas previsão do tempo, sem cálculo de solo
    print("\n[Pump Tracks] Iniciando processamento de pump tracks...")
    _processar_pumptracks()

    print("\n[MTBForecaster] Concluído.")
    _disparar_workflows_notificacao()
    _gravar_uso_api()

def _carregar_trilhas_supabase(ids: set | None = None) -> list:
    """
    Carrega trilhas aprovadas do Supabase.
    Se ids fornecido, carrega apenas as trilhas cujo id está no conjunto (filtro favoritas).
    """
    if not SUPABASE_KEY:
        raise RuntimeError("[Trilhas] SUPABASE_KEY ausente — impossível carregar trilhas.")

    filtro_ids = ""
    if ids:
        filtro_ids = f"&id=in.({','.join(ids)})"

    url = (
        f"{SUPABASE_URL}/rest/v1/trilhas"
        f"?select=id,name,lat,lon,solo_type,exposicao,altitude_m,trail_type,regiao,desnivel_m,extensao_km,bioma,sensibilidade,localidades!localidade_id(cidade,localidade)"
        f"&aprovada=eq.true"
        f"{filtro_ids}"
        f"&order=name.asc"
    )
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            dados = json.loads(r.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"[Trilhas] HTTP {exc.code} ao carregar trilhas: {body}") from exc
    if not dados:
        raise RuntimeError("[Trilhas] Nenhuma trilha aprovada encontrada no Supabase.")
    trilhas = []
    for row in dados:
        loc = row.get("localidades") or {}
        if isinstance(loc, list):
            loc = loc[0] if loc else {}
        local_key = loc.get("localidade") or loc.get("cidade") or None
        trilhas.append({
            "supabase_id": row["id"],
            "name":        row["name"],
            "lat":         float(row["lat"]),
            "lon":         float(row["lon"]),
            "solo_type":   row["solo_type"],
            "exposicao":   row["exposicao"],
            "altitude_m":  int(row["altitude_m"] or 900),
            "trail_type":  row["trail_type"],
            "regiao":      row["regiao"],
            "desnivel_m":  row.get("desnivel_m"),
            "extensao_km": row.get("extensao_km"),
            "bioma":       row.get("bioma") or "Desconhecido",
            "cidade":      loc.get("cidade"),
            "localidade":  loc.get("localidade"),
            "local_key":   local_key,
        })
    print(f"  [Trilhas] {len(trilhas)} trilha(s) carregada(s) do Supabase")
    return trilhas


def _carregar_ids_trilhas_supabase() -> list:
    """Query leve: retorna lista de {id, name} de todas as trilhas aprovadas."""
    if not SUPABASE_KEY:
        raise RuntimeError("[Trilhas] SUPABASE_KEY ausente — impossível carregar trilhas.")
    url = (
        f"{SUPABASE_URL}/rest/v1/trilhas"
        f"?select=id,name"
        f"&aprovada=eq.true"
        f"&order=name.asc"
    )
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _carregar_pumptracks_supabase() -> list:
    """Busca todos os pump tracks cadastrados no Supabase."""
    if not SUPABASE_KEY:
        return []
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/trilhas_pumptrack"
            f"?select=id,nome,latitude,longitude"
            f"&order=nome.asc"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as exc:
        print(f"  [Pump Tracks] Erro ao carregar: {exc}")
        return []


def _gravar_condicao_pumptrack(pt_id: str, dados: dict) -> bool:
    """
    Grava (upsert) a previsão do pumptrack em condicoes_pumptrack.
    Usa DELETE + INSERT para respeitar o índice único por pumptrack_id.
    """
    if not SUPABASE_KEY:
        return False
    try:
        payload = json.dumps({
            "pumptrack_id": pt_id,
            "gerado_em":    datetime.now(BRT).isoformat(),
            "rain_mm":      dados.get("rain"),
            "pico_3h":      dados.get("pico_3h"),
            "wind_kmh":     round(dados.get("wind", 0) * 3.6, 1),
            "temp_max":     dados.get("temp_max"),
            "temp_min":     dados.get("temp_min"),
            "pop_12h":      dados.get("pop"),
        }).encode("utf-8")

        url_del = f"{SUPABASE_URL}/rest/v1/condicoes_pumptrack?pumptrack_id=eq.{pt_id}"
        req_del = urllib.request.Request(url_del, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
        })
        req_del.get_method = lambda: "DELETE"
        try:
            with urllib.request.urlopen(req_del, timeout=10):
                pass
        except Exception:
            pass

        url_ins = f"{SUPABASE_URL}/rest/v1/condicoes_pumptrack"
        req_ins = urllib.request.Request(url_ins, data=payload, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
        })
        req_ins.get_method = lambda: "POST"
        with urllib.request.urlopen(req_ins, timeout=10):
            pass
        return True
    except Exception as exc:
        print(f"  [Pump Tracks] Erro ao gravar {pt_id}: {exc}")
        return False


def _processar_pumptracks():
    """
    Busca previsão do tempo para cada pump track (sem histórico, sem cálculo de solo)
    e grava em condicoes_pumptrack.
    """
    pumptracks = _carregar_pumptracks_supabase()
    if not pumptracks:
        print("  [Pump Tracks] Nenhum pump track encontrado.")
        return

    print(f"  [Pump Tracks] {len(pumptracks)} pump track(s) a processar...")
    for pt in pumptracks:
        try:
            trail_proxy = {"lat": float(pt["latitude"]), "lon": float(pt["longitude"]),
                           "name": pt["nome"]}
            oc_raw = fetch_onecall(trail_proxy)
            oc     = resumo_onecall(oc_raw)

            om_raw = fetch_openmeteo(trail_proxy)
            om     = resumo_openmeteo(om_raw)

            if oc:
                rain    = oc["rain"]
                wind    = oc["wind"]
                pop     = oc["pop"]
                pico_3h = oc["pico_3h"]
                tmax_pt = oc.get("tmax", 25)
                tmin_pt = oc.get("tmin")
            elif om:
                rain    = om["rain"]
                wind    = om["wind"]
                pop     = om["pop"]
                pico_3h = om["pico_3h"]
                tmax_pt = om.get("tmax", 25)
                tmin_pt = om.get("tmin")
            else:
                wapi_raw = _fetch_weatherapi_forecast_as_ow(trail_proxy)
                wapi     = resumo_onecall(wapi_raw) if wapi_raw else None
                if wapi:
                    rain    = wapi["rain"]
                    wind    = wapi["wind"]
                    pop     = wapi["pop"]
                    pico_3h = wapi["pico_3h"]
                    tmax_pt = wapi.get("tmax", 25)
                    tmin_pt = wapi.get("tmin")
                else:
                    windy = _fetch_windy_forecast(trail_proxy)
                    if windy:
                        rain    = windy["rain"]
                        wind    = windy["wind"]
                        pop     = windy["pop"]
                        pico_3h = windy["pico_3h"]
                        tmax_pt = windy.get("tmax", 25)
                        tmin_pt = windy.get("tmin")
                    else:
                        rain    = 0.0
                        wind    = 0.0
                        pop     = 0
                        pico_3h = 0.0
                        tmax_pt = 25
                        tmin_pt = None

            dados = {
                "rain": rain, "wind": wind, "pop": pop,
                "pico_3h": pico_3h,
                "temp_max": tmax_pt,
                "temp_min": tmin_pt,
            }
            ok = _gravar_condicao_pumptrack(pt["id"], dados)
            if ok:
                print(f"  [Pump Tracks] [OK] {pt['nome']} — rain={rain}mm | pico={pico_3h}mm | vento={round(wind*3.6,0)}km/h")
        except Exception as exc:
            print(f"  [Pump Tracks] [ERRO] {pt['nome']}: {exc}")


if __name__ == "__main__":
    main()
