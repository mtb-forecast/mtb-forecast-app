"""
mtb-forecast-only.py — Atualização horária de previsão meteorológica.

Módulo independente: NÃO toca no modelo de solo (acumulo_ef, aderencia_status,
meia_vida_h, veredicto principal). Atualiza somente colunas de previsão futura.

Colunas atualizadas em `condicoes` (PATCH):
  rain_12h, wind_12h, gust_12h, pop_12h, pico_3h
  veredicto_12h  — somente para UPGRADE (chuva ou rajada >= limiar, nunca rebaixa)
  fds_d1_rain/wind/gust/pop/temp/temp_min
  fds_d2_rain/wind/gust/pop/temp/temp_min
  fds_d3_rain/wind/gust/pop/temp/temp_min

gust_12h/fds_d*_gust alimentam a detecção antecipada de tempestade (rajada
>=90km/h): como este job roda a cada hora (vs. 2-4x/dia do pipeline completo),
é o mecanismo de early-warning mais rápido para vento iminente.

Tabela `previsao_blocos`: DELETE + INSERT (4 blocos de 6h por trilha).

APIs por execução (~133 trilhas, ~23 grupos):
  Open-Meteo forecast batch : 1 chamada (gratuita, ilimitada)
  OWM onecall               : ~23 chamadas (~552/dia — dentro do free tier 1.000/dia)

Para remover: delete este arquivo e .github/workflows/mtb-forecast-hourly.yml.
"""

import os
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

# ── Configuração ─────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://eydlkvrjopffyqpdstzh.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
OWM_KEY      = os.getenv("OPENWEATHER_KEY", "")

BRT = timezone(timedelta(hours=-3))


# ── Supabase helpers ─────────────────────────────────────────────────────────
def _sb_headers():
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }


def _sb_get(path_qs: str):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path_qs}",
        headers=_sb_headers(),
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def _sb_patch(table: str, filter_qs: str, payload: dict):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?{filter_qs}",
        data=json.dumps(payload).encode(),
        headers={**_sb_headers(), "Prefer": "return=minimal"},
    )
    req.get_method = lambda: "PATCH"
    with urllib.request.urlopen(req, timeout=10):
        pass


def _sb_delete(table: str, filter_qs: str):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?{filter_qs}",
        headers=_sb_headers(),
    )
    req.get_method = lambda: "DELETE"
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception:
        pass


def _sb_insert(table: str, rows: list):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}",
        data=json.dumps(rows).encode(),
        headers={**_sb_headers(), "Prefer": "return=minimal"},
    )
    with urllib.request.urlopen(req, timeout=10):
        pass


# ── Carregar trilhas ──────────────────────────────────────────────────────────
def load_trails() -> list[dict]:
    rows = _sb_get(
        "trilhas"
        "?select=id,name,lat,lon,solo_type,exposicao,altitude_m,trail_type,regiao,"
        "desnivel_m,extensao_km,bioma,localidades(cidade,localidade)"
        "&aprovada=eq.true&order=name.asc"
    )
    trails = []
    for row in rows:
        loc = row.get("localidades") or {}
        if isinstance(loc, list):
            loc = loc[0] if loc else {}
        local_key = loc.get("localidade") or loc.get("cidade")
        trails.append({
            "supabase_id": row["id"],
            "name":        row["name"],
            "lat":         float(row["lat"]),
            "lon":         float(row["lon"]),
            "solo_type":   row.get("solo_type", "terra"),
            "exposicao":   row.get("exposicao", "parcial"),
            "altitude_m":  int(row.get("altitude_m") or 900),
            "trail_type":  row.get("trail_type", "natural"),
            "regiao":      row.get("regiao"),
            "local_key":   local_key,
        })
    print(f"[Forecast-only] {len(trails)} trilha(s) carregada(s)")
    return trails


