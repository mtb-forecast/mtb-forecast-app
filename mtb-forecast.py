"""
MTB Agent V6.4
- Email HTML com visual organizado para Gmail
- Cards por trilha, tabela D+1/D+2/D+3 com dados reais por dia, seções bem separadas
- Análise gerada pelo Claude AI
- Assunto: "Monitoramento de Trilhas para MTB — DD/MM/YYYY"

Alterações V5.24:
- Campo `bioma` lido do trilhas.csv (coluna opcional, ex: "Mata Atlântica")
- fator_microclima(): threshold mais conservador para biomas com instabilidade orográfica
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
- Média ponderada 70% OpenWeather / 30% Open-Meteo (era 50/50)
- pico_3h calculado com granularidade horária (48 pontos vs 16 anteriores)
- janela, horarios_chuva, resumo_12h e resumo_dia operando com dados horários
- Open-Meteo mantido para previsão (30%) e vento histórico (rajadas)
- Cron ajustado para 07:00 BRT (0 10 * * *)

Alterações V5.22:
- Sazonalidade: thresholds de acúmulo efetivo derivados de ERA5-Land 30 anos (Climatempo)
- ENSO Nível 3: multiplicador sobre threshold sazonal via ONI NOAA (fetch_oni_atual)
- Card do email exibe fase ENSO, ONI e threshold em vigor por trilha
- Prompt Claude inclui fase ENSO para análise contextualizada

Alterações V5.21:
- Modelo de secagem do solo por decaimento exponencial
- fetch_openmeteo_historico() retorna dict com bruto, efetivo, ultima_chuva_h, meia_vida_h
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
- Nomenclatura: GRIP PERFEITO / BOA ADERÊNCIA / BAIXA ADERÊNCIA
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
import urllib.request
import urllib.error
import urllib.parse
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone, timedelta, date

# ---------------------------------------------------------------------------
# Leitura de trilhas via CSV
# ---------------------------------------------------------------------------
import csv as _csv
import pathlib as _pathlib

_CAMPOS_OBRIGATORIOS = ("name", "lat", "lon", "solo_type", "exposicao", "altitude_m", "trail_type", "regiao")
_SOLO_VALIDOS        = {"terra", "misto", "preto", "pedra", "ferro", "misto_mg"}
_EXPOSICAO_VALIDOS   = {"aberta", "fechada"}
_TRAIL_VALIDOS       = {"natural", "bikepark"}

def _carregar_trilhas(csv_path: str = "trilhas.csv") -> list:
    caminho = _pathlib.Path(__file__).parent / csv_path
    if not caminho.exists():
        raise FileNotFoundError(
            "Arquivo de trilhas nao encontrado: " + str(caminho) + "\n"
            "Crie o arquivo trilhas.csv na mesma pasta do script.\n"
            "Consulte o README para o formato correto."
        )

    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            with open(caminho, newline="", encoding=enc) as f:
                f.read(4096)
            encoding_ok = enc
            break
        except UnicodeDecodeError:
            continue
    else:
        encoding_ok = "latin-1"
    print(f"[trilhas.csv] Encoding detectado: {encoding_ok}")

    trilhas, erros = [], []
    with open(caminho, newline="", encoding=encoding_ok) as f:
        amostra = f.read(4096)
        f.seek(0)
        separador = ";" if amostra.count(";") > amostra.count(",") else ","
        reader = _csv.DictReader(f, delimiter=separador)
        faltando_header = [c for c in _CAMPOS_OBRIGATORIOS if c not in (reader.fieldnames or [])]
        if faltando_header:
            raise ValueError(
                "trilhas.csv esta faltando colunas obrigatorias: "
                + ", ".join(faltando_header)
                + "\nColunas encontradas: "
                + ", ".join(reader.fieldnames or [])
            )
        for linha, row in enumerate(reader, start=2):
            nome = row.get("name", "").strip() or f"linha {linha}"
            try:
                for campo in _CAMPOS_OBRIGATORIOS:
                    if not row.get(campo, "").strip():
                        raise ValueError(f"campo '{campo}' vazio ou ausente")

                def _coord(v: str) -> float:
                    v = v.strip()
                    if v.count(".") > 1:
                        sinal = "-" if v.startswith("-") else ""
                        partes = v.lstrip("-").split(".")
                        v = f"{sinal}{partes[0]}.{''.join(partes[1:])}"
                    return float(v)

                lat = _coord(row["lat"])
                lon = _coord(row["lon"])
                if not (-90 <= lat <= 90):
                    raise ValueError(f"lat invalida: {lat}")
                if not (-180 <= lon <= 180):
                    raise ValueError(f"lon invalida: {lon}")

                altitude_m = int(row["altitude_m"])

                solo_type  = row["solo_type"].strip().lower()
                exposicao  = row["exposicao"].strip().lower()
                trail_type = row["trail_type"].strip().lower()
                regiao     = row["regiao"].strip().upper()

                if solo_type not in _SOLO_VALIDOS:
                    raise ValueError(f"solo_type '{solo_type}' invalido — use: {', '.join(sorted(_SOLO_VALIDOS))}")
                if exposicao not in _EXPOSICAO_VALIDOS:
                    raise ValueError(f"exposicao '{exposicao}' invalida — use: {', '.join(sorted(_EXPOSICAO_VALIDOS))}")
                if trail_type not in _TRAIL_VALIDOS:
                    raise ValueError(f"trail_type '{trail_type}' invalido — use: {', '.join(sorted(_TRAIL_VALIDOS))}")
                if not regiao:
                    raise ValueError("campo 'regiao' vazio — ex: SP, MG, RJ")

                def _opcional_float(campo, row=row):
                    v = row.get(campo, "").strip()
                    if not v:
                        return None
                    try:
                        return float(v)
                    except ValueError:
                        raise ValueError(f"campo '{campo}' nao e um numero valido: '{v}'")

                desnivel_m  = _opcional_float("desnivel_m")
                extensao_km = _opcional_float("extensao_km")
                bioma       = row.get("bioma", "").strip() or "Desconhecido"

                trilhas.append({
                    "name":        row["name"].strip(),
                    "lat":         lat,
                    "lon":         lon,
                    "solo_type":   solo_type,
                    "exposicao":   exposicao,
                    "altitude_m":  altitude_m,
                    "trail_type":  trail_type,
                    "regiao":      regiao,
                    "desnivel_m":  desnivel_m,
                    "extensao_km": extensao_km,
                    "bioma":       bioma,
                })

            except (ValueError, KeyError) as exc:
                msg = f"[trilhas.csv] Linha {linha} ('{nome}') ignorada: {exc}"
                erros.append(msg)
                print(msg)

    if not trilhas:
        raise RuntimeError(
            "Nenhuma trilha valida encontrada em trilhas.csv. "
            "Verifique o arquivo e corrija os erros acima."
        )

    regioes = sorted(set(t["regiao"] for t in trilhas))
    if erros:
        print(f"[trilhas.csv] {len(erros)} linha(s) ignorada(s), {len(trilhas)} trilha(s) carregada(s). Regiões: {', '.join(regioes)}")
    else:
        print(f"[trilhas.csv] {len(trilhas)} trilha(s) carregada(s). Regiões: {', '.join(regioes)}")

    return trilhas

TRAILS = []

OPENWEATHER_KEY = os.getenv("OPENWEATHER_API_KEY")
ANTHROPIC_KEY   = os.getenv("ANTHROPIC_API_KEY")
EMAIL_FROM      = os.getenv("EMAIL_FROM")
EMAIL_PASSWORD  = os.getenv("EMAIL_PASSWORD")
EMAIL_TO        = os.getenv("EMAIL_TO")
EMAIL_BCC       = os.getenv("EMAIL_BCC", "")
DEBUG_MODEL     = os.getenv("DEBUG_MODEL", "false").lower() == "true"

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

# ---------------------------------------------------------------------------
# Destinatários por região — buscados do Supabase (profiles.receber_email)
# ---------------------------------------------------------------------------

def _carregar_emails_por_regiao() -> dict:
    # profiles.regiao = preferência de notificação do usuário (ex: "SP")
    # Diferente de trilhas.regiao = localização da trilha (ex: "SP", "MG")
    if not SUPABASE_KEY or not SUPABASE_URL:
        print("  [Email] SUPABASE_KEY ou SUPABASE_URL ausente — pulando carga de emails")
        return {}
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/profiles"
            f"?select=email,regiao,plano,receber_email"
            f"&receber_email=eq.true",
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            rows = json.loads(r.read())
    except Exception as exc:
        print(f"  [Email] Erro ao carregar destinatários do Supabase: {exc}")
        return {}
    resultado = {}
    for row in rows:
        regiao = row.get("regiao") or "outros"
        email  = row.get("email")
        if not email:
            continue
        if regiao not in resultado:
            resultado[regiao] = []
        resultado[regiao].append(email)
    total = sum(len(v) for v in resultado.values())
    print(f"[Supabase] {total} destinatário(s) com receber_email=True em {len(resultado)} região(ões).")
    return resultado

def _bcc_global() -> list:
    return [e.strip() for e in EMAIL_BCC.split(",") if e.strip()]

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
ORDEM_CONDICAO = {"SECO": 0, "GRIP PERFEITO": 1, "BOA ADERÊNCIA": 2, "BAIXA ADERÊNCIA": 3}

# ---------------------------------------------------------------------------
# Sazonalidade e ENSO — V5.22
# ---------------------------------------------------------------------------

_CACHE_ONI: dict = {}

def fetch_oni_atual() -> float:
    if "oni" in _CACHE_ONI:
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
        return oni_val
    except Exception as exc:
        print(f"[ENSO] Falha ao buscar ONI: {exc} — usando neutro (0.0)")
        _CACHE_ONI["oni"] = 0.0
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
                "fase":  _FASE_DISPLAY.get(cfg["fase"], cfg["fase"]),
                "oni":   oni,
                "mult":  cfg["multiplicador"],
                "emoji": cfg["emoji"],
            }
    return {"fase": "ENSO Neutro", "oni": oni, "mult": 1.00, "emoji": "⚪"}


def threshold_solo_descansado(mes: int, enso: dict, trail: dict = None) -> float:
    """Threshold dinâmico: sazonalidade × ENSO × microclima de bioma."""
    regiao = ((trail or {}).get("regiao") or "").upper()
    tabela_sb = _carregar_threshold_sazonal()
    tabela = tabela_sb.get(regiao, tabela_sb.get("DEFAULT", {}))
    base, _ = tabela.get(mes, (5.0, 10.0))
    valor = base * enso["mult"]
    if trail is not None:
        valor *= fator_microclima(trail)
    return round(valor, 1)


def threshold_bikepark_saturado(mes: int, enso: dict, trail: dict = None) -> float:
    regiao = ((trail or {}).get("regiao") or "").upper()
    tabela_sb = _carregar_threshold_sazonal()
    tabela = tabela_sb.get(regiao, tabela_sb.get("DEFAULT", {}))
    _, sat = tabela.get(mes, (5.0, 10.0))
    valor = sat * enso["mult"]
    if trail is not None:
        valor *= fator_microclima(trail)
    return round(valor, 1)


def _bikepark_saturado(trail: dict, acumulo_ef: float,
                       mes: int = None, enso: dict = None) -> bool:
    if mes is None:
        mes = datetime.now(timezone(timedelta(hours=-3))).month
    if enso is None:
        enso = {"mult": 1.0, "fase": "ENSO Neutro"}
    limite = threshold_bikepark_saturado(mes, enso, trail)
    return (
        trail.get("trail_type") == "bikepark"
        and acumulo_ef > limite
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
# One Call API 3.0 — V5.23
# ---------------------------------------------------------------------------

def fetch_onecall(trail: dict) -> dict | None:
    url = (
        "https://api.openweathermap.org/data/3.0/onecall"
        f"?lat={trail['lat']}&lon={trail['lon']}"
        f"&appid={OPENWEATHER_KEY}&units=metric&lang=pt_br"
        "&exclude=current,minutely,daily,alerts"
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, OSError):
            if attempt == 2:
                return None
            time.sleep(2 ** attempt)


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

        return {
            "rain":     rain_mm,
            "wind":     wind_max,
            "pop":      pop_max,
            "pico_3h":  pico_3h,
            "tmax":     tmax,
            "gust_max": gust_max,
        }
    except (KeyError, TypeError):
        return None


def fetch_onecall_historico(trail: dict) -> dict:
    agora = datetime.now(BRT)
    meia_vida_base = _meia_vida(trail)
    ultima_chuva_h = None
    amostras_temp = []
    amostras_wind = []
    amostras_cloud = []
    amostras_humidity = []

    # FIX #2: deduplicar entradas por timestamp antes de acumular
    # Três chamadas timemachine podem retornar horas sobrepostas
    entradas_por_dt: dict = {}

    for horas_offset in (48, 24, 0):
        ts = int((agora - timedelta(hours=horas_offset)).timestamp())
        url = (
            "https://api.openweathermap.org/data/3.0/onecall/timemachine"
            f"?lat={trail['lat']}&lon={trail['lon']}"
            f"&dt={ts}&appid={OPENWEATHER_KEY}&units=metric"
        )
        data = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=20) as r:
                    data = json.loads(r.read().decode("utf-8"))
                break
            except (urllib.error.URLError, OSError):
                if attempt == 2:
                    data = None
                else:
                    time.sleep(2 ** attempt)

        if not data:
            continue

        for entry in data.get("data", []):
            dt_ts = entry["dt"]
            dt_entry = datetime.fromtimestamp(dt_ts, tz=BRT)
            if dt_entry > agora:
                continue
            # Mantém apenas a primeira ocorrência de cada timestamp
            if dt_ts not in entradas_por_dt:
                entradas_por_dt[dt_ts] = entry

    # Processar entradas deduplicadas — apenas clima (temp/vento/nuvens/umidade)
    # Precipitação histórica vem exclusivamente de fetch_historico_chuva_om (Open-Meteo archive)
    for dt_ts in sorted(entradas_por_dt):
        entry    = entradas_por_dt[dt_ts]
        temp     = entry.get("temp")
        wind     = entry.get("wind_speed")
        clouds   = entry.get("clouds")
        humidity = entry.get("humidity")

        if temp is not None:
            amostras_temp.append(temp)
        if wind is not None:
            amostras_wind.append(wind)
        if clouds is not None:
            amostras_cloud.append(clouds)
        if humidity is not None:
            amostras_humidity.append(humidity)

    temp_media    = round(sum(amostras_temp)     / len(amostras_temp),     1) if amostras_temp     else None
    vento_medio   = round(sum(amostras_wind)     / len(amostras_wind),     1) if amostras_wind     else None
    nublado_medio = round(sum(amostras_cloud)    / len(amostras_cloud),    1) if amostras_cloud    else None
    umidade_media = round(sum(amostras_humidity) / len(amostras_humidity), 1) if amostras_humidity else None

    # Vento máximo histórico em km/h — extraído das entradas já coletadas
    vento_max_kmh_ow = (
        round(max(amostras_wind) * 3.6, 1) if amostras_wind else None
    )

    meia_vida = _ajustar_meia_vida_clima(
        meia_vida_base,
        trail,
        temp_c=temp_media,
        wind_ms=vento_medio,
        cloud_pct=nublado_medio,
        humidity_pct=umidade_media,
    )

    # bruto, efetivo e ultima_chuva_h agora vêm de fetch_historico_chuva_om
    return {
        "bruto":            0.0,
        "efetivo":          0.0,
        "ultima_chuva_h":   None,
        "meia_vida_h":      meia_vida,
        "temp_media_c":     temp_media,
        "vento_medio_ms":   vento_medio,
        "nublado_pct":      nublado_medio,
        "umidade_pct":      umidade_media,
        "vento_max_kmh_ow": vento_max_kmh_ow,
    }


def fetch_historico_chuva_om(trail: dict, meia_vida: float) -> dict:
    """
    Busca precipitação hora a hora no Open-Meteo archive (ERA5) para as últimas 48h.
    Calcula bruto, efetivo (decaimento exponencial) e ultima_chuva_h.
    Substitui o histórico do One Call timemachine, que retorna apenas 1 ponto por chamada.
    """
    agora     = datetime.now(BRT)
    inicio    = (agora - timedelta(hours=48)).strftime("%Y-%m-%d")
    fim       = agora.strftime("%Y-%m-%d")
    agora_str = agora.strftime("%Y-%m-%dT%H:00")

    for attempt in range(3):
        try:
            url = (
                "https://archive-api.open-meteo.com/v1/archive"
                f"?latitude={trail['lat']}&longitude={trail['lon']}"
                f"&start_date={inicio}&end_date={fim}"
                "&hourly=precipitation"
                "&timezone=America%2FSao_Paulo"
            )
            with urllib.request.urlopen(url, timeout=30) as r:
                data = json.loads(r.read())
            break
        except Exception as exc:
            if attempt == 2:
                print(f"  [OM archive] Falha após 3 tentativas: {exc}")
                return {"bruto": 0.0, "efetivo": 0.0, "ultima_chuva_h": None}
            print(f"  [OM archive] Tentativa {attempt+1} falhou: {exc} — retentando...")
            time.sleep(2 ** attempt)

    times   = data.get("hourly", {}).get("time", [])
    precips = data.get("hourly", {}).get("precipitation", [])

    bruto          = 0.0
    efetivo        = 0.0
    ultima_chuva_h = None

    for i, t in enumerate(times):
        if t > agora_str:
            continue
        p           = float(precips[i] or 0.0) if i < len(precips) else 0.0
        dt_entry    = datetime.fromisoformat(t).replace(tzinfo=BRT)
        horas_atras = max(0, (agora - dt_entry).total_seconds() / 3600)

        bruto   += p
        peso     = 0.5 ** (horas_atras / meia_vida) if meia_vida > 0 else 0.0
        efetivo += p * peso

        if p >= 0.5 and (ultima_chuva_h is None or horas_atras < ultima_chuva_h):
            ultima_chuva_h = round(horas_atras, 1)

    return {
        "bruto":          round(bruto, 1),
        "efetivo":        round(efetivo, 1),
        "ultima_chuva_h": ultima_chuva_h,
    }


def fetch_openmeteo(trail: dict) -> dict | None:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={trail['lat']}&longitude={trail['lon']}"
        "&hourly=precipitation,windspeed_10m,windgusts_10m,precipitation_probability,temperature_2m"
        "&forecast_days=4&timezone=America%2FSao_Paulo"
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, OSError):
            if attempt == 2:
                return None
            time.sleep(2 ** attempt)

# ---------------------------------------------------------------------------
# Modelo de secagem do solo — V5.21
# ---------------------------------------------------------------------------

def fator_microclima(trail: dict) -> float:
    bioma = trail.get("bioma", "Desconhecido")
    for cfg in _carregar_microclima_config():
        if cfg["bioma"] != bioma:
            continue
        alt_min = cfg.get("altitude_min")
        expo    = cfg.get("exposicao")
        if alt_min is not None and trail.get("altitude_m", 0) < alt_min:
            continue
        if expo is not None and trail.get("exposicao") != expo:
            continue
        return cfg["fator_threshold"]
    return 1.0


def _meia_vida(trail: dict) -> float:
    solo = trail.get("solo_type", "terra")
    expo = trail.get("exposicao", "fechada")
    tabela_mv = _carregar_meia_vida()
    base = float(tabela_mv.get((solo, expo), 24))
    # FIX #6 — microclima retém umidade estruturalmente além do que o solo_type sugere
    bioma = trail.get("bioma", "Desconhecido")
    for cfg in _carregar_microclima_config():
        if cfg["bioma"] != bioma:
            continue
        alt_min  = cfg.get("altitude_min")
        expo_cfg = cfg.get("exposicao")
        if alt_min is not None and trail.get("altitude_m", 0) < alt_min:
            continue
        if expo_cfg is not None and expo != expo_cfg:
            continue
        base *= cfg["fator_secagem"]
        break
    return base

def _ajustar_meia_vida_clima(meia_vida_base: float, trail: dict,
                             temp_c: float | None = None,
                             wind_ms: float | None = None,
                             cloud_pct: float | None = None,
                             humidity_pct: float | None = None) -> float:
    meia_vida = float(meia_vida_base)
    registros = _carregar_meia_vida_clima_mult()

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
        wind_kmh = wind_ms * 3.6
        _aplicar(wind_kmh, "vento")
        # Combo calor+vento: redução adicional — condição multi-variável, tratada separadamente
        if temp_c is not None and temp_c >= 30 and wind_kmh >= 20:
            combo = next((r["multiplicador"] for r in registros if r["variavel"] == "combo"), None)
            if combo is not None:
                meia_vida *= combo

    if cloud_pct is not None:
        _aplicar(cloud_pct, "nebulosidade")

    if humidity_pct is not None:
        _aplicar(humidity_pct, "umidade")

    # FIX #5: exposicao removida daqui — já está na tabela meia_vida_secagem (Supabase)
    # Manter aqui causava double counting (terra fechada=36h já embute o efeito)

    if trail.get("trail_type") == "bikepark":
        expo = trail.get("exposicao", "aberta")
        _aplicar(0.0, "bikepark", exposicao=expo)

    mv_min = float(_get_config("meia_vida_min") or 4.0)
    mv_max = float(_get_config("meia_vida_max") or 72.0)
    return round(max(mv_min, min(mv_max, meia_vida)), 1)


def fetch_vento_historico(trail: dict, ow_vento_max_kmh: float | None = None) -> dict:
    """
    Busca rajadas históricas (Open-Meteo /archive — ERA5 observado).
    Vento sustentado OW é recebido como parâmetro já extraído de fetch_onecall_historico,
    eliminando chamada redundante ao timemachine da One Call API.
    """
    agora     = datetime.now(BRT)
    inicio    = (agora - timedelta(hours=48)).strftime("%Y-%m-%d")
    fim       = agora.strftime("%Y-%m-%d")
    agora_str = agora.strftime("%Y-%m-%dT%H:00")

    # Open-Meteo /archive: única fonte de rajadas (windgusts_10m não disponível no timemachine OW)
    om_rajada_max = None
    om_vento_max  = None
    try:
        url_om = (
            "https://archive-api.open-meteo.com/v1/archive"
            f"?latitude={trail['lat']}&longitude={trail['lon']}"
            f"&start_date={inicio}&end_date={fim}"
            "&hourly=windspeed_10m,windgusts_10m"
            "&timezone=America%2FSao_Paulo"
        )
        with urllib.request.urlopen(url_om, timeout=20) as r:
            data_om = json.loads(r.read().decode("utf-8"))
        times  = data_om.get("hourly", {}).get("time", [])
        speeds = data_om.get("hourly", {}).get("windspeed_10m", [])
        gusts  = data_om.get("hourly", {}).get("windgusts_10m", [])
        passados = [i for i, t in enumerate(times) if t <= agora_str]
        if passados:
            om_vento_max  = max((speeds[i] for i in passados if speeds[i] is not None), default=None)
            om_rajada_max = max((gusts[i]  for i in passados if i < len(gusts) and gusts[i] is not None), default=None)
    except Exception:
        pass

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

    fonte_str = ["OpenWeather (timemachine)"] if ow_vento_max_kmh is not None else []
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
        wind_ms      = [w / 3.6 for w in wind if w is not None]
        gust_ms      = [g / 3.6 for g in gusts if g is not None]
        rain_mm      = sum(p for p in precip if p is not None)
        pop_max      = max((p for p in pop if p is not None), default=0)
        wind_max     = max(wind_ms, default=0)
        gust_max     = max(gust_ms, default=0)
        precip_clean = [p if p is not None else 0.0 for p in precip_48]
        pico_3h      = max(
            (sum(precip_clean[i:i+3]) for i in range(max(1, len(precip_clean) - 2))),
            default=0.0
        )
        return {
            "rain":     round(rain_mm, 1),
            "wind":     round(wind_max, 1),
            "pop":      round(pop_max),
            "pico_3h":  round(pico_3h, 1),
            "gust_max": round(gust_max, 1),
        }
    except (KeyError, TypeError):
        return None

# ---------------------------------------------------------------------------
# Solo — Tabela Mestra Supabase
# ---------------------------------------------------------------------------

_CACHE_SOLO: dict = {}
_CACHE_TABELA_SOLO: list = []
_CACHE_THRESHOLD: dict = {}
_CACHE_MEIA_VIDA: dict = {}
_CACHE_CONFIG: dict = {}
_CACHE_ENSO_CONFIG: list = []
_CACHE_ADERENCIA_THRESHOLDS: list = []
_CACHE_VEREDICTO_PESOS: list = []
_CACHE_VEREDICTO_LIMIARES: list = []
_CACHE_MEIA_VIDA_CLIMA_MULT: list = []
_CACHE_MICROCLIMA_CONFIG: list = []
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
            f"?select=solo_type,exposicao,meia_vida_h"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        tabela: dict = {}
        for row in dados:
            tabela[(row["solo_type"], row["exposicao"])] = row["meia_vida_h"]
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
            {"status": "SECO",            "ef_min": None, "ef_max": 0.0},
            {"status": "GRIP PERFEITO",   "ef_min": 0.0,  "ef_max": 3.0},
            {"status": "BOA ADERÊNCIA",   "ef_min": 3.0,  "ef_max": 7.0},
            {"status": "BAIXA ADERÊNCIA", "ef_min": 7.0,  "ef_max": None},
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
            {"fator": "aderencia_boa",         "peso": 2},
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


def _carregar_microclima_config() -> list:
    """Carrega configurações de microclima do Supabase. Fallback: Mata Atlântica padrão."""
    global _CACHE_MICROCLIMA_CONFIG
    if _CACHE_MICROCLIMA_CONFIG:
        return _CACHE_MICROCLIMA_CONFIG
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/microclima_config"
            f"?select=bioma,altitude_min,exposicao,fator_threshold,fator_secagem"
            f"&ativo=eq.true&order=id.asc"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            dados = json.loads(r.read())
        _CACHE_MICROCLIMA_CONFIG = dados
        print(f"  [Microclima] Config carregada do Supabase: {len(dados)} biomas")
        return dados
    except Exception as exc:
        print(f"  [Microclima] Erro: {exc} — usando Mata Atlântica padrão")
        return [
            {"bioma": "Mata Atlântica", "altitude_min": 600, "exposicao": "fechada", "fator_threshold": 0.50, "fator_secagem": 1.20},
            {"bioma": "Mata Atlântica", "altitude_min": None, "exposicao": None,     "fator_threshold": 0.90, "fator_secagem": 1.10},
        ]


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
        config = {row["chave"]: float(row["valor"]) for row in dados}
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


def buscar_solo_openlandmap(lat: float, lon: float, solo_type: str = "misto",
                             bioma: str = "Desconhecido", regiao: str = "SP") -> dict | None:
    """
    V8.0: Usa exclusivamente tabela mestra do Supabase.
    OpenLandMap e SoilGrids removidos — instáveis e lentos.
    """
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
    bk_score_mult   = float(sc.get("bikepark_score_mult",       0.90))

    thresh = threshold_solo_descansado(mes, enso, trail)
    fator  = fator_absorcao(trail)
    solo_descansado = acumulo_ef < thresh

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
            impacto *= bk_score_mult

    score = max(0.0, min(100.0, impacto * coef_base))
    return {
        "score": round(score, 1),
        "solo_descansado": solo_descansado,
        "thresh": round(thresh, 1),
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
                       pico_3h: float = 0.0, mes: int = None, enso: dict = None) -> dict:
    if mes is None:
        mes = datetime.now(timezone(timedelta(hours=-3))).month
    if enso is None:
        enso = {"mult": 1.0, "fase": "ENSO Neutro"}

    base = calcular_score_trilha(rain_mm, acumulo_ef, pico_3h, trail, mes, enso)
    s = base["score"]
    saturado = _bikepark_saturado(trail, acumulo_ef, mes, enso)

    # Thresholds carregados do Supabase (tabela aderencia_thresholds) — efetivo combinado com pico_3h
    efetivo_combinado = acumulo_ef + pico_3h

    # Ajuste microclimático: Mata Atlântica fechada de altitude retém umidade estruturalmente —
    # o mesmo acumulo_ef causa mais degradação do que em terreno aberto.
    # Divide pelo fator_microclima (0.75–1.0) para tornar os thresholds proporcionalmente mais
    # rígidos. Reutiliza a tabela microclima_config já usada em threshold_solo_descansado.
    # Exemplo: ef=4mm em Mata Atlântica alta (fator=0.75) → ef_norm=5.33mm → BOA ADERÊNCIA
    # Em terreno sem ajuste (fator=1.0): ef=4mm → GRIP PERFEITO
    fator_mc = fator_microclima(trail)
    efetivo_threshold = efetivo_combinado / fator_mc if fator_mc > 0 else efetivo_combinado

    status = "BAIXA ADERÊNCIA"  # default seguro caso nenhum threshold dê match
    for thr in _carregar_aderencia_thresholds():
        ef_min = thr["ef_min"]
        ef_max = thr["ef_max"]
        # SECO (ef_min=null): inclusivo no upper (captura ef==0)
        # Demais: lower inclusivo, upper exclusivo
        acima  = ef_min is None or efetivo_threshold >= ef_min
        abaixo = (ef_max is None or
                  (efetivo_threshold <= ef_max if ef_min is None else efetivo_threshold < ef_max))
        if acima and abaixo:
            status = thr["status"]
            break

    # Fator de recuperação: solo abaixo de 2.5x o threshold sazonal não justifica BAIXA ADERÊNCIA
    # Exceção: bikepark saturado mantém BAIXA — já passou do limiar de drenagem
    thresh_local = threshold_solo_descansado(mes, enso, trail)
    if status == "BAIXA ADERÊNCIA" and acumulo_ef < thresh_local * 2.5 and not saturado:
        status = "BOA ADERÊNCIA"

    if trail.get("trail_type") == "bikepark":
        if acumulo_ef >= 5.0:
            pass  # BAIXA ADERÊNCIA permitida — sem teto quando solo saturado
        else:
            if status == "BAIXA ADERÊNCIA":
                status = "BOA ADERÊNCIA"  # teto quando solo não está saturado
        if acumulo_ef >= 2.0 and status == "SECO":
            status = "GRIP PERFEITO"  # nunca SECO com umidade real no solo

    emojis = {"SECO": "🟡", "GRIP PERFEITO": "🟢", "BOA ADERÊNCIA": "🟠", "BAIXA ADERÊNCIA": "🔴"}
    cores  = {"SECO": "#eab308", "GRIP PERFEITO": "#22c55e", "BOA ADERÊNCIA": "#f97316", "BAIXA ADERÊNCIA": "#ef4444"}
    desc = _descricao_aderencia(status, trail, saturado=saturado)

    # Threshold efetivo para GRIP PERFEITO em unidades de efetivo_combinado (acumulo_ef + pico_3h).
    # Frontend usa este valor para a barra de progresso — elimina o 3.0 hardcoded.
    grip_ef_max = next(
        (t["ef_max"] for t in _carregar_aderencia_thresholds() if t.get("status") == "GRIP PERFEITO"),
        3.0
    )
    grip_threshold_ef = round(grip_ef_max * fator_mc, 3) if fator_mc > 0 else grip_ef_max

    return {
        "status": status,
        "score": s,
        "solo_descansado": base["solo_descansado"],
        "thresh": base["thresh"],
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
              aderencia_futura: dict = None) -> dict:
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
    elif status == "BOA ADERÊNCIA":
        risco += peso_por_fator.get("aderencia_boa", 2)
        motivos.append("aderência moderada")
    elif status == "GRIP PERFEITO":
        risco += peso_por_fator.get("aderencia_grip", 1)
        motivos.append("aderência boa")

    if pico_3h >= 15.0:
        risco += peso_por_fator.get("pico_3h_muito_alto", 2)
        motivos.append("pico_3h muito alto")
    elif pico_3h >= 10.0:
        risco += peso_por_fator.get("pico_3h_alto", 1)
        motivos.append("pico_3h alto")

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
        risco -= 1
        motivos.append("bikepark reduz severidade")
        if aderencia.get("saturado"):
            risco += 2
            motivos.append("bikepark saturado")

    if trail is not None and trail.get("trail_type") == "natural":
        if inclinacao is not None and inclinacao > 20 and rain_mm > 0 and status in ("BOA ADERÊNCIA", "BAIXA ADERÊNCIA"):
            risco += 1
            motivos.append("trilha natural inclinada com chuva")

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
        if risco < 2:
            risco = 2
        motivos.append(f"rajada prevista {gust_kmh} km/h ({exposicao})")

    _sev = {"SECO": 0, "GRIP PERFEITO": 1, "BOA ADERÊNCIA": 2, "BAIXA ADERÊNCIA": 3}
    if aderencia_futura is not None:
        sev_a = _sev.get(status, 0)
        sev_f = _sev.get(aderencia_futura.get("status", status), 0)
        if sev_f > sev_a:
            if aderencia_futura["status"] == "BAIXA ADERÊNCIA" and status != "BAIXA ADERÊNCIA":
                risco += 2
                motivos.append("piora prevista severa")
            elif aderencia_futura["status"] == "BOA ADERÊNCIA" and status in ("SECO", "GRIP PERFEITO"):
                risco += 1
                motivos.append("piora prevista")
        elif sev_f < sev_a:
            risco = max(0, risco - 1)
            motivos.append("melhora prevista")

    risco = max(0, risco)

    def _tdyn(texto_v):
        _o = {"SECO": 0, "GRIP PERFEITO": 1, "BOA ADERÊNCIA": 2, "BAIXA ADERÊNCIA": 3}
        sa = aderencia["status"]
        sf = (aderencia_futura or {}).get("status", sa)
        lf = (aderencia_futura or {}).get("label", "24h")
        oa, of = _o.get(sa, 0), _o.get(sf, 0)
        if texto_v == "MELHOR ESPERAR":
            return "Solo encharcado — aguarde secar" if acumulo_ef > 8 else "Chuva intensa prevista — evite este período"
        if sa in ("SECO", "GRIP PERFEITO") and sf == "BAIXA ADERÊNCIA":
            return f"Bom agora, piora severa prevista — {lf}"
        if sa in ("SECO", "GRIP PERFEITO") and sf == "BOA ADERÊNCIA":
            return f"Bom agora, piora moderada prevista — {lf}"
        if sa in ("BOA ADERÊNCIA", "BAIXA ADERÊNCIA") and of >= oa:
            return "Solo úmido, sem melhora prevista nas 24h"
        if sa in ("BOA ADERÊNCIA", "BAIXA ADERÊNCIA") and of < oa:
            return "Solo úmido mas secando — melhora prevista"
        if sa == "SECO" and sf == "SECO":
            return "Condição ideal — sem chuva prevista"
        if sa == "GRIP PERFEITO" and of <= 1:
            return "Grip perfeito — condição estável"
        return ""

    if risco <= lim_liberado:
        return {
            "texto": "DROP LIBERADO",
            "emoji": "✅",
            "cor": "#16a34a",
            "bg": "#f0fdf4",
            "risco": risco,
            "motivo": ", ".join(motivos) if motivos else "condição favorável",
            "texto_dinamico": _tdyn("DROP LIBERADO"),
        }
    elif risco <= lim_alertas:
        return {
            "texto": "DROP LIBERADO - Veja os alertas",
            "emoji": "⚠️",
            "cor": "#d97706",
            "bg": "#fffbeb",
            "risco": risco,
            "motivo": ", ".join(motivos) if motivos else "atenção por combinação de fatores",
            "texto_dinamico": _tdyn("DROP LIBERADO - Veja os alertas"),
        }
    return {
        "texto": "MELHOR ESPERAR",
        "emoji": "🛑",
        "cor": "#ef4444",
        "bg": "#fef2f2",
        "risco": risco,
        "motivo": ", ".join(motivos) if motivos else "risco elevado",
        "texto_dinamico": _tdyn("MELHOR ESPERAR"),
    }


def enviar_telegram(chat_id: int, mensagem: str) -> bool:
    """
    Envia mensagem para usuário via Telegram Bot API.
    Falha silenciosa — nunca interrompe o fluxo principal.
    """
    if not TELEGRAM_TOKEN:
        return False
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        payload = json.dumps({
            "chat_id": chat_id,
            "text": mensagem,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except Exception as exc:
        print(f"  [Telegram] Erro ao enviar para {chat_id}: {exc}")
        return False


def _buscar_usuarios_telegram() -> list:
    """
    Busca usuários com telegram_ativo=true e telegram_chat_id preenchido.
    """
    if not SUPABASE_KEY:
        return []
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/profiles"
            f"?select=id,nome,apelido,telegram_chat_id,regiao"
            f"&telegram_ativo=eq.true"
            f"&telegram_chat_id=not.is.null"
        )
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            usuarios = json.loads(r.read())
        print(f"  [Telegram] {len(usuarios)} usuário(s) com Telegram ativo")
        return usuarios
    except Exception as exc:
        print(f"  [Telegram] Erro ao buscar usuários: {exc}")
        return []


def _buscar_favoritos_usuario(user_id: str) -> list:
    """
    Busca trilhas favoritas de um usuário pelo user_id.
    """
    if not SUPABASE_KEY:
        return []
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/favoritos"
            f"?select=trilha_id"
            f"&user_id=eq.{user_id}"
        )
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as exc:
        print(f"  [Telegram] Erro ao buscar favoritos de {user_id}: {exc}")
        return []


def _buscar_strava_com_condicoes(user_id: str) -> list:
    """
    Busca trilhas pessoais Strava do usuário com condições de condicoes_strava.
    """
    if not SUPABASE_KEY:
        return []
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/trilhas_pessoais"
            f"?select=name,strava_segment_id,regiao"
            f"&user_id=eq.{user_id}"
        )
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            trilhas = json.loads(r.read())

        if not trilhas:
            return []

        resultados = []
        for trilha in trilhas:
            seg_id = trilha.get("strava_segment_id")
            if not seg_id:
                continue

            url_cond = (
                f"{SUPABASE_URL}/rest/v1/condicoes_strava"
                f"?select=aderencia_status,veredicto,veredicto_12h,rain_mm,wind_ms,gust_max_kmh,janela,frase_secagem"
                f"&strava_segment_id=eq.{seg_id}"
                f"&limit=1"
            )
            req_cond = urllib.request.Request(url_cond, headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            })
            with urllib.request.urlopen(req_cond, timeout=10) as r:
                condicoes = json.loads(r.read())

            if condicoes:
                c = condicoes[0]
                resultados.append({
                    "name": trilha["name"],
                    "strava": True,
                    "aderencia": {"status": c.get("aderencia_status", "")},
                    "veredicto": {"texto": c.get("veredicto_12h") or c.get("veredicto", ""), "emoji": ""},
                    "rain": c.get("rain_mm", 0),
                    "wind": c.get("wind_ms", 0),
                    "gust_max_kmh": c.get("gust_max_kmh", 0),
                    "janela": c.get("janela", ""),
                })

        return resultados
    except Exception as exc:
        print(f"  [Telegram] Erro ao buscar Strava de {user_id}: {exc}")
        return []


def _enviar_notificacoes_telegram(resultados_global: list, hoje: str) -> None:
    """
    Envia notificações personalizadas via Telegram para cada usuário ativo.
    """
    if not TELEGRAM_TOKEN:
        print("  [Telegram] TELEGRAM_BOT_TOKEN não configurado — pulando notificações")
        return

    usuarios = _buscar_usuarios_telegram()
    if not usuarios:
        print("  [Telegram] Nenhum usuário com Telegram ativo.")
        return

    for usuario in usuarios:
        try:
            chat_id = usuario["telegram_chat_id"]
            nome = usuario.get("apelido") or usuario.get("nome") or "Rider"

            # Busca trilhas favoritas públicas
            favoritos = _buscar_favoritos_usuario(usuario["id"])
            trilha_ids = {f["trilha_id"] for f in favoritos}
            trilhas_publicas = [
                r for r in resultados_global
                if r.get("trilha_id") in trilha_ids
            ]

            # Busca trilhas Strava com condições
            trilhas_strava = _buscar_strava_com_condicoes(usuario["id"])

            # Combina todas as trilhas
            trilhas_usuario = trilhas_publicas + trilhas_strava

            if not trilhas_usuario:
                continue

            linhas = [f"🚵 *MTB Forecaster — {hoje}*\n"]
            linhas.append(f"Olá, *{nome}*! Suas trilhas hoje:\n")

            for t in trilhas_usuario:
                verd = t.get("veredicto", {})
                ader = t.get("aderencia", {})
                emoji = verd.get("emoji", "")
                texto = verd.get("texto", "")
                janela = t.get("janela", "")
                rain = t.get("rain", 0)
                wind = t.get("wind", 0)
                gust = t.get("gust_max_kmh", 0)

                strava_badge = " 🟠 _Strava_" if t.get("strava") else ""
                linha = f"{emoji} *{t['name']}*{strava_badge}\n"
                linha += f"   {ader.get('emoji','')} {ader.get('status','')} · {texto}\n"
                linha += f"   🌧 {rain}mm · 💨 {wind}m/s"
                if gust and gust >= 30:
                    linha += f" · ⚡ rajada {gust}km/h"
                linha += f"\n   ⏱ {janela}\n"
                linhas.append(linha)

            linhas.append(f"🔗 [Ver detalhes](https://www.mtbforecaster.com.br/dashboard)")

            mensagem = "\n".join(linhas)

            sucesso = enviar_telegram(chat_id, mensagem)
            if sucesso:
                print(f"  [Telegram] ✓ Enviado para {nome} ({len(trilhas_usuario)} trilhas)")
            else:
                print(f"  [Telegram] ✗ Falhou para {nome}")

        except Exception as exc:
            print(f"  [Telegram] Erro ao processar {usuario.get('nome','?')}: {exc}")


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
            "pico_3h":            resultado.get("pico_3h"),
            "acumulo_48h":        resultado.get("acumulo_48h"),
            "acumulo_ef":         resultado.get("acumulo_ef"),
            "ultima_chuva_h":     resultado.get("ultima_chuva_h"),
            "meia_vida_h":        resultado.get("meia_vida_h"),
            "gust_max_kmh":       resultado.get("gust_max_kmh"),
            "janela":             resultado.get("janela"),
            "horarios_chuva":     resultado.get("horarios_chuva"),
            "frase_secagem":      resultado.get("resumo_secagem_frase"),
            "solo_descansado":    aderencia.get("solo_descansado"),
            "thresh_desc":        resultado.get("thresh_desc"),
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
            "previsao_24h":            resultado.get("previsao_24h"),
            "grip_threshold_ef":       aderencia.get("grip_threshold_ef"),
            "fds_d1_veredicto":   fds.get("d1", {}).get("veredicto", {}).get("texto"),
            "fds_d1_rain":        fds.get("d1", {}).get("rain"),
            "fds_d1_wind":        fds.get("d1", {}).get("wind"),
            "fds_d1_temp":        fds.get("d1", {}).get("temp_max"),
            "fds_d2_veredicto":   fds.get("d2", {}).get("veredicto", {}).get("texto"),
            "fds_d2_rain":        fds.get("d2", {}).get("rain"),
            "fds_d2_wind":        fds.get("d2", {}).get("wind"),
            "fds_d2_temp":        fds.get("d2", {}).get("temp_max"),
            "fds_d3_veredicto":   fds.get("d3", {}).get("veredicto", {}).get("texto"),
            "fds_d3_rain":        fds.get("d3", {}).get("rain"),
            "fds_d3_wind":        fds.get("d3", {}).get("wind"),
            "fds_d3_temp":        fds.get("d3", {}).get("temp_max"),
            "dados_json":         json.dumps({
                "bioma":      resultado.get("bioma"),
                "trail_type": resultado.get("trail_type"),
                "exposicao":  resultado.get("exposicao_raw"),
            })
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
        return trilha_id

    except Exception as exc:
        print(f"  [Supabase] [ERRO] {trilha_name}: {exc}")
        return None


def buscar_segmentos_strava_unicos() -> list:
    """
    Busca configurações únicas de segmentos Strava do Supabase.
    Retorna lista de configurações — uma por strava_segment_id.
    Nunca interrompe o fluxo principal.
    """
    if not SUPABASE_KEY:
        return []
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/strava_segmentos_config"
            f"?select=*"
            f"&order=created_at.asc"
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            }
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            segmentos = json.loads(r.read())
        print(f"  [Supabase] {len(segmentos)} segmento(s) Strava único(s) encontrado(s).")
        return segmentos
    except Exception as exc:
        print(f"  [Supabase] Erro ao buscar segmentos Strava: {exc}")
        return []


def gravar_condicoes_strava(strava_segment_id: int, resultado: dict) -> bool:
    """
    Grava condições em condicoes_strava por strava_segment_id.
    Upsert — atualiza se já existe, insere se não existe.
    Falha silenciosa — nunca interrompe o fluxo do agent.
    """
    if not SUPABASE_KEY:
        return False
    try:
        aderencia     = resultado.get("aderencia", {})
        veredicto     = resultado.get("veredicto", {})
        veredicto_12h = resultado.get("veredicto_12h", {})
        vento_hist    = resultado.get("vento_hist", {})
        enso          = resultado.get("enso", {})
        fds           = resultado.get("fds", {})

        payload = json.dumps({
            "strava_segment_id":  strava_segment_id,
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
            "pico_3h":            resultado.get("pico_3h"),
            "acumulo_48h":        resultado.get("acumulo_48h"),
            "acumulo_ef":         resultado.get("acumulo_ef"),
            "ultima_chuva_h":     resultado.get("ultima_chuva_h"),
            "meia_vida_h":        resultado.get("meia_vida_h"),
            "gust_max_kmh":       resultado.get("gust_max_kmh"),
            "janela":             resultado.get("janela"),
            "horarios_chuva":     resultado.get("horarios_chuva"),
            "frase_secagem":      resultado.get("resumo_secagem_frase"),
            "solo_descansado":    aderencia.get("solo_descansado"),
            "thresh_desc":        resultado.get("thresh_desc"),
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
            "previsao_24h":            resultado.get("previsao_24h"),
            "grip_threshold_ef":       aderencia.get("grip_threshold_ef"),
            "fds_d1_veredicto":   fds.get("d1", {}).get("veredicto", {}).get("texto"),
            "fds_d1_rain":        fds.get("d1", {}).get("rain"),
            "fds_d1_wind":        fds.get("d1", {}).get("wind"),
            "fds_d1_temp":        fds.get("d1", {}).get("temp_max"),
            "fds_d2_veredicto":   fds.get("d2", {}).get("veredicto", {}).get("texto"),
            "fds_d2_rain":        fds.get("d2", {}).get("rain"),
            "fds_d2_wind":        fds.get("d2", {}).get("wind"),
            "fds_d2_temp":        fds.get("d2", {}).get("temp_max"),
            "fds_d3_veredicto":   fds.get("d3", {}).get("veredicto", {}).get("texto"),
            "fds_d3_rain":        fds.get("d3", {}).get("rain"),
            "fds_d3_wind":        fds.get("d3", {}).get("wind"),
            "fds_d3_temp":        fds.get("d3", {}).get("temp_max"),
            "dados_json":         json.dumps({
                "bioma":      resultado.get("bioma"),
                "trail_type": resultado.get("trail_type"),
                "exposicao":  resultado.get("exposicao_raw"),
            })
        }).encode("utf-8")

        # DELETE registro anterior
        url_delete = f"{SUPABASE_URL}/rest/v1/condicoes_strava?strava_segment_id=eq.{strava_segment_id}"
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
        url_insert = f"{SUPABASE_URL}/rest/v1/condicoes_strava"
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
            print(f"  [Supabase] [OK] segmento Strava {strava_segment_id} gravado (status {r.status})")
        return True

    except Exception as exc:
        print(f"  [Supabase] [ERRO] segmento Strava {strava_segment_id}: {exc}")
        return False


def processar_segmentos_strava(datas: dict) -> None:
    """
    Busca segmentos Strava únicos, processa condições e grava em condicoes_strava.
    Cada strava_segment_id é processado uma única vez — sem duplicatas.
    Totalmente isolado do fluxo principal — falha silenciosa.
    """
    segmentos = buscar_segmentos_strava_unicos()
    if not segmentos:
        print("  [Supabase] Nenhum segmento Strava para processar.")
        return

    print(f"\n[MTB V7.6] Processando {len(segmentos)} segmento(s) Strava único(s)...")

    for seg in segmentos:
        try:
            trail = {
                "name":        seg.get("name", "Segmento Strava"),
                "lat":         float(seg.get("lat", 0)),
                "lon":         float(seg.get("lon", 0)),
                "solo_type":   seg.get("solo_type", "misto"),
                "exposicao":   seg.get("exposicao", "fechada"),
                "altitude_m":  int(seg.get("altitude_m") or 900),
                "trail_type":  seg.get("trail_type", "natural"),
                "regiao":      seg.get("regiao", "SP"),
                "desnivel_m":  seg.get("desnivel_m"),
                "extensao_km": seg.get("extensao_km"),
                "bioma":       seg.get("bioma") or "Desconhecido",
            }

            dados_solo = buscar_solo_openlandmap(
                trail["lat"], trail["lon"],
                solo_type=trail.get("solo_type", "misto"),
                bioma=trail.get("bioma", "Desconhecido"),
                regiao=trail.get("regiao", "SP"),
            )
            if dados_solo:
                trail.update(dados_solo)

            dados = processar_trilha(trail, datas)

            strava_segment_id = seg.get("strava_segment_id")
            gravar_condicoes_strava(strava_segment_id, dados)

            print(f"  [OK] {trail['name']} (id:{strava_segment_id}) — {dados['aderencia']['status']} | {dados['veredicto']['texto']}")

        except Exception as exc:
            print(f"  [ERRO] {seg.get('name', 'desconhecido')}: {exc}")


def processar_trilha(trail: dict, datas: dict) -> dict:
    oc_raw = fetch_onecall(trail)
    oc     = resumo_onecall(oc_raw)

    if oc is None:
        oc = {"rain": 0.0, "wind": 0.0, "pop": 0, "pico_3h": 0.0, "tmax": 25}

    om_raw = fetch_openmeteo(trail)
    om     = resumo_openmeteo(om_raw)

    if om:
        rain    = round(oc["rain"]    * 0.7 + om["rain"]    * 0.3, 1)
        wind    = round(oc["wind"]    * 0.7 + om["wind"]    * 0.3, 1)
        pop     = round(oc["pop"]     * 0.7 + om["pop"]     * 0.3)
        pico_3h = round(oc["pico_3h"] * 0.7 + om["pico_3h"] * 0.3, 1)
        fonte   = "OpenWeather + Open-Meteo"
        gust_max_ms = max(oc.get("gust_max", 0.0), om.get("gust_max", 0.0))
    else:
        rain    = oc["rain"]
        wind    = oc["wind"]
        pop     = oc["pop"]
        pico_3h = oc["pico_3h"]
        fonte   = "OpenWeather"
        gust_max_ms = oc.get("gust_max", 0.0)

    gust_max_kmh = round(gust_max_ms * 3.6, 1)

    tmax = oc["tmax"]

    hist        = fetch_onecall_historico(trail)
    meia_vida_h = hist["meia_vida_h"]

    hist_om      = fetch_historico_chuva_om(trail, meia_vida_h)
    acumulo_48h  = hist_om["bruto"]
    acumulo_ef   = hist_om["efetivo"]
    ultima_chuva = hist_om["ultima_chuva_h"]

    # Passa vento sustentado já extraído do timemachine — elimina chamada OW redundante
    vento_hist = fetch_vento_historico(trail, ow_vento_max_kmh=hist.get("vento_max_kmh_ow"))
    inclinacao = calcular_inclinacao(trail)

    mes  = datetime.now(BRT).month
    oni  = fetch_oni_atual()
    enso = classificar_enso(oni)
    thresh_desc = threshold_solo_descansado(mes, enso, trail)

    aderencia = calcular_aderencia(rain, trail, acumulo_ef, pico_3h, mes, enso)
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
            "veredicto": veredicto(ader, r, w, p3, inc, trail_12h, acumulo_ef),
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
        _ordem = {"SECO": 0, "GRIP PERFEITO": 1, "BOA ADERÊNCIA": 2, "BAIXA ADERÊNCIA": 3}
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

        # Tenta One Call 3.0 primeiro (fonte primária, até ~48h)
        dia_oc = [h for h in hourly_oc
                  if datetime.fromtimestamp(h["dt"], tz=BRT).strftime("%Y-%m-%d") == alvo_str]

        if dia_oc:
            # Fonte: One Call 3.0
            precips = [_precip_hora(h) for h in dia_oc]
            r    = round(sum(precips), 1)
            p3   = round(max((sum(precips[i:i+3]) for i in range(max(1, len(precips) - 2))),
                             default=0.0), 1)
            pp   = round(max((h.get("pop", 0) or 0 for h in dia_oc), default=0) * 100)
            tm   = round(max((h.get("temp", 0) or 0 for h in dia_oc), default=0))
            w    = round(max((h.get("wind_speed", 0) or 0 for h in dia_oc), default=0), 1)
            fonte_dia = "OC"
        else:
            # Fallback: Open-Meteo (cobre D+3 quando OC não alcança)
            dia_om = [h for h in hourly_om
                      if datetime.fromtimestamp(h["dt"], tz=BRT).strftime("%Y-%m-%d") == alvo_str]
            if not dia_om:
                return {"disponivel": False}
            precips = [h["precip"] for h in dia_om]
            r    = round(sum(precips), 1)
            p3   = round(max((sum(precips[i:i+3]) for i in range(max(1, len(precips) - 2))),
                             default=0.0), 1)
            pp   = round(max((h["pop"] for h in dia_om), default=0.0) * 100)
            tm   = round(max((h["temp"] for h in dia_om if h["temp"] > 0), default=0))
            w    = round(max((h["wind"] for h in dia_om), default=0.0), 1)
            fonte_dia = "OM"

        inc  = calcular_inclinacao(trail)
        ader = calcular_aderencia(r, trail, acumulo_ate_val, p3, mes, enso)
        return {
            "disponivel": True, "rain": r, "pop": pp, "temp_max": tm, "wind": w,
            "fonte_dia": fonte_dia,
            "veredicto": veredicto(ader, r, w, p3, inc, trail, acumulo_ate_val, vento_hist),
            "debug_model": {
                "acumulo_bruto": acumulo_48h,
                "acumulo_efetivo": acumulo_ef,
                "threshold_descanso": thresh_desc,
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

    def calcular_janela_oc() -> str:
        blocos = []
        inicio = None
        for h in hourly_oc:
            p   = _precip_hora(h)
            pp  = (h.get("pop", 0) or 0) * 100
            w   = h.get("wind_speed", 0) or 0
            dt  = datetime.fromtimestamp(h["dt"], tz=BRT)
            ok  = pp < 30 and p < 1.0 and w < 15
            if ok and inicio is None:
                inicio = dt
            elif not ok and inicio is not None:
                blocos.append((inicio, dt))
                inicio = None
        if inicio and hourly_oc:
            blocos.append((inicio, datetime.fromtimestamp(hourly_oc[-1]["dt"], tz=BRT)))
        if not blocos:
            return "Sem janela limpa nas próximas 48h"
        melhor = max(blocos, key=lambda x: (x[1] - x[0]).total_seconds())
        dur    = int((melhor[1] - melhor[0]).total_seconds() / 3600)
        return f"{melhor[0].strftime('%d/%m %Hh')}–{melhor[1].strftime('%Hh')} ({dur}h)"

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
    vered = veredicto(aderencia, rain, wind, pico_3h, inclinacao, trail, acumulo_ef, vento_hist,
                      aderencia_futura=aderencia_futura)

    return {
        "name":           trail["name"],
        "lat":            trail["lat"],
        "lon":            trail["lon"],
        "regiao":         trail["regiao"],
        "solo_type_raw":  trail["solo_type"],
        "rain":           rain, "pop": pop, "temp_max": tmax, "wind": wind,
        "pico_3h":        pico_3h,
        "acumulo_48h":    acumulo_48h,
        "acumulo_ef":     acumulo_ef,
        "ultima_chuva_h": ultima_chuva,
        "meia_vida_h":    meia_vida_h,
        "temp_media_c":   hist.get("temp_media_c"),
        "vento_medio_ms": hist.get("vento_medio_ms"),
        "nublado_pct":    hist.get("nublado_pct"),
        "umidade_pct":    hist.get("umidade_pct"),
        "enso":           enso,
        "thresh_desc":    thresh_desc,
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
        "veredicto_12h":  resumo_12h_oc(),
        "previsao_24h":   calcular_blocos_24h_oc(),
        "vento_hist":     vento_hist,
        "janela":         calcular_janela_oc(),
        "horarios_chuva": calcular_horarios_chuva_oc(),
        "fds": {
            "d1": resumo_dia_oc(datas["d1"], acumulo_ate(datas["d1"])),
            "d2": resumo_dia_oc(datas["d2"], acumulo_ate(datas["d2"])),
            "d3": resumo_dia_oc(datas["d3"], acumulo_ate(datas["d3"])),
        },
        **dict(zip(
            ("resumo_secagem_frase", "resumo_secagem_cor", "resumo_secagem_bg"),
            _gerar_frase_secagem_claude({
                "acumulo_48h":    acumulo_48h,
                "acumulo_ef":     acumulo_ef,
                "ultima_chuva_h": ultima_chuva,
                "meia_vida_h":    meia_vida_h,
                "thresh_desc":    thresh_desc,
                "aderencia":      aderencia,
                "veredicto":      vered,
                "veredicto_12h":  resumo_12h_oc(),
            })
        )),
    }


def gerar_analise_claude(resultados: list, hoje: str, datas: dict, regiao: str) -> str:
    if not ANTHROPIC_KEY:
        return "Análise automática indisponível (ANTHROPIC_API_KEY não configurada)."

    system = """Você é especialista em clima para mountain bike — DH e Enduro.
