#!/usr/bin/env python3
"""
mtb_telegram.py — Notificações Telegram por usuário.

Lê veredictos já gravados em condicoes + favoritos do Supabase,
monta mensagem Markdown e envia via Telegram Bot API.
Não recalcula nada — é um leitor puro do banco.
"""

import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

# ─── Config ───────────────────────────────────────────────────────────────────

SUPABASE_URL    = os.getenv("SUPABASE_URL", "https://eydlkvrjopffyqpdstzh.supabase.co")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
TELEGRAM_TOKEN  = os.getenv("TELEGRAM_BOT_TOKEN", "")
APP_URL         = "https://www.mtbforecaster.com.br"
BRT             = timezone(timedelta(hours=-3))

# ─── Paleta ───────────────────────────────────────────────────────────────────

_VERD_EMOJI = {
    "DROP LIBERADO":                   "✅",
    "DROP LIBERADO - Veja os alertas": "⚠️",
    "MELHOR ESPERAR":                  "🛑",
}
_ADH_EMOJI = {
    "GRIP PERFEITO":  "🟢",
    "SECO":           "🟡",
    "BOA ADERÊNCIA":  "🟠",
    "BAIXA ADERÊNCIA":"🔴",
}
_VERD_ORDER = {
    "DROP LIBERADO": 0,
    "DROP LIBERADO - Veja os alertas": 1,
    "MELHOR ESPERAR": 2,
}

# ─── Supabase ─────────────────────────────────────────────────────────────────

def _get(path: str) -> list:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _buscar_usuarios() -> list:
    return _get(
        "profiles"
        "?select=id,apelido,nome,telegram_chat_id"
        "&telegram_ativo=eq.true"
        "&telegram_chat_id=not.is.null"
    )


def _buscar_favoritos(user_id: str) -> list:
    rows = _get(f"favoritos?select=trilha_id&user_id=eq.{user_id}")
    return [r["trilha_id"] for r in rows if r.get("trilha_id")]


def _buscar_condicoes(trilha_ids: list) -> list:
    """Condições de hoje para os trilha_ids — dedup pelo mais recente."""
    hoje = datetime.now(BRT).strftime("%Y-%m-%d")
    ids_csv = ",".join(trilha_ids)
    rows = _get(
        "condicoes"
        f"?select=trilha_id,aderencia_status,veredicto,veredicto_12h"
        f",rain_mm,wind_ms,gust_max_kmh,janela"
        f",fds_d1_veredicto,fds_d1_rain,fds_d1_pop,fds_d1_temp,fds_d1_temp_min"
        f",fds_d2_veredicto,fds_d2_rain,fds_d2_pop,fds_d2_temp,fds_d2_temp_min"
        f",fds_d3_veredicto,fds_d3_rain,fds_d3_pop,fds_d3_temp,fds_d3_temp_min"
        f",trilhas(name)"
        f"&trilha_id=in.({ids_csv})"
        f"&gerado_em=gte.{hoje}T00:00:00"
        f"&order=gerado_em.desc"
    )
    vistos: set = set()
    resultado = []
    for row in rows:
        tid = row.get("trilha_id")
        if tid and tid not in vistos:
            vistos.add(tid)
            resultado.append(row)
    return resultado


def _buscar_strava(user_id: str) -> list:
    """Segmentos Strava do usuário com condições mais recentes."""
    try:
        trilhas = _get(
            f"trilhas_pessoais?select=name,strava_segment_id&user_id=eq.{user_id}"
        )
        resultado = []
        for t in trilhas:
            seg = t.get("strava_segment_id")
            if not seg:
                continue
            conds = _get(
                "condicoes_strava"
                f"?select=aderencia_status,veredicto,veredicto_12h,rain_mm,wind_ms,gust_max_kmh,janela"
                f"&strava_segment_id=eq.{seg}&limit=1"
            )
            if conds:
                c = conds[0]
                resultado.append({
                    "name":           t["name"],
                    "strava":         True,
                    "aderencia_status": c.get("aderencia_status", ""),
                    "veredicto":      c.get("veredicto", ""),
                    "veredicto_12h":  c.get("veredicto_12h", ""),
                    "rain_mm":        c.get("rain_mm", 0),
                    "wind_ms":        c.get("wind_ms", 0),
                    "gust_max_kmh":   c.get("gust_max_kmh", 0),
                    "janela":         c.get("janela", ""),
                    "trilhas":        {"name": t["name"]},
                })
        return resultado
    except Exception as exc:
        print(f"  [Telegram] Erro ao buscar Strava de {user_id}: {exc}")
        return []

# ─── Telegram ─────────────────────────────────────────────────────────────────

def _enviar(chat_id: int, mensagem: str) -> bool:
    if not TELEGRAM_TOKEN:
        return False
    try:
        payload = json.dumps({
            "chat_id":                  chat_id,
            "text":                     mensagem,
            "parse_mode":               "Markdown",
            "disable_web_page_preview": True,
        }).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except Exception as exc:
        print(f"  [Telegram] Erro ao enviar para {chat_id}: {exc}")
        return False

# ─── Helpers de mensagem ──────────────────────────────────────────────────────