# ── Open-Meteo forecast batch (1 chamada) ────────────────────────────────────
def fetch_om_forecast_batch(grupos: dict) -> dict:
    """
    Retorna dict: local_key → {times, precips, winds, pops, temps}
    Resposta com 1 coord = objeto; 2+ = lista — normaliza para lista.
    """
    keys  = list(grupos.keys())
    lat_s = ",".join(str(grupos[k]["lat"]) for k in keys)
    lon_s = ",".join(str(grupos[k]["lon"]) for k in keys)

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat_s}&longitude={lon_s}"
        "&hourly=precipitation,windspeed_10m,windgusts_10m,precipitation_probability,temperature_2m"
        "&forecast_days=4&timezone=America%2FSao_Paulo"
    )

    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                raw = json.loads(r.read())
            break
        except Exception as exc:
            if attempt == 2:
                print(f"  [OM batch] Falha permanente: {exc}")
                return {}
            time.sleep(5 * (attempt + 1))
    else:
        return {}

    items = raw if isinstance(raw, list) else [raw]
    result = {}
    for lk, item in zip(keys, items):
        h = item.get("hourly", {})
        result[lk] = {
            "times":   h.get("time", []),
            "precips": h.get("precipitation", []),
            "winds":   h.get("windspeed_10m", []),
            "gusts":   h.get("windgusts_10m", []),
            "pops":    h.get("precipitation_probability", []),
            "temps":   h.get("temperature_2m", []),
        }
    print(f"  [OM batch forecast] OK — {len(result)} grupo(s)")
    return result


# ── OWM One Call 3.0 por grupo ───────────────────────────────────────────────
def fetch_owm_onecall(lat: float, lon: float) -> dict | None:
    url = (
        "https://api.openweathermap.org/data/3.0/onecall"
        f"?lat={lat}&lon={lon}&appid={OWM_KEY}&units=metric&lang=pt_br"
        "&exclude=minutely,daily,alerts"
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, OSError):
            if attempt == 2:
                return None
            time.sleep(2 ** attempt)
    return None


# ── Cálculos de previsão ─────────────────────────────────────────────────────
def _precip_hora(h: dict) -> float:
    r = h.get("rain", {})
    if isinstance(r, dict):
        return r.get("1h", 0.0) or 0.0
    return 0.0


def compute_12h_metrics(hourly_oc: list) -> tuple[float, float, int, float, float, float]:
    """Retorna (rain_12h, wind_12h, pop_12h, pico_3h_48h, pico_12h, gust_12h)."""
    h12 = hourly_oc[:12]
    h48 = hourly_oc[:48]

    prec_12 = [_precip_hora(h) for h in h12]
    prec_48 = [_precip_hora(h) for h in h48]
    wind_12 = [h.get("wind_speed", 0) or 0.0 for h in h12]
    gust_12 = [h.get("wind_gust", 0) or 0.0 for h in h12]
    pop_12  = [h.get("pop", 0) or 0.0 for h in h12]

    rain_12h = round(sum(prec_12), 1)
    wind_12h = round(max(wind_12, default=0.0), 1)
    gust_12h = round(max(gust_12, default=0.0) * 3.6, 1)   # m/s → km/h
    pop_12h  = round(max(pop_12, default=0.0) * 100)
    pico_48  = round(max((sum(prec_48[i:i+3]) for i in range(max(1, len(prec_48)-2))),
                         default=0.0), 1)
    pico_12  = round(max((sum(prec_12[i:i+3]) for i in range(max(1, len(prec_12)-2))),
                         default=0.0), 1)
    return rain_12h, wind_12h, pop_12h, pico_48, pico_12, gust_12h


def veredicto_12h_simples(rain_12h: float, pico_12h: float, gust_12h: float = 0.0) -> str | None:
    """
    Retorna texto de veredicto apenas para UPGRADE (chuva ou vento relevante
    detectado). Retorna None quando ambos estão baixos — evita rebaixar um
    veredicto definido pelo pipeline completo (que considera solo + secagem).
    Espelha a lógica de _aplicar_override_vento_futuro() do pipeline completo,
    mas roda a cada hora (early warning) em vez de 2-4x/dia.
    """
    if rain_12h >= 10.0 or pico_12h >= 7.0 or gust_12h >= 90.0:
        return "MELHOR ESPERAR"
    if rain_12h >= 3.0 or pico_12h >= 3.0 or gust_12h >= 65.0:
        return "DROP LIBERADO - Veja os alertas"
    return None