Escreva 3 parágrafos curtos e diretos em português do Brasil:
1. Condição geral do solo na região considerando o histórico de chuva das últimas 48h, a previsão e o contexto ENSO (El Niño/La Niña quando relevante)
2. Impacto prático para quem vai pedalar (DH e Enduro) — mencione se o solo está descansado ou já encharcado; quando a inclinação da trilha for alta (>20%), mencione o risco adicional de perda de tração em descidas
3. Melhor estratégia de horário para os próximos 3 dias
Sem títulos, sem listas, sem markdown. Máximo 120 palavras no total."""

    def desc_inclinacao(r: dict) -> str:
        inc = r.get("inclinacao")
        d   = r.get("desnivel_m")
        e   = r.get("extensao_km")
        if inc is not None:
            return f"inclinação={inc}%"
        if d is not None and e is not None:
            return f"desnível={d}m/{e}km"
        if d is not None:
            return f"desnível={d}m"
        return ""

    enso_info = resultados[0].get("enso", {}) if resultados else {}
    enso_str  = f"{enso_info.get('fase','neutro')} (ONI {enso_info.get('oni',0):+.2f})" if enso_info else "ENSO neutro"

    user = (
        f"Região: {regiao}. Data: {hoje}. ENSO: {enso_str}. "
        f"Próximos 3 dias: {datas['d1_label']} / {datas['d2_label']} / {datas['d3_label']}.\n\n"
        f"Dados resumidos:\n"
        + "\n".join(
            f"- {r['name']}: chuva 48h bruto={r['acumulo_48h']}mm efetivo={r['acumulo_ef']}mm"
            f" (últ.chuva {r['ultima_chuva_h']}h atrás, meia-vida {r['meia_vida_h']}h)"
            f", solo {r['aderencia']['status']}"
            f", chuva 12h={r['veredicto_12h']['rain']}mm ({r['veredicto_12h']['veredicto']['texto']})"
            f", chuva prev 48h={r['rain']}mm, vento {r['wind']}m/s"
            + (f", {desc_inclinacao(r)}" if desc_inclinacao(r) else "")
            + f", {r['veredicto']['texto']}"
            for r in resultados
        )
    )

    payload = json.dumps({
        "model": "claude-sonnet-4-5",
        "max_tokens": 300,
        "system": system,
        "messages": [{"role": "user", "content": user}]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={"Content-Type": "application/json",
                 "x-api-key": ANTHROPIC_KEY,
                 "anthropic-version": "2023-06-01"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())["content"][0]["text"].strip()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            print(f"[Claude API] HTTP {exc.code}: {body}")
            if attempt == 2:
                return f"Análise indisponível (HTTP {exc.code})."
            time.sleep(2 ** attempt)
        except (urllib.error.URLError, OSError) as exc:
            print(f"[Claude API] Erro de rede: {exc}")
            if attempt == 2:
                return "Análise indisponível: erro de rede/timeout."
            time.sleep(2 ** attempt)

def _score_ranking(r: dict) -> tuple:
    ordem_verd = {"DROP LIBERADO": 0, "DROP LIBERADO - Veja os alertas": 1, "MELHOR ESPERAR": 2}
    v12  = ordem_verd.get(r["veredicto_12h"]["veredicto"]["texto"], 2)
    solo = ORDEM_CONDICAO.get(r["aderencia"]["status"], 3)
    return (v12, solo)

def _badge(texto, cor, bg):
    return (f'<span style="display:inline-block;padding:3px 10px;border-radius:20px;'
            f'font-size:11px;font-weight:700;letter-spacing:.5px;color:{cor};'
            f'background:{bg};border:1px solid {cor}33;">{texto}</span>')

def _pill_solo(a):
    return _badge(a["status"], a["cor"], a["cor"] + "18")

def _pill_verd(v):
    return _badge(f"{v['emoji']} {v['texto']}", v["cor"], v["bg"])

def _dia_cell(d):
    if not d["disponivel"]:
        return '<td style="padding:8px 12px;text-align:center;color:#9ca3af;font-size:13px;">—</td>'
    v = d["veredicto"]
    return (f'<td style="padding:8px 12px;text-align:center;border-left:1px solid #f1f5f9;">'
            f'<div style="font-size:18px;margin-bottom:2px;">{v["emoji"]}</div>'
            f'<div style="font-size:12px;font-weight:700;color:{v["cor"]};">{v["texto"]}</div>'
            f'<div style="font-size:11px;color:#64748b;margin-top:2px;">'
            f'🌧 {d["rain"]}mm &nbsp;💨 {d["wind"]}m/s &nbsp;🌡 {d["temp_max"]}°C</div>'
            f'</td>')

def _info_inclinacao_html(r: dict) -> str:
    inc = r.get("inclinacao")
    d   = r.get("desnivel_m")
    e   = r.get("extensao_km")
    if inc is not None:
        badge_cor = "#ef4444" if inc > 30 else "#f97316" if inc > 20 else "#64748b"
        return (f'<tr><td style="font-size:12px;color:#64748b;padding-top:4px;">'
                f'⛰&nbsp;Desnível: <b>{d}m</b> em <b>{e}km</b> '
                f'&nbsp;·&nbsp;<span style="color:{badge_cor};font-weight:700;">'
                f'inclinação {inc}%</span></td></tr>')
    if d is not None and e is not None:
        return (f'<tr><td style="font-size:12px;color:#64748b;padding-top:4px;">'
                f'⛰&nbsp;Desnível: <b>{d}m</b> em <b>{e}km</b></td></tr>')
    if d is not None:
        return (f'<tr><td style="font-size:12px;color:#64748b;padding-top:4px;">'
                f'⛰&nbsp;Desnível: <b>{d}m</b></td></tr>')
    return ""

def _info_solo_html(r: dict) -> str:
    clay = r.get("clay_pct")
    texture = r.get("texture_class")
    if clay is None or texture is None:
        return ""
    sand = r.get("sand_pct", "?")
    return (f'<tr><td style="font-size:12px;color:#64748b;padding-top:4px;">'
            f'🪨&nbsp;Solo: <b>{texture}</b>'
            f'&nbsp;<span style="color:#94a3b8;">(argila {clay}%, areia {sand}%)</span>'
            f'</td></tr>')


def _badge_bioma(r: dict) -> str:
    bioma = r.get("bioma", "")
    if not bioma or bioma == "Desconhecido":
        return ""
    if bioma == "Mata Atlântica":
        return (
            '<span style="display:inline-block;margin-left:6px;padding:2px 8px;'
            'border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.4px;'
            'color:#166534;background:#dcfce7;border:1px solid #86efac;">'
            '🌿 Mata Atlântica</span>'
        )
    return (
        f'<span style="display:inline-block;margin-left:6px;padding:2px 8px;'
        f'border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.4px;'
        f'color:#374151;background:#f3f4f6;border:1px solid #d1d5db;">'
        f'🌱 {bioma}</span>'
    )


def _badge_quadrilatero(r: dict) -> str:
    if r.get("solo_type_raw") in ("ferro", "misto_mg"):
        return (
            '<span style="display:inline-block;margin-left:6px;padding:2px 8px;'
            'border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.4px;'
            'color:#92400e;background:#fef3c7;border:1px solid #f59e0b44;">'
            '⛏ Quadrilátero Ferrífero</span>'
        )
    return ""




def _resumo_secagem_local(r: dict) -> str:
    bruto      = r.get("acumulo_48h", 0)
    efetivo    = r.get("acumulo_ef", 0)
    ult_h      = r.get("ultima_chuva_h")
    meia_vida  = r.get("meia_vida_h", 24)
    thresh     = r.get("thresh_desc", 5.0)
    descansado = efetivo < thresh

    if bruto < 0.5:
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
        conclusao = "O solo está descansado e em ótima condição para pedalar." if efetivo < thresh * 0.4 else "O solo está descansado — boa condição para pedalar."
        cor, bg = "#16a34a", "#f0fdf4"
    elif efetivo > thresh * 2:
        conclusao = "O solo ainda está significativamente úmido — atenção na tração."
        cor, bg = "#dc2626", "#fef2f2"
    else:
        conclusao = "O solo está úmido — avalie as condições antes de pedalar."
        cor, bg = "#d97706", "#fffbeb"

    return f"{parte_chuva}{parte_tempo}. {parte_secagem}. {conclusao}", cor, bg


def _gerar_frase_secagem_claude(r: dict) -> tuple:
    if not ANTHROPIC_KEY:
        return _resumo_secagem_local(r)

    bruto      = r.get("acumulo_48h", 0)
    efetivo    = r.get("acumulo_ef", 0)
    ult_h      = r.get("ultima_chuva_h")
    meia_vida  = r.get("meia_vida_h", 24)
    thresh     = r.get("thresh_desc", 5.0)
    descansado = efetivo < thresh

    ult_h_str = f"{round(ult_h)}h atrás" if ult_h is not None else "não identificada"

    aderencia_status  = r.get("aderencia", {}).get("status", "")
    veredicto_texto   = r.get("veredicto", {}).get("texto", "")
    veredicto_12h     = r.get("veredicto_12h", {}).get("veredicto", {}).get("texto", "")
    pico_3h           = r.get("pico_3h", 0)

    prompt = f"""Você é especialista em trilhas de mountain bike DH e Enduro no Brasil.
