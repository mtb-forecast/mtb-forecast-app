#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_instagram.py — Postagem automática diária no Instagram (Stories).

Fluxo:
  1. Busca trilhas com condições reais no Supabase
  2. Seleciona uma trilha aleatória (priorizando veredictos interessantes)
  3. Aquece o endpoint Stories (1080x1920) para garantir que o bucket já tem a imagem
  4. Posta no Instagram como Stories

Env vars obrigatórias:
  OG_API_BASE                  ex: https://mtbforecaster.com.br
  NEXT_PUBLIC_SUPABASE_URL     ex: https://xyz.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    chave de serviço
  INSTAGRAM_ACCESS_TOKEN       token de longa duração (60 dias)
  INSTAGRAM_BUSINESS_ACCOUNT_ID  ex: 17841419948549234

Env vars opcionais:
  DRY_RUN=1     mostra o que seria postado sem postar
  TRAIL_ID=UUID força uma trilha específica

Uso:
  python scripts/post_instagram.py
  DRY_RUN=1 python scripts/post_instagram.py
  TRAIL_ID=abc-123 DRY_RUN=1 python scripts/post_instagram.py
"""

import math
import os
import random
import time
from datetime import datetime, timezone

import requests

# ─── Config ──────────────────────────────────────────────────────────────────

OG_API_BASE  = os.environ.get("OG_API_BASE", "https://mtbforecaster.com.br").rstrip("/")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
IG_TOKEN     = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID   = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
DRY_RUN      = os.environ.get("DRY_RUN", "").strip() == "1"
FORCE_TRAIL  = os.environ.get("TRAIL_ID", "").strip()
GRAPH_API    = "https://graph.facebook.com/v21.0"
SITE_URL     = "mtbforecaster.com.br"

# ─── Supabase helpers ─────────────────────────────────────────────────────────

def sb_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }


def fetch_trails_with_conditions(trail_id: str | None) -> list[dict]:
    """Busca trilhas aprovadas com condições reais (sem placeholders)."""
    fields = (
        "id,name,regiao,bioma,exposicao,solo_type,altitude_m,trail_type,"
        "ultimo_ig_post,"
        "localidades(cidade,estado),"
        "condicoes(veredicto,acumulo_ef,meia_vida_h,rain_mm,"
        "wind_ms,temp_max,temp_min,humidity_pct,cloud_pct,gerado_em,"
        "texto_dinamico,horarios_chuva)"
    )
    url = (
        f"{SUPABASE_URL}/rest/v1/trilhas"
        f"?select={fields}&aprovada=eq.true&order=ultimo_ig_post.asc.nullsfirst"
    )
    if trail_id:
        url += f"&id=eq.{trail_id}"

    r = requests.get(url, headers=sb_headers(), timeout=30)
    r.raise_for_status()
    trails = r.json()

    # Achata localidades
    for t in trails:
        loc = t.pop("localidades", None) or {}
        t["cidade"] = loc.get("cidade") or ""
        t["estado"] = loc.get("estado") or ""

    # Filtra só trilhas com condições reais (sem placeholders)
    PLACEHOLDER = "favorite esta trilha"
    result = []
    for t in trails:
        conds = t.get("condicoes") or []
        real = [
            c for c in conds
            if c.get("veredicto") and PLACEHOLDER not in c["veredicto"].lower()
        ]
        if real:
            t["condicoes"] = real
            result.append(t)
    return result


def latest_condition(trail: dict) -> dict | None:
    conds = trail.get("condicoes") or []
    if not conds:
        return None
    return sorted(conds, key=lambda c: c.get("gerado_em") or "", reverse=True)[0]


# ─── Seleção de trilha ────────────────────────────────────────────────────────

def interest_score(trail: dict) -> float:
    """Pontuação de interesse para variar posts. ALERTA e ESPERAR geram mais engajamento."""
    c = latest_condition(trail)
    if not c:
        return 0.0
    v = (c.get("veredicto") or "").upper()
    score = 1.0
    if "ALERTA" in v:
        score = 1.8
    elif "ESPERAR" in v or "EVITAR" in v:
        score = 1.4
    chuva = c.get("rain_mm") or 0
    if chuva >= 10:
        score += 0.5
    elif chuva >= 3:
        score += 0.2
    return score + random.uniform(0, 0.3)


def pick_trail(trails: list[dict]) -> dict:
    if len(trails) == 1:
        return trails[0]
    # Já vêm ordenadas por ultimo_ig_post ASC NULLS FIRST — pegamos o 1º terço
    # para sortear entre as menos postadas recentemente, evitando repetição.
    pool_size = max(5, len(trails) // 3)
    pool = trails[:pool_size]
    scores = [interest_score(t) for t in pool]
    total = sum(scores)
    return random.choices(pool, weights=[s / total for s in scores], k=1)[0]


def mark_trail_posted(trail_id: str) -> None:
    """Registra o momento do post em trilhas.ultimo_ig_post."""
    url = f"{SUPABASE_URL}/rest/v1/trilhas?id=eq.{trail_id}"
    r = requests.patch(
        url,
        headers={**sb_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"},
        json={"ultimo_ig_post": datetime.now(timezone.utc).isoformat()},
        timeout=15,
    )
    if r.ok:
        print(f"  ✓ ultimo_ig_post atualizado para trilha {trail_id}")
    else:
        print(f"  ⚠ Falha ao atualizar ultimo_ig_post: {r.status_code} {r.text}")


# ─── Drift de acumulo_ef ──────────────────────────────────────────────────────

def acumulo_agora(c: dict) -> float:
    ef = c.get("acumulo_ef") or 0.0
    mh = c.get("meia_vida_h") or 36.0
    gerado_em = c.get("gerado_em")
    if not gerado_em or ef <= 0:
        return ef
    try:
        dt = datetime.fromisoformat(gerado_em.replace("Z", "+00:00"))
        horas = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        return ef * math.pow(0.5, horas / mh)
    except Exception:
        return ef


# ─── Warm-up da imagem OG ────────────────────────────────────────────────────

def warmup_og_image(trail_id: str) -> bool:
    """
    Chama o endpoint OG para garantir que a imagem de fundo já está gerada
    e cacheada no bucket instagram-bg antes do Instagram tentar buscar.
    Retorna True se o endpoint respondeu com imagem válida.
    """
    url = f"{OG_API_BASE}/api/og/instagram?trilha_id={trail_id}"
    print(f"  Chamando OG endpoint (warm-up): {url}")
    try:
        r = requests.get(url, timeout=120)
        if not r.ok:
            print(f"  ✗ OG endpoint HTTP {r.status_code}")
            return False
        ct = r.headers.get("content-type", "")
        if "image" not in ct:
            print(f"  ✗ OG retornou content-type inesperado: {ct}")
            return False
        size_kb = len(r.content) // 1024
        print(f"  ✓ Imagem recebida ({size_kb}KB) — background cacheado no bucket")
        return True
    except Exception as e:
        print(f"  ✗ Erro no warm-up: {e}")
        return False


def og_image_url(trail_id: str) -> str:
    """URL pública do endpoint OG (Feed 1080x1080)."""
    return f"{OG_API_BASE}/api/og/instagram?trilha_id={trail_id}"


def og_stories_url(trail_id: str) -> str:
    """URL pública do endpoint OG (Stories 1080x1920)."""
    return f"{OG_API_BASE}/api/og/instagram/stories?trilha_id={trail_id}"


def warmup_og_stories(trail_id: str) -> bool:
    url = og_stories_url(trail_id)
    print(f"  Chamando OG Stories (warm-up): {url}")
    try:
        r = requests.get(url, timeout=120)
        if not r.ok:
            print(f"  ✗ OG Stories HTTP {r.status_code}")
            return False
        ct = r.headers.get("content-type", "")
        if "image" not in ct:
            print(f"  ✗ OG Stories retornou content-type inesperado: {ct}")
            return False
        size_kb = len(r.content) // 1024
        print(f"  ✓ Stories recebido ({size_kb}KB)")
        return True
    except Exception as e:
        print(f"  ✗ Erro no warm-up Stories: {e}")
        return False


# ─── Caption ─────────────────────────────────────────────────────────────────

HASHTAGS_ESTADO = {
    "SP": "#SaoPaulo #MTBSaoPaulo",
    "RJ": "#RioDeJaneiro #MTBRio",
    "MG": "#MinasGerais #MTBMinas",
    "SC": "#SantaCatarina #MTBSC",
    "RS": "#RioGrandeDoSul #MTBRS",
    "PR": "#Parana #MTBPR",
    "ES": "#EspiritoSanto #MTBES",
    "BA": "#Bahia #MTBBahia",
}

VEREDICTO_EMOJI = {
    "LIBERADO": "✅",
    "ALERTA":   "⚠️",
    "ESPERAR":  "⛔",
    "EVITAR":   "🚫",
}


def build_caption(trail: dict, cond: dict, ef_agora: float) -> str:
    name         = trail.get("name") or "Trilha"
    cidade       = trail.get("cidade") or ""
    estado       = trail.get("estado") or ""
    veredicto    = (cond.get("veredicto") or "SEM DADOS").upper()
    rain_mm      = cond.get("rain_mm") or 0
    vento        = cond.get("wind_ms") or 0
    temp_max     = cond.get("temp_max")
    temp_min     = cond.get("temp_min")
    umidade      = cond.get("humidity_pct")
    texto_din    = (cond.get("texto_dinamico") or "").strip()
    horarios     = (cond.get("horarios_chuva") or "").strip()

    # Formata gerado_em como "25/06 às 07h BRT • Previsão próximas 24h"
    report_line = None
    gerado_em = cond.get("gerado_em")
    if gerado_em:
        try:
            from datetime import timedelta
            dt_utc = datetime.fromisoformat(gerado_em.replace("Z", "+00:00"))
            dt_brt = dt_utc.astimezone(timezone(timedelta(hours=-3)))
            report_line = f"📅 Relatório {dt_brt.strftime('%d/%m às %Hh')} BRT · Previsão próximas 24h"
        except Exception:
            pass

    verd_emoji = "✅"
    for key, emoji in VEREDICTO_EMOJI.items():
        if key in veredicto:
            verd_emoji = emoji
            break

    localizacao = f"{cidade} — {estado}" if cidade and estado else cidade or estado or ""

    if ef_agora < 0.3:
        solo_status = "Solo seco"
    elif ef_agora < 3:
        solo_status = f"Solo levemente úmido ({ef_agora:.1f}mm ef.)"
    elif ef_agora < 10:
        solo_status = f"Solo encharcado ({ef_agora:.1f}mm ef.)"
    else:
        solo_status = f"Solo muito úmido ({ef_agora:.1f}mm ef.)"

    clima_parts = []
    if rain_mm > 0.3:
        clima_parts.append(f"🌧️ {rain_mm:.1f}mm (24h)")
    if vento > 0:
        clima_parts.append(f"💨 {vento:.1f}m/s")
    if temp_max is not None and temp_min is not None:
        clima_parts.append(f"🌡️ {temp_min:.0f}–{temp_max:.0f}°C")
    elif temp_max is not None:
        clima_parts.append(f"🌡️ {temp_max:.0f}°C")
    if umidade is not None:
        clima_parts.append(f"💧 {umidade:.0f}%")

    state_tags = HASHTAGS_ESTADO.get(estado, f"#{estado}" if estado else "")
    trail_tag  = "#" + "".join(w.capitalize() for w in name.split()[:3]) if name else ""

    lines = [f"🚵 {name}"]
    if localizacao:
        lines.append(f"📍 {localizacao}")
    if report_line:
        lines.append(report_line)
    lines += [
        "",
        f"{verd_emoji} {veredicto}",
    ]
    if texto_din:
        lines.append(texto_din)
    lines.append(f"🌿 {solo_status}")
    if horarios:
        lines.append(f"🕐 {horarios}")
    if clima_parts:
        lines.append("   ".join(clima_parts))
    lines += [
        "",
        f"🔗 {SITE_URL}",
        "",
        f"#mtb #mountainbike #trilha #mtbbrasil #trailconditions {state_tags} {trail_tag}",
    ]
    return "\n".join(lines).strip()


# ─── Instagram Graph API ──────────────────────────────────────────────────────

def check_token() -> bool:
    r = requests.get(
        f"{GRAPH_API}/me",
        params={"access_token": IG_TOKEN, "fields": "id,name"},
        timeout=10,
    )
    if not r.ok:
        print(f"  ⚠ Token inválido ou expirado: {r.text}")
        return False
    data = r.json()
    print(f"  ✓ Token OK — conta: {data.get('name')} ({data.get('id')})")
    return True


def create_ig_container(image_url: str, caption: str) -> str | None:
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media",
        data={"image_url": image_url, "caption": caption, "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao criar container: {r.status_code} {r.text}")
        return None
    cid = r.json().get("id")
    print(f"  ✓ Container criado: {cid}")
    return cid


def create_ig_stories_container(image_url: str) -> str | None:
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media",
        data={"image_url": image_url, "media_type": "STORIES", "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao criar container de Stories: {r.status_code} {r.text}")
        return None
    cid = r.json().get("id")
    print(f"  ✓ Container Stories criado: {cid}")
    return cid


def publish_ig_container(creation_id: str) -> str | None:
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media_publish",
        data={"creation_id": creation_id, "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao publicar: {r.status_code} {r.text}")
        return None
    media_id = r.json().get("id")
    print(f"  ✓ Publicado! media_id={media_id}")
    return media_id


# ─── Validação de env ─────────────────────────────────────────────────────────

def validate_env():
    required = {
        "OG_API_BASE":                  OG_API_BASE,
        "NEXT_PUBLIC_SUPABASE_URL":     SUPABASE_URL,
        "SUPABASE_SERVICE_ROLE_KEY":    SUPABASE_KEY,
    }
    if not DRY_RUN:
        required["INSTAGRAM_ACCESS_TOKEN"]       = IG_TOKEN
        required["INSTAGRAM_BUSINESS_ACCOUNT_ID"] = IG_USER_ID
    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"✗ Env vars ausentes: {', '.join(missing)}")
        raise SystemExit(1)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    validate_env()

    print("=" * 60)
    print(f"MTB Forecaster — Post Instagram Stories {'[DRY RUN]' if DRY_RUN else ''}")
    print(f"Horário: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    # [1] Token
    if not DRY_RUN:
        print("\n[1/4] Verificando token de acesso...")
        if not check_token():
            raise SystemExit(1)
    else:
        print("\n[1/4] DRY RUN — pulando verificação de token")

    # [2] Trilhas
    print(f"\n[2/4] Buscando trilhas {'(ID específico)' if FORCE_TRAIL else '(todas)'}...")
    trails = fetch_trails_with_conditions(FORCE_TRAIL or None)
    print(f"  {len(trails)} trilha(s) com condições reais encontrada(s)")
    if not trails:
        print("✗ Nenhuma trilha disponível.")
        raise SystemExit(1)

    # [3] Seleciona
    trail = pick_trail(trails)
    cond  = latest_condition(trail)
    ef    = acumulo_agora(cond)
    print(f"\n[3/4] Trilha selecionada: {trail.get('name')} — {trail.get('cidade')}/{trail.get('estado')}")
    print(f"  Veredicto: {cond.get('veredicto')}  |  Acúmulo agora: {ef:.1f}mm")

    # [4] Stories
    stories_image_url = og_stories_url(trail["id"])
    print(f"\n[4/4] Aquecendo Stories (1080x1920)...")
    if DRY_RUN:
        print(f"  DRY RUN — URL: {stories_image_url}")
        print("\n✓ DRY RUN concluído — nada postado.")
        return

    ok = warmup_og_stories(trail["id"])
    if not ok:
        print("  ⚠ Warm-up falhou — Instagram tentará buscar diretamente")

    print("  Postando Stories...")
    time.sleep(3)
    sid = create_ig_stories_container(stories_image_url)
    if not sid:
        raise SystemExit(1)

    time.sleep(5)
    stories_id = publish_ig_container(sid)
    if not stories_id:
        raise SystemExit(1)

    print(f"\n✅ Stories publicado com sucesso!")
    print(f"   Trilha:   {trail.get('name')}")
    print(f"   Imagem:   {stories_image_url}")
    print(f"   media_id: {stories_id}")

    mark_trail_posted(trail["id"])


if __name__ == "__main__":
    main()