def compute_blocos_24h(hourly_oc: list, agora: datetime) -> list[dict]:
    """4 blocos de 6h a partir de agora usando dados OWM."""
    blocos = []
    for i in range(4):
        ini = agora + timedelta(hours=i * 6)
        fim = agora + timedelta(hours=(i + 1) * 6)
        horas = [
            h for h in hourly_oc
            if ini <= datetime.fromtimestamp(h["dt"], tz=BRT) < fim
        ]
        prec     = [_precip_hora(h) for h in horas]
        wind     = [h.get("wind_speed", 0) or 0.0 for h in horas]
        gust     = [h.get("wind_gust", 0) or 0.0 for h in horas]
        pop      = [h.get("pop", 0) or 0.0 for h in horas]
        temps    = [h.get("temp", 0) or 0.0 for h in horas]
        temp_med = round(sum(temps) / len(temps)) if temps else 0

        blocos.append({
            "label":    f"{ini.hour:02d}h→{fim.hour:02d}h",
            "rain_mm":  round(sum(prec), 1),
            "pop_max":  round(max(pop, default=0.0) * 100),
            "wind_max": round(max(wind, default=0.0), 1),
            "gust_max": round(max(gust, default=0.0) * 3.6, 1),
            "temp_med": temp_med,
        })
    return blocos


def compute_fds_owm(hourly_oc: list, agora: datetime) -> dict:
    """Computa d1/d2 a partir dos dados horários OWM (48h)."""
    result: dict = {}
    for offset, key in [(1, "d1"), (2, "d2")]:
        alvo  = (agora + timedelta(days=offset)).strftime("%Y-%m-%d")
        horas = [
            h for h in hourly_oc
            if datetime.fromtimestamp(h["dt"], tz=BRT).strftime("%Y-%m-%d") == alvo
        ]
        if not horas:
            continue
        prec = [_precip_hora(h) for h in horas]
        wind = [h.get("wind_speed", 0) or 0.0 for h in horas]
        gust = [h.get("wind_gust", 0) or 0.0 for h in horas]
        pop  = [h.get("pop", 0) or 0.0 for h in horas]
        ts   = [h.get("temp", 0) or 0.0 for h in horas]
        result[key] = {
            "rain":     round(sum(prec), 1),
            "wind":     round(max(wind, default=0.0), 1),
            "gust":     round(max(gust, default=0.0) * 3.6, 1),   # m/s → km/h
            "pop":      round(max(pop, default=0.0) * 100),
            "temp_max": round(max(ts, default=0.0)),
            "temp_min": round(min(ts, default=0.0)),
        }
    return result