Escreva UMA frase curta (máximo 2 frases) em português do Brasil explicando a condição do solo desta trilha para um rider.

REGRA CRÍTICA: sua frase DEVE ser 100% consistente com os dados abaixo — eles são a verdade absoluta.
NUNCA contradiga o veredicto. NUNCA sugira condição melhor do que o veredicto indica.
NUNCA diga "solo secando rapidamente" se choveu recentemente ou há chuva prevista.

Dados reais da trilha:
- Chuva acumulada bruta (48h): {bruto}mm
- Chuva efetiva no solo agora: {efetivo}mm
- Última chuva: {ult_h_str}
- Meia-vida de secagem: {meia_vida}h
- Pico de chuva previsto (3h): {pico_3h}mm
- Solo descansado: {"SIM" if descansado else "NÃO — solo já úmido"}

Veredicto calculado pelo modelo (sua frase DEVE refletir isso):
- Aderência: {aderencia_status}
- Veredicto HOJE (12h): {veredicto_12h}
- Veredicto 48h: {veredicto_texto}

Regras adicionais:
- Se última chuva < 3h: mencione que choveu recentemente
- Se pico_3h > 5mm: mencione chuva intensa prevista
- Se veredicto for MELHOR ESPERAR: frase deve ser claramente negativa
- Se veredicto for DROP LIBERADO - Veja os alertas: frase deve mencionar cautela
- Se veredicto for DROP LIBERADO: frase pode ser positiva
- Sem markdown, sem bullet points, sem título, máximo 2 frases."""

    payload = json.dumps({
        "model": "claude-sonnet-4-5",
        "max_tokens": 150,
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
                frase = data["content"][0]["text"].strip()
                if descansado and pico_3h < 3:
                    cor, bg = "#16a34a", "#f0fdf4"
                elif efetivo > thresh * 2 or pico_3h >= 10:
                    cor, bg = "#dc2626", "#fef2f2"
                else:
                    cor, bg = "#d97706", "#fffbeb"
                return frase, cor, bg
        except urllib.error.HTTPError as exc:
            print(f"[Claude Frase] HTTP {exc.code}: {exc.read().decode('utf-8', errors='replace')}")
            if attempt == 2:
                return _resumo_secagem_local(r)
            time.sleep(2 ** attempt)
        except Exception as exc:
            print(f"[Claude Frase] Erro: {exc}")
            if attempt == 2:
                return _resumo_secagem_local(r)
            time.sleep(2 ** attempt)


def _resumo_secagem_html(r: dict) -> str:
    frase = r.get("resumo_secagem_frase", "")
    cor   = r.get("resumo_secagem_cor", "#16a34a")
    bg    = r.get("resumo_secagem_bg", "#f0fdf4")

    if not frase:
        frase, cor, bg = _resumo_secagem_local(r)

    return (
        f'<tr><td style="padding-top:6px;">'
        f'<div style="background:{bg};border-left:3px solid {cor};border-radius:0 6px 6px 0;'
        f'padding:7px 10px;font-size:12px;color:#374151;line-height:1.5;">'
        f'{html_lib.escape(frase)}</div></td></tr>'
    )

def _alerta_vento_html(r: dict) -> str:
    vh     = r.get("vento_hist", {})
    nivel  = vh.get("nivel_vento", 0)
    if nivel == 0:
        return ""

    vento  = vh.get("vento_max_kmh", 0)
    rajada = vh.get("rajada_max_kmh")
    solo_encharcado = r.get("acumulo_ef", 0) >= r.get("thresh_desc", 5.0)

    detalhes = f"{vento} km/h sustentado"
    if rajada is not None:
        detalhes += f" · rajada {rajada} km/h"

    # Cores e textos por nível
    if nivel >= 3:
        bg     = "#fef2f2"
        border = "#fca5a5"
        cor_t  = "#7f1d1d"
        cor_s  = "#b91c1c"
        emoji  = "🔴"
        titulo = "Risco alto — vento de tempestade nas últimas 48h"
        msg    = ("Ventos acima de 90 km/h com alto potencial de arrancar árvores pela raiz "
                  "e derrubar fiação. Avalie presencialmente antes de pedalar — "
                  "risco severo de obstrução na trilha.")
    elif nivel == 2:
        bg     = "#fff7ed"
        border = "#fdba74"
        cor_t  = "#7c2d12"
        cor_s  = "#c2410c"
        emoji  = "🟠"
        titulo = "Ventos fortes nas últimas 48h"
        if solo_encharcado:
            msg = ("Ventos entre 65–90 km/h podem derrubar árvores de médio e grande porte. "
                   "O solo encharcado desestabiliza raízes — risco elevado de queda. "
                   "Avalie as condições no local antes de pedalar.")
        else:
            msg = ("Ventos entre 65–90 km/h podem derrubar árvores mesmo aparentemente saudáveis. "
                   "Possibilidade de galhos e troncos sobre a trilha. "
                   "Avalie as condições no local antes de pedalar.")
    else:  # nivel == 1
        bg     = "#fefce8"
        border = "#fde047"
        cor_t  = "#713f12"
        cor_s  = "#a16207"
        emoji  = "🟡"
        titulo = "Vento moderado a forte nas últimas 48h"
        if solo_encharcado:
            msg = ("Ventos entre 55–65 km/h com solo encharcado aumentam o risco de queda "
                   "de galhos e árvores com saúde comprometida. "
                   "Fique atento a obstruções na trilha.")
        else:
            msg = ("Ventos entre 55–65 km/h podem quebrar galhos de árvores "
                   "com saúde comprometida. Fique atento a galhos soltos na trilha.")

    return (
        f'<div style="background:{bg};border:1px solid {border};border-radius:8px;'
        f'padding:8px 12px;font-size:12px;color:{cor_t};font-weight:600;line-height:1.5;">'
        f'{emoji}&nbsp;<b>{titulo}</b> ({detalhes})<br>'
        f'<span style="font-weight:400;color:{cor_s};">{msg}</span>'
        f'</div>'
    )


def _alerta_rajada_futura_html(r: dict) -> str:
    gust_kmh = r.get("gust_max_kmh", 0.0)
    expo     = r.get("exposicao_raw", "aberta")
    thresh   = 30.0 if expo == "aberta" else 50.0
    if gust_kmh < thresh:
        return ""
    if expo == "aberta":
        msg = (f"Rajadas de até <b>{gust_kmh} km/h</b> previstas nas próximas 48h. "
               f"Trilha exposta — risco de perda de controle em descidas rápidas, "
               f"saltos e trechos de crista.")
    else:
        msg = (f"Rajadas de até <b>{gust_kmh} km/h</b> previstas nas próximas 48h. "
               f"Mesmo em trilha fechada, rajadas acima de {int(thresh)} km/h "
               f"podem atingir clareiras e trechos sem dossel.")
    return (
        f'<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;'
        f'padding:8px 12px;font-size:12px;color:#713f12;font-weight:600;'
        f'line-height:1.5;margin-bottom:6px;">'
        f'🟡 <b>Rajadas previstas nas próximas 48h</b><br>'
        f'<span style="font-weight:400;color:#a16207;">{msg}</span>'
        f'</div>'
    )


def gerar_html(resultados: list, analise: str, hoje: str, datas: dict, regiao: str) -> str:
    ranking  = sorted(resultados, key=_score_ranking)
    melhor   = ranking[0]
    d1_str   = datas["d1_label"]
    d2_str   = datas["d2_label"]
    d3_str   = datas["d3_label"]

    cards_html = ""
    for i, r in enumerate(ranking, 1):
        borda    = r["aderencia"]["cor"]
        maps_url = f"https://www.google.com/maps?q={r['lat']},{r['lon']}"

        # ── Cabeçalho: dados fixos da trilha ──────────────────────────────
        inc  = r.get("inclinacao")
        desn = r.get("desnivel_m")
        ext  = r.get("extensao_km")

        # Linha de características físicas
        carac_partes = []
        if inc is not None:
            inc_cor = "#ef4444" if inc > 30 else "#f97316" if inc > 20 else "#64748b"
            carac_partes.append(
                f'⛰ <b>{desn}m</b> · <b>{ext}km</b> · '
                f'<span style="color:{inc_cor};font-weight:700;">{inc}%</span>'
            )
        elif desn is not None and ext is not None:
            carac_partes.append(f'⛰ <b>{desn}m</b> · <b>{ext}km</b>')
        elif desn is not None:
            carac_partes.append(f'⛰ <b>{desn}m</b>')

        clay    = r.get("clay_pct")
        texture = r.get("texture_class")
        sand    = r.get("sand_pct", "?")
        if clay is not None and texture is not None:
            carac_partes.append(
                f'🪨 {texture} <span style="color:#94a3b8;">(arg {clay}% · ar {sand}%)</span>'
            )

        carac_html = (
            f'<div style="font-size:11px;color:#64748b;margin-top:3px;line-height:1.6;">'
            + ' &nbsp;·&nbsp; '.join(carac_partes)
            + '</div>'
        ) if carac_partes else ""

        # Badges de bioma e quadrilátero
        badges_html = _badge_quadrilatero(r) + _badge_bioma(r)
        badges_div  = (
            f'<div style="margin-top:4px;">{badges_html}</div>'
        ) if badges_html.strip() else ""

        # ── Seção: condição do solo ───────────────────────────────────────
        frase_sec = r.get("resumo_secagem_frase", "")
        cor_sec   = r.get("resumo_secagem_cor",   "#16a34a")
        bg_sec    = r.get("resumo_secagem_bg",    "#f0fdf4")
        if not frase_sec:
            frase_sec, cor_sec, bg_sec = _resumo_secagem_local(r)

        solo_desc_label = (
            '<span style="color:#22c55e;font-weight:700;">solo descansado 🟢</span>'
            if r["acumulo_ef"] < r["thresh_desc"] else
            '<span style="color:#f97316;font-weight:700;">solo já úmido 🟠</span>'
        )
        ultima_str = (
            f'⏱ Última chuva <b>{round(r["ultima_chuva_h"])}h</b> atrás'
            if r.get("ultima_chuva_h") is not None else
            '☀️ Sem chuva recente'
        )

        # ── Seção: previsão ───────────────────────────────────────────────
        pico = r.get("pico_3h", 0)
        pico_html = (
            f'<div style="margin-top:4px;font-size:12px;color:#dc2626;font-weight:600;">'
            f'⚡ Pico de chuva: <b>{pico}mm</b> em 3h</div>'
        ) if pico >= 5 else ""

        # ── Seção: fontes ─────────────────────────────────────────────────
        fontes_lista = [f'📡 Previsão: {r["fonte"]}']
        fontes_lista.append("🌱 Solo: Tabela Mestra Supabase")
        fontes_lista.append("📈 ENSO: NOAA ONI")
        fontes_lista.append("🌧 Chuva hist.: Open-Meteo (archive)")
        if r.get("vento_hist", {}).get("fonte"):
            fontes_lista.append(f'💨 Vento hist.: {r["vento_hist"]["fonte"]}')
        fontes_html = " &nbsp;·&nbsp; ".join(fontes_lista)

        # ── Aderência atual → futura + veredicto (3 linhas) ─────────────
        _sev_ord = {"SECO": 0, "GRIP PERFEITO": 1, "BOA ADERÊNCIA": 2, "BAIXA ADERÊNCIA": 3}
        _af = r["aderencia_futura"]
        _futuro_pior = _sev_ord.get(_af["status"], 0) > _sev_ord.get(r["aderencia"]["status"], 0)
        _rain_str = (
            f' <span style="color:#64748b;">({_af.get("rain_mm", 0):.1f}mm previstos)</span>'
            if _futuro_pior and _af.get("rain_mm", 0) > 0 else ""
        )
        _linha2_sufixo = (
            _rain_str if _futuro_pior
            else ' <span style="color:#94a3b8;">— estável</span>'
        )
        _vd = r["veredicto"]
        _verd_linha3 = (
            f'{_vd["emoji"]} <b style="color:{_vd["cor"]};">{_vd["texto"]}</b>'
            + (f' — {html_lib.escape(_vd["texto_dinamico"])}' if _vd.get("texto_dinamico") else "")
        )

        # ── Seção: alertas ────────────────────────────────────────────────
        alerta_vento         = _alerta_vento_html(r)
        alerta_rajada_futura = _alerta_rajada_futura_html(r)
        alertas_combinados   = alerta_rajada_futura + alerta_vento
        secao_alertas = (
            '<div style="margin-top:10px;">'
            '<div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#94a3b8;'
            'text-transform:uppercase;margin-bottom:6px;">⚠️ Alertas</div>'
            + alertas_combinados +
            '</div>'
        ) if alertas_combinados.strip() else ""

        cards_html += f'''
        <tr><td style="padding:0 0 14px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="
            background:#ffffff;border-radius:12px;border-left:4px solid {borda};
            box-shadow:0 1px 6px rgba(0,0,0,.08);">
            <tr><td style="padding:16px 18px 14px;">

              <!-- CABEÇALHO: nome + dados fixos da trilha -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:28px;vertical-align:top;padding-top:2px;">
                    <span style="font-size:12px;font-weight:700;color:#94a3b8;">#{i:02d}</span>
                  </td>
                  <td style="vertical-align:top;">
                    <a href="{maps_url}" target="_blank"
                       style="font-size:14px;font-weight:800;color:#1e293b;
                              text-decoration:none;display:block;line-height:1.3;"
                       title="Abrir no Google Maps">{html_lib.escape(r["name"])} 📍</a>
                    <div style="font-size:10px;color:#94a3b8;font-weight:600;
                                letter-spacing:.5px;text-transform:uppercase;margin-top:2px;">
                      {"🏟 Bike Park" if r["trail_type"] == "bikepark" else "🏔 Trilha Natural"}
                    </div>
                    {carac_html}
                    {badges_div}
                  </td>
                </tr>
              </table>

              <!-- ADERÊNCIA + VEREDICTO -->
              <div style="margin-top:10px;">
                <div style="font-size:13px;color:#374151;margin-bottom:6px;">
                  ADERÊNCIA ATUAL:&nbsp;
                  {r["aderencia"]["emoji"]} <b style="color:{r["aderencia"]["cor"]};">{r["aderencia"]["status"]}</b>
                </div>
                <div style="font-size:13px;color:#374151;margin-bottom:6px;">
                  ADERÊNCIA {_af["label"]}:&nbsp;
                  {_af["emoji"]} <b style="color:{_af["cor"]};">{_af["status"]}</b>{_linha2_sufixo}
                </div>
                <div style="font-size:14px;">{_verd_linha3}</div>
              </div>

              <!-- SEÇÃO: condição do solo -->
              <div style="margin-top:12px;border-top:1px solid #f1f5f9;padding-top:10px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#94a3b8;
                            text-transform:uppercase;margin-bottom:6px;">🌍 Condição do Solo</div>
                <div style="background:{bg_sec};border-left:3px solid {cor_sec};
                            border-radius:0 6px 6px 0;padding:7px 10px;
                            font-size:12px;color:#374151;line-height:1.6;">
                  {html_lib.escape(frase_sec)}
                </div>
                <div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.8;">
                  🕰 Chuva 48h: <b>{r["acumulo_48h"]}mm</b> bruto
                  &nbsp;·&nbsp; efetivo: <b>{r["acumulo_ef"]}mm</b>
                  &nbsp;·&nbsp; {solo_desc_label}<br>
                  {ultima_str}
                  &nbsp;·&nbsp; ⏳ meia-vida: <b>{r["meia_vida_h"]}h</b>
                </div>
              </div>

              <!-- SEÇÃO: previsão -->
              <div style="margin-top:10px;border-top:1px solid #f1f5f9;padding-top:10px;">
                <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#94a3b8;
                            text-transform:uppercase;margin-bottom:6px;">🌦 Previsão 24h</div>
                <table width="100%" cellpadding="0" cellspacing="0">
                  {''.join(
                      f'<tr><td style="font-size:12px;color:#64748b;padding-bottom:3px;">'
                      f'<b style="color:#475569;">{b["label"]}</b>&nbsp;'
                      f'🌧 <b>{b["rain_mm"]}mm</b> &nbsp;'
                      f'☁️ <b>{b["pop_max"]}%</b> &nbsp;'
                      f'💨 <b>{b["wind_max"]}m/s</b> &nbsp;'
                      f'🌡 <b>{b["temp_med"]}°C</b>'
                      f'</td></tr>'
                      for b in r["previsao_24h"]
                  )}
                </table>
                {pico_html}
                <div style="font-size:12px;color:#64748b;margin-top:4px;">
                  🕐 <b>Melhor janela:</b> {r["janela"]}
                </div>
                <div style="font-size:12px;color:#64748b;margin-top:3px;">
                  🌦 <b>Chuva prevista:</b> {r["horarios_chuva"]}
                </div>
              </div>

              <!-- SEÇÃO: alertas (só aparece quando há alerta) -->
              {secao_alertas}

              <!-- RODAPÉ: fontes -->
              <div style="margin-top:10px;border-top:1px solid #f1f5f9;padding-top:8px;
                          font-size:10px;color:#94a3b8;line-height:1.8;">
                {fontes_html}
              </div>

            </td></tr>
          </table>
        </td></tr>'''

    fds_rows = ""
    for r in ranking:
        fds_rows += f"""
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;font-size:13px;color:#1e293b;font-weight:600;
                     white-space:nowrap;border-right:1px solid #f1f5f9;">
            {r['aderencia']['emoji']} {r['name']}
          </td>
          {_dia_cell(r['fds']['d1'])}
          {_dia_cell(r['fds']['d2'])}
          {_dia_cell(r['fds']['d3'])}
        </tr>"""

    paragrafos = "".join(
        f'<p style="margin:0 0 10px 0;color:#475569;font-size:14px;line-height:1.7;">{html_lib.escape(p.strip())}</p>'
        for p in analise.split("\n") if p.strip()
    )

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

  <tr><td style="background:linear-gradient(135deg,#1e293b 0%,#0f4c35 100%);border-radius:14px 14px 0 0;padding:28px 32px 24px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#86efac;text-transform:uppercase;margin-bottom:6px;">🚵 MTB DH &amp; Enduro — Região {regiao}</div>
    <div style="font-size:22px;font-weight:800;color:#ffffff;line-height:1.2;">Monitoramento de Trilhas</div>
    <div style="font-size:13px;color:#94a3b8;margin-top:6px;">{hoje}</div>
  </td></tr>

  <tr><td style="background:#16a34a;padding:16px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#bbf7d0;text-transform:uppercase;">🏆 Melhor trilha do momento</div>
    <div style="font-size:16px;font-weight:800;color:#ffffff;margin-top:4px;">{html_lib.escape(melhor['name'])}</div>
    <div style="font-size:12px;color:#dcfce7;margin-top:3px;">
      Solo {melhor['aderencia']['status']} &nbsp;·&nbsp; {melhor['rain']}mm &nbsp;·&nbsp; {melhor['wind']}m/s &nbsp;·&nbsp; Janela: {html_lib.escape(melhor['janela'])}
    </div>
  </td></tr>

  <tr><td style="background:#f8fafc;padding:24px 24px 8px;">

    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#64748b;text-transform:uppercase;margin-bottom:12px;">Análise técnica — {regiao}</div>
    <div style="background:#ffffff;border-radius:10px;padding:18px 20px;margin-bottom:24px;border:1px solid #e2e8f0;">{paragrafos}</div>

    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#64748b;text-transform:uppercase;margin-bottom:12px;">Ranking de trilhas — MTB DH &amp; Enduro</div>
    <table width="100%" cellpadding="0" cellspacing="0">{cards_html}</table>

    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#64748b;text-transform:uppercase;margin:8px 0 12px;">Previsão — Próximos 3 dias</div>
    <div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr style="background:#1e293b;">
          <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#94a3b8;letter-spacing:.5px;">Trilha</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:700;color:#94a3b8;border-left:1px solid #334155;">{d1_str}</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:700;color:#94a3b8;border-left:1px solid #334155;">{d2_str}</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:700;color:#94a3b8;border-left:1px solid #334155;">{d3_str}</th>
        </tr>
        {fds_rows}
      </table>
    </div>

  </td></tr>

  <tr><td style="background:#1e293b;border-radius:0 0 14px 14px;padding:16px 32px;text-align:center;">
    <div style="font-size:11px;color:#64748b;">MTB Forecaster V8.0 — Tabela Mestra Supabase &nbsp;·&nbsp; OpenWeather One Call 3.0 + Open-Meteo + Claude AI (Anthropic) &nbsp;·&nbsp; Gerado em {hoje}</div>
    <div style="margin-top:8px;font-size:11px;color:#475569;">
      🚵 Guilherme Leal &nbsp;·&nbsp; MTB Rider &nbsp;&nbsp;|&nbsp;&nbsp; 🚵 Douglas Santos &nbsp;·&nbsp; MTB Rider
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""

def send_email(html_body: str, destinatarios: list, regiao: str) -> None:
    email_from     = _get_config("email_from", "EMAIL_FROM")
    email_password = _get_config("email_password", "EMAIL_PASSWORD")

    if not email_from or not email_password:
        print(f"  [Email] Credenciais não encontradas — email não enviado")
        return

    hoje = datetime.now(BRT).strftime("%d/%m/%Y")
    bcc  = _bcc_global()
    msg  = MIMEMultipart("alternative")
    msg["Subject"] = f"Monitoramento de Trilhas MTB — {regiao} — {hoje}"
    msg["From"]    = email_from
    msg["To"]      = ", ".join(destinatarios)
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(email_from, email_password)
        smtp.sendmail(email_from, destinatarios + bcc, msg.as_string())
    print(f"  ✉️  Email enviado para {len(destinatarios)} destinatário(s) da região {regiao}"
          + (f" + {len(bcc)} BCC global" if bcc else ""))

def _carregar_trilhas_supabase() -> list:
    """
    Carrega trilhas aprovadas do Supabase em vez do trilhas.csv.
    Fallback para CSV se Supabase falhar.
    """
    if not SUPABASE_KEY:
        print("  [Trilhas] SUPABASE_KEY ausente — usando trilhas.csv")
        return []
    try:
        # regiao lido diretamente de trilhas.regiao (campo legado, estado em sigla ex: "SP").
        # TODO: migrar para JOIN com localidades via trilhas.localidade_id:
        #   ?select=...&localidades(estado,cidade,localidade)
        #   Para trilhas novas: regiao = localidades.estado (fallback: trilhas.regiao)
        url = (
            f"{SUPABASE_URL}/rest/v1/trilhas"
            f"?select=id,name,lat,lon,solo_type,exposicao,altitude_m,trail_type,regiao,desnivel_m,extensao_km,bioma"
            f"&aprovada=eq.true"
            f"&order=name.asc"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            dados = json.loads(r.read())
        trilhas = []
        for row in dados:
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
            })
        print(f"  [Trilhas] {len(trilhas)} trilha(s) carregada(s) do Supabase")
        return trilhas
    except Exception as exc:
        print(f"  [Trilhas] Erro ao carregar do Supabase: {exc} — usando trilhas.csv")
        return []


def _buscar_usuarios_email() -> list:
    """Busca usuários com receber_email=true e suas preferências."""
    if not SUPABASE_KEY:
        return []
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/profiles"
            f"?select=id,email,nome,apelido,regiao,email_trilhas_favoritas,email_trilhas_strava"
            f"&receber_email=eq.true"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            usuarios = json.loads(r.read())
        print(f"  [Email] {len(usuarios)} usuário(s) com email ativado")
        return usuarios
    except Exception as exc:
        print(f"  [Email] Erro ao buscar usuários: {exc}")
        return []




def _buscar_strava_usuario(user_id: str) -> list:
    """Busca trilhas Strava do usuário."""
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/trilhas_pessoais"
            f"?select=strava_segment_id,name"
            f"&user_id=eq.{user_id}"
        )
        req = urllib.request.Request(url, headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception:
        return []


def enviar_email_usuario(usuario: dict, resultados_favoritos: list, resultados_strava: list, hoje: str, datas: dict) -> None:
    """
    Envia email personalizado com trilhas favoritas e/ou Strava do usuário.
    """
    email_from     = _get_config("email_from", "EMAIL_FROM")
    email_password = _get_config("email_password", "EMAIL_PASSWORD")
    if not email_from or not email_password:
        print(f"  [Email] Credenciais não encontradas — email não enviado para {usuario['email']}")
        return

    nome = usuario.get("apelido") or usuario.get("nome") or usuario["email"].split("@")[0]
    todos_resultados = []

    if usuario.get("email_trilhas_favoritas") and resultados_favoritos:
        todos_resultados.extend(resultados_favoritos)
    if usuario.get("email_trilhas_strava") and resultados_strava:
        todos_resultados.extend(resultados_strava)

    if not todos_resultados:
        return

    regiao  = usuario.get("regiao") or "BR"
    enso    = todos_resultados[0].get("enso", {"fase": "ENSO Neutro", "oni": 0.0})
    analise = gerar_analise_claude(todos_resultados, hoje, datas, regiao)
    html_body = gerar_html(todos_resultados, analise, hoje, datas, regiao)

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🚵 MTB Forecaster — Suas trilhas hoje, {nome}! — {hoje}"
        msg["From"] = email_from
        msg["To"]   = usuario["email"]
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
            smtp.login(email_from, email_password)
            smtp.sendmail(email_from, [usuario["email"]], msg.as_string())
        print(f"  ✉️  Email pessoal enviado para {usuario['email']} ({len(todos_resultados)} trilha(s))")
    except Exception as exc:
        print(f"  [Email] Erro ao enviar para {usuario['email']}: {exc}")


def main() -> None:
    global TRAILS
    trilhas_sb = _carregar_trilhas_supabase()
    if trilhas_sb:
        TRAILS = trilhas_sb
    else:
        TRAILS = _carregar_trilhas()

    _validar_env()
    print("[MTB V8.0] Carregando configurações do Supabase...")
    _carregar_configuracoes()
    _carregar_tabela_solo()
    _carregar_threshold_sazonal()
    _carregar_meia_vida()
    _carregar_enso_config()
    _carregar_aderencia_thresholds()
    _carregar_veredicto_pesos()
    _carregar_veredicto_limiares()
    _carregar_meia_vida_clima_mult()
    _carregar_microclima_config()
    _carregar_solo_type_config()
    _carregar_inclinacao_config()
    _carregar_score_config()
    _carregar_aderencia_descricoes()

    hoje  = datetime.now(BRT).strftime("%d/%m/%Y")
    datas = proximos_dias()
    print(f"[MTB V8.0] {hoje} — D+1: {datas['d1_label']} | D+2: {datas['d2_label']} | D+3: {datas['d3_label']}")

    resultados_global: list = []

    trails_por_regiao: dict[str, list] = {}
    for trail in TRAILS:
        trails_por_regiao.setdefault(trail["regiao"], []).append(trail)

    emails_por_regiao = _carregar_emails_por_regiao()

    print("[MTB V8.0] Buscando dados de solo via tabela mestra...")
    for trail in TRAILS:
        dados_solo = buscar_solo_openlandmap(
            trail["lat"], trail["lon"],
            solo_type=trail.get("solo_type", "misto"),
            bioma=trail.get("bioma", "Desconhecido"),
            regiao=trail.get("regiao", "SP"),
        )
        if dados_solo:
            trail.update(dados_solo)
            fator_base = round(0.20 + (dados_solo["clay_pct"] / 100) * 1.60, 2)
            fator_base = max(0.25, min(0.90, fator_base))
            print(f"  [Solo] {trail['name']}: clay={dados_solo['clay_pct']}%, sand={dados_solo['sand_pct']}% → {dados_solo['texture_class']}")
        else:
            print(f"  [Solo] {trail['name']}: API indisponível — usando fallback '{trail['solo_type']}'")

    for regiao, trails in sorted(trails_por_regiao.items()):

        if regiao not in emails_por_regiao:
            print(f"[MTB V7.0] Região {regiao}: sem destinatários — pulando envio.")
            continue

        print(f"\n[MTB V7.0] Processando região {regiao} ({len(trails)} trilha(s))...")
        resultados, falhas = [], []

        for trail in trails:
            try:
                dados = processar_trilha(trail, datas)
                resultados.append(dados)
                trilha_id = gravar_supabase(trail["name"], dados)
                dados["trilha_id"] = trilha_id
                resultados_global.append(dados)
                inc_str = f" | inclinação={dados['inclinacao']}%" if dados['inclinacao'] is not None else ""
                print(f"  [OK] {trail['name']} [{trail.get('trail_type','natural')} / {trail['solo_type']}]{inc_str} — {dados['aderencia']['status']} | pico={dados['pico_3h']}mm | 12h: {dados['veredicto_12h']['veredicto']['texto']} | 48h: {dados['veredicto']['texto']}")
            except Exception as exc:
                falhas.append(f"{trail['name']}: {exc}")
                print(f"  [ERRO] {trail['name']}: {exc}")

            if DEBUG_MODEL:
                try:
                    dbg = dados["fds"]["d1"].get("debug_model", {})
                    print(
                        f"  [DEBUG] {trail['name']} | "
                        f"bruto={dbg.get('acumulo_bruto')} | "
                        f"ef={dbg.get('acumulo_efetivo')} | "
                        f"th={dbg.get('threshold_descanso')} | "
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

        if not resultados:
            print(f"  [AVISO] Nenhuma trilha processada para a região {regiao} — email não enviado.")
            continue

        print(f"  [MTB V7.0] Gerando análise via Claude AI para região {regiao}...")
        analise = gerar_analise_claude(resultados, hoje, datas, regiao)

        print(f"  [MTB V7.0] Montando HTML para região {regiao}...")
        html_body = gerar_html(resultados, analise, hoje, datas, regiao)

        if falhas:
            aviso     = "<br>".join(f"⚠️ {html_lib.escape(f)}" for f in falhas)
            html_body = html_body.replace("</body>", f'<p style="text-align:center;font-size:11px;color:#ef4444;">{aviso}</p></body>')

        print(f"  [MTB] Envio de email desativado — dados gravados no Supabase.")

    # Processa segmentos Strava únicos (independente do fluxo principal)
    print("\n[MTB V7.6] Iniciando processamento de segmentos Strava únicos...")
    processar_segmentos_strava(datas)

    # Notificações Telegram
    print("\n[MTB V8.0] Iniciando notificações Telegram...")
    _enviar_notificacoes_telegram(resultados_global, hoje)

    print("\n[MTB V7.0] Concluído.")

if __name__ == "__main__":
    main()
