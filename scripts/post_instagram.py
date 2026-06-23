#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_instagram.py — Posta automaticamente no Instagram uma trilha aleatória com condições.

Fluxo:
  1. Busca trilhas com condições recentes no Supabase
  2. Seleciona aleatoriamente (priorizando trilhas com condições interessantes)
  3. Garante que a imagem de fundo existe no bucket instagram-bg
     (gera via Pollinations.ai se necessário)
  4. Monta a caption com nome, localização, veredicto e dados climáticos
  5. Posta no Instagram via Graph API (criar container → publicar)

Env vars obrigatórias:
  NEXT_PUBLIC_SUPABASE_URL     ex: https://xyz.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    chave de serviço
  INSTAGRAM_ACCESS_TOKEN       token de longa duração (60 dias)
  INSTAGRAM_BUSINESS_ACCOUNT_ID  ex: 17841419948549234

Env vars opcionais:
  DRY_RUN=1                    monta caption e imagem mas não posta
  TRAIL_ID=UUID                força uma trilha específica

Uso:
  python scripts/post_instagram.py
  DRY_RUN=1 python scripts/post_instagram.py
  TRAIL_ID=abc-123 python scripts/post_instagram.py
"""

import io
import math
import os
import random
import sys
import time
import urllib.parse
from datetime import datetime, timezone

import requests
from PIL import Image

# ─── Config ──────────────────────────────────────────────────────────────────

SUPABASE_URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
IG_TOKEN      = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID    = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
DRY_RUN       = os.environ.get("DRY_RUN", "").strip() == "1"
FORCE_TRAIL   = os.environ.get("TRAIL_ID", "").strip()
BUCKET        = "instagram-bg"
GRAPH_API     = "https://graph.facebook.com/v21.0"
OUTPUT_SIZE   = (1080, 1080)
SITE_URL      = "mtbforecaster.com.br"

# ─── Mapeamentos para prompt de imagem ───────────────────────────────────────

BIOMA_EN = {
    "Mata Atlântica": "Atlantic Forest, dense tropical rainforest, mossy rocks, red clay soil, towering trees",
    "Cerrado":        "Brazilian Cerrado savanna, twisted gnarled trees, red laterite soil, dry golden grass",
    "Amazônia":       "Amazon rainforest, impossibly dense jungle, giant buttress roots, 40-meter canopy",
    "Caatinga":       "Caatinga semi-arid scrubland, thorny cacti, leafless white-barked trees, limestone rocks",
    "Pampa":          "Southern Pampa, rolling green hills, golden grass, wide open sky",
    "Pantanal":       "Pantanal wetlands, flooded tropical forest, palm trees, vast flat landscape",
}

CATEGORIA_EN = {
    "sol":        "bright sunny weather, golden light, clear blue sky",
    "nublado":    "overcast grey sky, flat diffused light, moody atmosphere",
    "garoa":      "persistent light drizzle, fine mist, glistening wet surfaces, cool blue-grey light",
    "chuva":      "heavy rainfall, rain streaks in air, puddles, dark dramatic sky",
    "tempestade": "violent thunderstorm, lightning bolts, torrential rain, apocalyptic dark clouds",
}

SOLO_EN = {
    "terra":    "red clay dirt trail",
    "rocha":    "rocky terrain, exposed granite slabs and boulders",
    "misto":    "mixed dirt and rock surface with embedded roots",
    "misto_mg": "iron-rich red soil mixed with quartzite slabs",
    "ferro":    "iron-rich reddish-brown soil of Quadrilátero Ferrífero",
    "preto":    "dark volcanic black soil trail",
}

# ─── Hashtags por estado ──────────────────────────────────────────────────────

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

# ─── Supabase helpers ─────────────────────────────────────────────────────────

def sb_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }


def fetch_trails_with_conditions(trail_id: str | None) -> list[dict]:
    """Busca trilhas aprovadas com condições recentes do Supabase."""
    fields = (
        "id,name,regiao,bioma,exposicao,solo_type,altitude_m,trail_type,"
        "localidades(cidade,estado),"
        "condicoes(veredicto,acumulo_ef,meia_vida_h,rain_mm,acumulo_48h,"
        "pop_48h,wind_ms,temp_max,temp_min,humidity_pct,cloud_pct,gerado_em)"
    )
    url = (
        f"{SUPABASE_URL}/rest/v1/trilhas"
        f"?select={fields}"
        f"&aprovada=eq.true"
        f"&order=name.asc"
    )
    if trail_id:
        url += f"&id=eq.{trail_id}"

    r = requests.get(url, headers=sb_headers(), timeout=30)
    r.raise_for_status()
    trails = r.json()

    # Achata localidades no trail dict
    for t in trails:
        loc = t.pop("localidades", None) or {}
        t["cidade"] = loc.get("cidade") or ""
        t["estado"] = loc.get("estado") or ""

    # Filtra só trilhas que têm pelo menos uma condição
    return [t for t in trails if t.get("condicoes")]


def latest_condition(trail: dict) -> dict | None:
    conds = trail.get("condicoes") or []
    if not conds:
        return None
    # Ordena por gerado_em descendente
    return sorted(conds, key=lambda c: c.get("gerado_em") or "", reverse=True)[0]


# ─── Seleção de trilha ────────────────────────────────────────────────────────

def interest_score(trail: dict) -> float:
    """Pontuação de interesse para variar as postagens. Evita sempre postar só LIBERADO."""
    c = latest_condition(trail)
    if not c:
        return 0.0
    v = (c.get("veredicto") or "").upper()
    score = 1.0
    if "ALERTA" in v:
        score = 1.8  # condições limítrofes são mais interessantes
    elif "ESPERAR" in v or "EVITAR" in v:
        score = 1.4  # fechamento também gera engajamento
    elif "LIBERADO" in v:
        score = 1.0
    # Bônus por variação climática (chuva recente)
    chuva = c.get("rain_mm") or 0
    if chuva >= 10:
        score += 0.5
    elif chuva >= 3:
        score += 0.2
    return score + random.uniform(0, 0.3)  # leve aleatoriedade


def pick_trail(trails: list[dict]) -> dict:
    if not trails:
        raise RuntimeError("Nenhuma trilha com condições encontrada.")
    if len(trails) == 1:
        return trails[0]

    scores = [interest_score(t) for t in trails]
    total = sum(scores)
    probs = [s / total for s in scores]
    return random.choices(trails, weights=probs, k=1)[0]


# ─── Cálculo de drift de acumulo_ef ──────────────────────────────────────────

def acumulo_agora(c: dict) -> float:
    """Aplica drift exponencial desde gerado_em até agora."""
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


# ─── Categoria de imagem ──────────────────────────────────────────────────────

def bg_categoria(rain_mm: float, pop: float) -> str:
    if rain_mm >= 15 or (rain_mm >= 10 and pop >= 70):
        return "tempestade"
    if rain_mm >= 5 or pop > 60:
        return "chuva"
    if rain_mm >= 0.5 or pop >= 35:
        return "garoa"
    if pop >= 20:
        return "nublado"
    return "sol"


# ─── Geração e upload de imagem ───────────────────────────────────────────────

def build_prompt(trail: dict, categoria: str) -> str:
    bioma     = trail.get("bioma") or "Mata Atlântica"
    exposicao = trail.get("exposicao") or "mista"
    solo      = trail.get("solo_type") or "terra"
    alt       = trail.get("altitude_m")

    bioma_desc = BIOMA_EN.get(bioma, BIOMA_EN["Mata Atlântica"])
    cat_desc   = CATEGORIA_EN.get(categoria, CATEGORIA_EN["sol"])
    solo_desc  = SOLO_EN.get(solo, SOLO_EN["terra"])
    exp_desc   = (
        "exposed open ridgeline, panoramic mountain views" if exposicao == "aberta"
        else "fully enclosed by dense canopy, green tunnel of trees" if exposicao == "fechada"
        else "alternating forest and open sections"
    )
    alt_desc = (
        f"high altitude {int(alt)}m, cloud forest, misty peaks" if alt and alt >= 1200
        else f"mid-altitude {int(alt)}m terrain" if alt and alt >= 700
        else ""
    )

    parts = [
        "Cinematic photorealistic landscape photograph for mountain bike trail.",
        f"Biome: {bioma_desc}.",
        f"Trail: {exp_desc}, {solo_desc}.",
        f"Weather: {cat_desc}.",
    ]
    if alt_desc:
        parts.append(f"Terrain: {alt_desc}.")
    parts += [
        "No people. No bikes. No text. No logos.",
        "Ultra wide angle landscape, trail visible in foreground, dramatic atmosphere suitable for white text overlay.",
        "Cinematic depth of field. High contrast. Square 1:1 format. Brazil, South America.",
    ]
    return " ".join(parts)


def storage_key(trail_id: str, categoria: str) -> str:
    return f"{trail_id}_{categoria}.jpg"


def public_image_url(trail_id: str, categoria: str) -> str:
    key = storage_key(trail_id, categoria)
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{key}"


def image_exists_in_bucket(trail_id: str, categoria: str) -> bool:
    key = storage_key(trail_id, categoria)
    url = f"{SUPABASE_URL}/storage/v1/object/info/{BUCKET}/{key}"
    r = requests.get(url, headers=sb_headers(), timeout=10)
    return r.status_code == 200


def generate_via_pollinations(prompt: str, seed: int = 42) -> bytes | None:
    encoded = urllib.parse.quote(prompt)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width=1080&height=1080&nologo=true&model=flux&seed={seed}"
    )
    print(f"  Gerando imagem via Pollinations (seed={seed})...")
    try:
        r = requests.get(url, timeout=120)
        if r.ok:
            return r.content
        print(f"  ✗ Pollinations HTTP {r.status_code}")
        return None
    except Exception as e:
        print(f"  ✗ Pollinations erro: {e}")
        return None


def to_jpeg_1080(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img = img.resize(OUTPUT_SIZE, Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=92, optimize=True)
    return out.getvalue()


def upload_to_bucket(trail_id: str, categoria: str, jpeg_bytes: bytes) -> bool:
    key = storage_key(trail_id, categoria)
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}"
    headers = {
        **sb_headers(),
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    }
    r = requests.post(url, headers=headers, data=jpeg_bytes, timeout=60)
    return r.status_code in (200, 201)


def ensure_image(trail: dict, categoria: str) -> str | None:
    """Garante que a imagem existe no bucket e retorna a URL pública."""
    tid = trail["id"]

    if image_exists_in_bucket(tid, categoria):
        print(f"  ✓ Imagem já existe no bucket: {storage_key(tid, categoria)}")
        return public_image_url(tid, categoria)

    print(f"  Imagem não encontrada — gerando para {trail.get('name')} / {categoria}...")
    prompt = build_prompt(trail, categoria)
    print(f"  Prompt: {prompt[:100]}...")

    raw = generate_via_pollinations(prompt, seed=abs(hash(tid + categoria)) % 9999)
    if not raw:
        return None

    try:
        jpeg = to_jpeg_1080(raw)
    except Exception as e:
        print(f"  ✗ Conversão falhou: {e}")
        return None

    if upload_to_bucket(tid, categoria, jpeg):
        print(f"  ✓ Upload concluído: {storage_key(tid, categoria)}")
        return public_image_url(tid, categoria)
    else:
        print("  ✗ Upload falhou")
        return None


# ─── Caption ──────────────────────────────────────────────────────────────────

VEREDICTO_EMOJI = {
    "LIBERADO": "✅",
    "ALERTA":   "⚠️",
    "ESPERAR":  "⛔",
    "EVITAR":   "🚫",
}

CATEGORIA_EMOJI = {
    "sol":        "☀️",
    "nublado":    "⛅",
    "garoa":      "🌦️",
    "chuva":      "🌧️",
    "tempestade": "⛈️",
}


def build_caption(trail: dict, cond: dict, categoria: str, ef_agora: float) -> str:
    name     = trail.get("name") or "Trilha"
    cidade   = trail.get("cidade") or ""
    estado   = trail.get("estado") or ""
    veredicto= (cond.get("veredicto") or "SEM DADOS").upper()
    rain_mm  = cond.get("rain_mm") or 0
    pop      = cond.get("pop_48h") or 0
    vento    = cond.get("wind_ms") or 0
    temp_max = cond.get("temp_max")
    temp_min = cond.get("temp_min")
    umidade  = cond.get("humidity_pct")

    # Veredicto emoji
    verd_emoji = "✅"
    for key, emoji in VEREDICTO_EMOJI.items():
        if key in veredicto:
            verd_emoji = emoji
            break

    cat_emoji = CATEGORIA_EMOJI.get(categoria, "🌤️")

    # Localização
    localizacao = f"{cidade} — {estado}" if cidade and estado else cidade or estado or ""

    # Solo / acúmulo
    if ef_agora < 0.3:
        solo_status = "Solo seco"
    elif ef_agora < 3:
        solo_status = f"Solo levemente úmido ({ef_agora:.1f}mm ef.)"
    elif ef_agora < 10:
        solo_status = f"Solo encharcado ({ef_agora:.1f}mm ef.)"
    else:
        solo_status = f"Solo muito úmido ({ef_agora:.1f}mm ef.)"

    # Linha de clima
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

    # Hashtags por estado
    state_tags = HASHTAGS_ESTADO.get(estado, f"#{estado}" if estado else "")
    trail_name_tag = "#" + "".join(w.capitalize() for w in name.split()[:3]) if name else ""

    url_linha = f"🔗 {SITE_URL}"

    caption_parts = [
        f"🚵 {name}",
    ]
    if localizacao:
        caption_parts.append(f"📍 {localizacao}")
    caption_parts += [
        "",
        f"{verd_emoji} {veredicto}",
        f"{cat_emoji} {solo_status}",
    ]
    if clima_parts:
        caption_parts.append("   ".join(clima_parts))
    caption_parts += [
        "",
        url_linha,
        "",
        f"#mtb #mountainbike #trilha #mtbbrasil #trailconditions {state_tags} {trail_name_tag}",
    ]

    return "\n".join(caption_parts).strip()


# ─── Postagem no Instagram ────────────────────────────────────────────────────

def create_ig_container(image_url: str, caption: str) -> str | None:
    """Cria o container de mídia no Instagram. Retorna creation_id."""
    url = f"{GRAPH_API}/{IG_USER_ID}/media"
    params = {
        "image_url": image_url,
        "caption": caption,
        "access_token": IG_TOKEN,
    }
    r = requests.post(url, data=params, timeout=30)
    if not r.ok:
        print(f"  ✗ Erro ao criar container: {r.status_code} {r.text}")
        return None
    data = r.json()
    creation_id = data.get("id")
    print(f"  ✓ Container criado: {creation_id}")
    return creation_id


def publish_ig_container(creation_id: str) -> str | None:
    """Publica o container. Retorna media_id do post publicado."""
    url = f"{GRAPH_API}/{IG_USER_ID}/media_publish"
    params = {
        "creation_id": creation_id,
        "access_token": IG_TOKEN,
    }
    r = requests.post(url, data=params, timeout=30)
    if not r.ok:
        print(f"  ✗ Erro ao publicar: {r.status_code} {r.text}")
        return None
    data = r.json()
    media_id = data.get("id")
    print(f"  ✓ Post publicado! media_id={media_id}")
    return media_id


def check_token() -> bool:
    """Verifica se o token ainda é válido."""
    url = f"{GRAPH_API}/me"
    r = requests.get(url, params={"access_token": IG_TOKEN, "fields": "id,name"}, timeout=10)
    if not r.ok:
        print(f"⚠️  Token inválido ou expirado: {r.text}")
        return False
    data = r.json()
    print(f"  Token OK — conta: {data.get('name')} ({data.get('id')})")
    return True


# ─── Main ─────────────────────────────────────────────────────────────────────

def validate_env():
    missing = []
    if not SUPABASE_URL:
        missing.append("NEXT_PUBLIC_SUPABASE_URL")
    if not SUPABASE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not DRY_RUN:
        if not IG_TOKEN:
            missing.append("INSTAGRAM_ACCESS_TOKEN")
        if not IG_USER_ID:
            missing.append("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    if missing:
        print(f"✗ Env vars ausentes: {', '.join(missing)}")
        sys.exit(1)


def main():
    validate_env()

    print("=" * 60)
    print(f"MTB Forecaster — Post Instagram {'[DRY RUN]' if DRY_RUN else ''}")
    print(f"Horário: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    # Valida token
    if not DRY_RUN:
        print("\n[1/5] Verificando token de acesso...")
        if not check_token():
            sys.exit(1)
    else:
        print("\n[1/5] DRY RUN — pulando verificação de token")

    # Busca trilhas
    print(f"\n[2/5] Buscando trilhas {'(ID específico)' if FORCE_TRAIL else '(todas)'}...")
    trails = fetch_trails_with_conditions(FORCE_TRAIL or None)
    print(f"  {len(trails)} trilha(s) com condições encontrada(s)")

    if not trails:
        print("✗ Nenhuma trilha disponível para postar.")
        sys.exit(1)

    # Seleciona trilha
    trail = pick_trail(trails)
    cond  = latest_condition(trail)
    print(f"\n[3/5] Trilha selecionada: {trail.get('name')} — {trail.get('cidade')}/{trail.get('estado')}")
    print(f"  Veredicto: {cond.get('veredicto')}  |  gerado_em: {cond.get('gerado_em')}")

    # Categoria de imagem e acúmulo com drift
    rain_mm   = cond.get("rain_mm") or 0
    pop       = cond.get("pop_48h") or 0
    categoria = bg_categoria(rain_mm, pop)
    ef_agora  = acumulo_agora(cond)
    print(f"  Categoria: {categoria}  |  Acúmulo efetivo agora: {ef_agora:.1f}mm")

    # Garante imagem no bucket
    print(f"\n[4/5] Verificando imagem no bucket ({BUCKET})...")
    if DRY_RUN:
        image_url = public_image_url(trail["id"], categoria)
        print(f"  DRY RUN — URL esperada: {image_url}")
    else:
        image_url = ensure_image(trail, categoria)
        if not image_url:
            print("✗ Falhou ao garantir imagem. Abortando.")
            sys.exit(1)
        print(f"  URL pública: {image_url}")

    # Monta caption
    caption = build_caption(trail, cond, categoria, ef_agora)
    print(f"\n[5/5] Caption:\n{'─'*50}\n{caption}\n{'─'*50}")

    if DRY_RUN:
        print("\n✓ DRY RUN concluído. Nada foi postado.")
        return

    # Posta no Instagram
    print("\n  Postando no Instagram...")

    creation_id = create_ig_container(image_url, caption)
    if not creation_id:
        sys.exit(1)

    # Aguarda processamento do container (recomendado pela Meta)
    time.sleep(5)

    media_id = publish_ig_container(creation_id)
    if not media_id:
        sys.exit(1)

    post_url = f"https://www.instagram.com/p/{media_id}/"
    print(f"\n✅ Post publicado com sucesso!")
    print(f"   Trilha: {trail.get('name')}")
    print(f"   media_id: {media_id}")


if __name__ == "__main__":
    main()