def compute_fds_om(om_data: dict, agora: datetime) -> dict:
    """Computa d1/d2/d3 a partir dos dados OM forecast (4 dias)."""
    times   = om_data.get("times", [])
    precips = om_data.get("precips", [])
    winds   = om_data.get("winds", [])
    gusts   = om_data.get("gusts", [])
    pops    = om_data.get("pops", [])
    temps   = om_data.get("temps", [])

    result: dict = {}
    for offset, key in [(1, "d1"), (2, "d2"), (3, "d3")]:
        alvo = (agora + timedelta(days=offset)).strftime("%Y-%m-%d")
        idxs = [i for i, t in enumerate(times) if t.startswith(alvo)]
        if not idxs:
            continue
        ps = [precips[i] or 0.0 for i in idxs if i < len(precips)]
        ws = [winds[i]   or 0.0 for i in idxs if i < len(winds)]
        gs = [gusts[i]   or 0.0 for i in idxs if i < len(gusts)]
        pp = [pops[i]    or 0.0 for i in idxs if i < len(pops)]
        ts = [temps[i]          for i in idxs if i < len(temps) and temps[i] is not None]
        result[key] = {
            "rain":     round(sum(ps), 1),
            "wind":     round(max(ws, default=0.0), 1),
            "gust":     round(max(gs, default=0.0), 1),   # windgusts_10m do OM já vem em km/h
            "pop":      round(max(pp, default=0.0)),
            "temp_max": round(max(ts, default=0.0)) if ts else None,
            "temp_min": round(min(ts, default=0.0)) if ts else None,
        }
    return result


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    from mtb_api_logger import log_api, gravar_uso_api

    print(f"[Forecast-only] {datetime.now(BRT).strftime('%Y-%m-%d %H:%M BRT')} — iniciando")

    if not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_KEY ausente")
    if not OWM_KEY:
        raise RuntimeError("OPENWEATHER_KEY ausente")

    # 1. Trilhas aprovadas
    trails = load_trails()

    # 2. Deduplica grupos de clima por local_key
    grupos: dict[str, dict] = {}
    for t in trails:
        lk = t.get("local_key")
        if lk and lk not in grupos:
            grupos[lk] = t
    print(f"[Forecast-only] {len(grupos)} grupo(s) de clima")

    # 3. OM forecast batch — 1 chamada gratuita para todos os grupos
    om_cache = fetch_om_forecast_batch(grupos)
    log_api("open_meteo", "forecast_only_batch",
            sucesso=1 if om_cache else 0,
            falhas=0 if om_cache else 1)

    # 4. OWM onecall por grupo (~23 chamadas)
    owm_cache: dict[str, dict] = {}
    for lk, grupo in grupos.items():
        data = fetch_owm_onecall(grupo["lat"], grupo["lon"])
        if data:
            owm_cache[lk] = data
            log_api("openweathermap", "onecall_hourly", sucesso=1)
        else:
            log_api("openweathermap", "onecall_hourly", sucesso=0, falhas=1)
        time.sleep(0.1)

    print(f"[Forecast-only] OWM: {len(owm_cache)}/{len(grupos)} grupos")

    agora     = datetime.now(BRT)
    gerado_em = agora.isoformat()
    ok = 0
    erros = 0

    # 5. Por trilha: calcular e persistir
    for trail in trails:
        lk  = trail.get("local_key")
        tid = trail["supabase_id"]

        owm = owm_cache.get(lk)
        om  = om_cache.get(lk)

        if not owm and not om:
            continue

        hourly_oc = owm.get("hourly", []) if owm else []

        # ── métricas 12h (OWM) ──────────────────────────────────────
        if hourly_oc:
            rain_12h, wind_12h, pop_12h, pico_3h, pico_12h, gust_12h = compute_12h_metrics(hourly_oc)
            v12h   = veredicto_12h_simples(rain_12h, pico_12h, gust_12h)
            blocos = compute_blocos_24h(hourly_oc, agora)
            fds_owm_data = compute_fds_owm(hourly_oc, agora)
        else:
            rain_12h = wind_12h = pop_12h = pico_3h = gust_12h = None
            v12h = None
            blocos = []
            fds_owm_data = {}

        # ── FDS (OWM d1/d2 + OM d1/d2/d3 como fallback/d3) ─────────
        fds_om_data = compute_fds_om(om, agora) if om else {}
        fds = {
            "d1": fds_owm_data.get("d1") or fds_om_data.get("d1"),
            "d2": fds_owm_data.get("d2") or fds_om_data.get("d2"),
            "d3": fds_om_data.get("d3"),
        }

        # ── monta PATCH (somente colunas de previsão) ────────────────
        patch: dict = {}
        if rain_12h is not None: patch["rain_12h"]  = rain_12h
        if wind_12h is not None: patch["wind_12h"]  = wind_12h
        if gust_12h is not None: patch["gust_12h"]  = gust_12h
        if pop_12h  is not None: patch["pop_12h"]   = pop_12h
        if pico_3h  is not None: patch["pico_3h"]   = pico_3h
        if v12h:                 patch["veredicto_12h"] = v12h  # nunca rebaixa

        for dk, d in fds.items():
            if not d:
                continue
            p = f"fds_{dk}_"
            if d.get("rain")     is not None: patch[f"{p}rain"]     = d["rain"]
            if d.get("wind")     is not None: patch[f"{p}wind"]     = d["wind"]
            if d.get("gust")     is not None: patch[f"{p}gust"]     = d["gust"]
            if d.get("pop")      is not None: patch[f"{p}pop"]      = d["pop"]
            if d.get("temp_max") is not None: patch[f"{p}temp"]     = d["temp_max"]
            if d.get("temp_min") is not None: patch[f"{p}temp_min"] = d["temp_min"]

        try:
            if patch:
                _sb_patch("condicoes", f"trilha_id=eq.{tid}", patch)

            # previsao_blocos: DELETE + INSERT (dados horários de 6 em 6h)
            if blocos:
                _sb_delete("previsao_blocos", f"trilha_id=eq.{tid}")
                _sb_insert("previsao_blocos", [
                    {
                        "trilha_id": tid,
                        "bloco":     i,
                        "label":     b["label"],
                        "rain_mm":   b["rain_mm"],
                        "wind_max":  b["wind_max"],
                        "gust_max":  b["gust_max"],
                        "pop_max":   b["pop_max"],
                        "temp_med":  b["temp_med"],
                        "gerado_em": gerado_em,
                    }
                    for i, b in enumerate(blocos[:4])
                ])
            ok += 1
        except Exception as exc:
            print(f"  [ERR] {trail['name']}: {exc}")
            erros += 1

    print(f"[Forecast-only] Concluído — {ok} OK / {erros} erro(s)")
    gravar_uso_api()


if __name__ == "__main__":
    main()