def _emoji_tempo(rain_mm, pop_pct) -> str:
    if rain_mm >= 10 or (rain_mm >= 5 and pop_pct >= 70):
        return "⛈"
    if rain_mm >= 2 or pop_pct >= 60:
        return "🌧"
    return "🌤"


def _proximos_dias() -> dict:
    hoje = datetime.now(BRT).date()
    dias_semana = {0: "Seg", 1: "Ter", 2: "Qua", 3: "Qui", 4: "Sex", 5: "Sáb", 6: "Dom"}
    return {
        "d1": f"{dias_semana[(hoje + timedelta(1)).weekday()]} {(hoje + timedelta(1)).strftime('%d/%m')}",
        "d2": f"{dias_semana[(hoje + timedelta(2)).weekday()]} {(hoje + timedelta(2)).strftime('%d/%m')}",
        "d3": f"{dias_semana[(hoje + timedelta(3)).weekday()]} {(hoje + timedelta(3)).strftime('%d/%m')}",
    }


def _montar_mensagem(nome: str, trails: list, datas: dict, hoje_str: str) -> str:
    linhas = [f"🚵 *MTB Forecaster — {hoje_str}*\n"]
    linhas.append(f"Olá, *{nome}*\\! Suas trilhas hoje:\n")

    for t in trails:
        name       = (t.get("trilhas") or {}).get("name") or t.get("name", "Trilha")
        adh        = (t.get("aderencia_status") or "").strip()
        verd       = ((t.get("veredicto_12h") or t.get("veredicto")) or "").strip()
        rain       = t.get("rain_mm", 0) or 0
        wind       = t.get("wind_ms", 0) or 0
        gust       = t.get("gust_max_kmh", 0) or 0
        janela     = t.get("janela", "—") or "—"
        is_strava  = t.get("strava", False)

        verd_emoji = _VERD_EMOJI.get(verd, "•")
        adh_emoji  = _ADH_EMOJI.get(adh, "•")
        strava_tag = " 🟠 _Strava_" if is_strava else ""

        linha  = f"{verd_emoji} *{name}*{strava_tag}\n"
        linha += f"   {adh_emoji} {adh} · {verd}\n"
        linha += f"   🌧 {rain}mm · 💨 {wind}m/s"
        if gust and gust >= 30:
            linha += f" · ⚡ rajada {gust}km/h"
        linha += f"\n   🕐 {janela}\n"

        # Previsão D+1 / D+2 / D+3 (só para trilhas públicas com dados FDS)
        for dk, label in [("d1", datas["d1"]), ("d2", datas["d2"]), ("d3", datas["d3"])]:
            vt   = t.get(f"fds_{dk}_veredicto")
            if not vt:
                continue
            rain_fds = t.get(f"fds_{dk}_rain") or 0
            pop_fds  = t.get(f"fds_{dk}_pop")  or 0
            tmax     = t.get(f"fds_{dk}_temp")     or "—"
            tmin     = t.get(f"fds_{dk}_temp_min") or "—"
            te = _emoji_tempo(rain_fds, pop_fds)
            linha += f"   {label} {te} {tmax}°/{tmin}° · {vt}\n"

        linhas.append(linha)

    linhas.append(f"🔗 [Ver detalhes]({APP_URL}/dashboard)")
    return "\n".join(linhas)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    if not SUPABASE_KEY:
        print("[Telegram] SUPABASE_SERVICE_ROLE_KEY ausente — abortando")
        return
    if not TELEGRAM_TOKEN:
        print("[Telegram] TELEGRAM_BOT_TOKEN ausente — abortando")
        return

    agora    = datetime.now(BRT)
    hoje_str = agora.strftime("%d/%m/%Y")
    datas    = _proximos_dias()

    print(f"\n[MTB Telegram] {agora.strftime('%d/%m/%Y %H:%M')} — iniciando...")

    try:
        usuarios = _buscar_usuarios()
    except Exception as exc:
        print(f"[Telegram] Erro ao buscar usuários: {exc}")
        return

    if not usuarios:
        print("  Nenhum usuário com Telegram ativo")
        return

    print(f"  {len(usuarios)} usuário(s) com Telegram ativo")

    for u in usuarios:
        uid      = u.get("id")
        chat_id  = u.get("telegram_chat_id")
        nome     = u.get("apelido") or u.get("nome") or "Rider"
        if not uid or not chat_id:
            continue

        trails: list = []

        # Favoritos públicos
        try:
            fav_ids = _buscar_favoritos(uid)
            if fav_ids:
                trails.extend(_buscar_condicoes(fav_ids))
        except Exception as exc:
            print(f"  [Telegram] Erro favoritos de {nome}: {exc}")

        # Strava
        trails.extend(_buscar_strava(uid))

        if not trails:
            print(f"  {nome}: sem trilhas com dados hoje — pulando")
            continue

        # Ordena: DROP LIBERADO → alertas → MELHOR ESPERAR
        trails.sort(key=lambda r: _VERD_ORDER.get(
            ((r.get("veredicto_12h") or r.get("veredicto")) or "").strip(), 3
        ))

        mensagem = _montar_mensagem(nome, trails, datas, hoje_str)

        print(f"  Enviando para {nome} ({len(trails)} trilha(s))...")
        ok = _enviar(int(chat_id), mensagem)
        print(f"  {'✓ Enviado' if ok else '✗ Falhou'}")


if __name__ == "__main__":
    main()
