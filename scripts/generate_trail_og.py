#!/usr/bin/env python3
"""
generate_trail_og.py — Gera imagem de fundo OG por trilha usando Google Gemini.

Cada trilha recebe uma imagem única gerada a partir de:
  bioma, exposicao, solo_type, altitude_m, trail_type, desnivel_m, regiao

Modos:
  --local [DIR]   salva em disco para revisão (padrão: scripts/trail-og-preview/)
  --upload        envia para Supabase Storage (bucket trail-og)
  --local --upload  faz os dois ao mesmo tempo

Uso:
    python scripts/generate_trail_og.py --local               # salva localmente para ver
    python scripts/generate_trail_og.py --local --id UUID     # testa uma trilha
    python scripts/generate_trail_og.py --upload              # sobe para Supabase
    python scripts/generate_trail_og.py --local --upload      # salva e sobe
    python scripts/generate_trail_og.py --force --local       # regenera mesmo existentes

Dependências: pip install google-genai pillow requests
Env vars: GEMINI_API_KEY (obrigatório)
          NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apenas se --upload)
"""

import argparse
import io
import os
import sys
import time
import requests
from PIL import Image

try:
    from google import genai
    from google.genai import types as gtypes
except ImportError:
    print("Instale: pip install google-genai")
    sys.exit(1)

# ─── Config ──────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
GEMINI_KEY   = os.environ.get("GEMINI_API_KEY", "")
BUCKET       = "trail-og"
MODEL        = "imagen-4.0-generate-001"   # requer billing no Google AI Studio
OUTPUT_SIZE  = (1080, 1080)
DELAY_S      = 4  # intervalo entre chamadas

# ─── Mapeamentos para o prompt ────────────────────────────────────────────────

BIOMA_EN = {
    "Mata Atlântica": (
        "Atlantic Forest, dense lush tropical rainforest, towering trees with mossy trunks, "
        "ferns covering the ground, red clay soil trail, humid and green"
    ),
    "Cerrado": (
        "Brazilian Cerrado savanna, twisted gnarled low trees, red laterite soil, "
        "dry golden grass, open rocky outcrops, sparse vegetation"
    ),
    "Amazônia": (
        "Amazon rainforest, impossibly dense jungle, 40-meter tree canopy, "
        "giant buttress roots, trail barely visible through vegetation, extreme green"
    ),
    "Caatinga": (
        "Caatinga semi-arid scrubland, thorny cacti and mandacaru, "
        "leafless white-barked trees, exposed limestone and granite rocks, pale dry landscape"
    ),
    "Pampa": (
        "Southern Brazilian Pampa, endless rolling green hills, "
        "golden grass waving in wind, minimal trees, dramatic wide open sky"
    ),
    "Pantanal": (
        "Pantanal wetlands, flooded tropical forest, palm trees reflected in water, "
        "vast flat landscape, dramatic sky"
    ),
}

EXPOSICAO_EN = {
    "fechada": "fully enclosed by dense canopy, green tunnel of trees over the trail, minimal sky visible",
    "aberta":  "exposed open ridgeline or mountain summit, panoramic views, wide dramatic sky",
    "mista":   "trail alternates between dense forest sections and open exposed ridges with views",
}

SOLO_EN = {
    "terra":    "red clay dirt surface, rich red-orange soil",
    "rocha":    "rocky technical terrain, exposed granite or quartzite slabs and boulders",
    "misto":    "mixed dirt and rock surface, roots and embedded rocks in the trail",
    "misto_mg": "Minas Gerais terrain, iron-rich reddish soil mixed with quartzite slabs",
    "ferro":    "iron-rich reddish-brown soil, characteristic of Quadrilátero Ferrífero region",
    "preto":    "dark volcanic black soil, rich organic matter, very dark trail surface",
}

TRAIL_TYPE_EN = {
    "natural":  "natural mountain bike trail carved through native vegetation",
    "bikepark": "purpose-built bike park with sculpted berms, jumps and wooden features",
    "DH":       "steep technical downhill trail with rocky chutes and high-speed berms",
    "XC":       "cross-country singletrack with flowing lines, roots and rocks",
    "Enduro":   "enduro trail, steep technical descent with dramatic exposure",
}

def altitude_desc(alt: float | None, desnivel: float | None) -> str:
    parts = []
    if alt is not None:
        if alt >= 1500:
            parts.append(f"high altitude ({int(alt)}m), cloud forest, misty peaks")
        elif alt >= 800:
            parts.append(f"mid-altitude mountain terrain ({int(alt)}m), Serra landscape")
        else:
            parts.append(f"lowland trail ({int(alt)}m)")
    if desnivel is not None and desnivel > 300:
        parts.append(f"dramatic elevation change of {int(desnivel)}m")
    return ", ".join(parts) if parts else ""


# ─── Prompt builder ───────────────────────────────────────────────────────────

def build_prompt(trail: dict) -> str:
    bioma    = trail.get("bioma") or "Mata Atlântica"
    exposicao= trail.get("exposicao") or "mista"
    solo     = trail.get("solo_type") or "terra"
    alt      = trail.get("altitude_m")
    desnivel = trail.get("desnivel_m")
    ttype    = trail.get("trail_type") or "natural"

    bioma_text    = BIOMA_EN.get(bioma,    BIOMA_EN["Mata Atlântica"])
    exposicao_text= EXPOSICAO_EN.get(exposicao, EXPOSICAO_EN["mista"])
    solo_text     = SOLO_EN.get(solo, SOLO_EN["terra"])
    ttype_text    = TRAIL_TYPE_EN.get(ttype, TRAIL_TYPE_EN["natural"])
    alt_text      = altitude_desc(alt, desnivel)

    parts = [
        "Cinematic photorealistic landscape photograph for mountain bike trail.",
        f"Biome: {bioma_text}.",
        f"Trail: {ttype_text}, {exposicao_text}.",
        f"Ground: {solo_text}.",
    ]
    if alt_text:
        parts.append(f"Terrain: {alt_text}.")

    parts += [
        "Style: dramatic lighting, atmospheric, dark moody shadows suitable for white text overlay.",
        "No people. No bikes. No text. No logos.",
        "Ultra wide angle landscape composition, trail visible in foreground.",
        "Cinematic depth of field. High contrast. Square 1:1 format.",
        "Brazil, South America.",
    ]

    return " ".join(parts)


# ─── Supabase helpers ─────────────────────────────────────────────────────────

def sb_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

def fetch_trails(trail_id: str | None) -> list[dict]:
    fields = "id,name,bioma,exposicao,solo_type,altitude_m,trail_type,desnivel_m,extensao_km,regiao"
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
    return r.json()

def image_exists(trail_id: str) -> bool:
    """Verifica se já existe imagem no bucket."""
    url = f"{SUPABASE_URL}/storage/v1/object/info/{BUCKET}/{trail_id}.jpg"
    r = requests.get(url, headers=sb_headers(), timeout=10)
    return r.status_code == 200

def upload_image(trail_id: str, jpeg_bytes: bytes) -> bool:
    """Faz upload da imagem JPEG para o bucket trail-og."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{trail_id}.jpg"
    headers = {
        **sb_headers(),
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    }
    r = requests.post(url, headers=headers, data=jpeg_bytes, timeout=60)
    return r.status_code in (200, 201)


# ─── Gemini image generation ─────────────────────────────────────────────────

def generate_image_gemini(client: "genai.Client", prompt: str) -> bytes | None:
    """Imagen 4 via Google AI (requer billing ativado no Google AI Studio)."""
    try:
        response = client.models.generate_images(
            model=MODEL,
            prompt=prompt,
            config=gtypes.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="1:1",
                output_mime_type="image/jpeg",
            ),
        )
        if response.generated_images:
            return response.generated_images[0].image.image_bytes
        return None
    except Exception as e:
        print(f"    ✗ Gemini error: {e}")
        return None


def generate_image_pollinations(prompt: str, seed: int = 42) -> bytes | None:
    """Flux via Pollinations.ai — gratuito, sem API key, sem limite."""
    import urllib.parse
    encoded = urllib.parse.quote(prompt)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width=1080&height=1080&nologo=true&model=flux&seed={seed}"
    )
    try:
        r = requests.get(url, timeout=120)
        if r.ok:
            return r.content
        print(f"    ✗ Pollinations HTTP {r.status_code}")
        return None
    except Exception as e:
        print(f"    ✗ Pollinations error: {e}")
        return None


def generate_image(client: "genai.Client | None", prompt: str, use_pollinations: bool, seed: int = 42) -> bytes | None:
    if use_pollinations:
        return generate_image_pollinations(prompt, seed)
    return generate_image_gemini(client, prompt)

def to_jpeg_1080(raw: bytes) -> bytes:
    """Converte qualquer formato (WebP, PNG) para JPEG 1080×1080."""
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img = img.resize(OUTPUT_SIZE, Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=92, optimize=True)
    return out.getvalue()


# ─── Main ─────────────────────────────────────────────────────────────────────

DEFAULT_LOCAL_DIR = os.path.join(os.path.dirname(__file__), "trail-og-preview")


def local_path(out_dir: str, trail: dict) -> str:
    """Nome do arquivo local: {bioma_slug}_{nome_slug}_{id[:8]}.jpg"""
    bioma = (trail.get("bioma") or "desconhecido").lower()
    bioma = bioma.replace(" ", "_").replace("â", "a").replace("ô", "o").replace("ã", "a").replace("é", "e")
    name  = (trail.get("name") or "trilha").lower()
    name  = "".join(c if c.isalnum() else "_" for c in name)[:30].strip("_")
    tid   = trail["id"][:8]
    return os.path.join(out_dir, f"{bioma}__{name}__{tid}.jpg")


def list_models(client: "genai.Client"):
    """Lista modelos disponíveis com suporte a geração de imagem."""
    print("Modelos disponíveis:")
    for m in client.models.list():
        name = getattr(m, "name", str(m))
        if any(k in name.lower() for k in ("imagen", "flash", "vision", "generate")):
            print(f"  {name}")


def main():
    parser = argparse.ArgumentParser(description="Gera imagens OG por trilha via Gemini")
    parser.add_argument("--list-models",  action="store_true", help="Lista modelos disponíveis e sai")
    parser.add_argument("--pollinations", action="store_true", help="Usa Pollinations.ai (Flux) — gratuito, sem billing")
    parser.add_argument("--local", nargs="?", const=DEFAULT_LOCAL_DIR, metavar="DIR",
                        help=f"Salva imagens localmente (padrão: {DEFAULT_LOCAL_DIR})")
    parser.add_argument("--upload", action="store_true", help="Envia para Supabase Storage")
    parser.add_argument("--force",  action="store_true", help="Regenera mesmo se já existir")
    parser.add_argument("--id",     metavar="UUID",      help="Processa apenas esta trilha")
    args = parser.parse_args()

    if not args.list_models and not args.local and not args.upload:
        parser.error("Informe pelo menos --local, --upload ou --list-models.")

    if args.upload and (not SUPABASE_URL or not SUPABASE_KEY):
        print("✗ --upload requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    use_pollinations = args.pollinations
    client = None

    if not use_pollinations:
        if not GEMINI_KEY:
            print("✗ GEMINI_API_KEY é obrigatório (ou use --pollinations para modo gratuito)")
            sys.exit(1)
        client = genai.Client(api_key=GEMINI_KEY)

    if args.list_models:
        if client:
            list_models(client)
        else:
            print("--list-models requer chave Gemini (não compatível com --pollinations)")
        return

    out_dir = args.local
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        print(f"Pasta local: {out_dir}")

    if use_pollinations:
        print("Modo: Pollinations.ai (Flux) — gratuito")

    print("Buscando trilhas...")
    trails = fetch_trails(args.id)
    print(f"  {len(trails)} trilha(s) encontrada(s)\n")

    ok = 0
    skip = 0
    fail = 0

    for i, trail in enumerate(trails, 1):
        tid   = trail["id"]
        name  = trail.get("name", tid)
        bioma = trail.get("bioma") or "?"
        print(f"[{i}/{len(trails)}] {name}  ({bioma})")

        # Checa se já existe (local ou remoto) antes de gerar
        already_local  = out_dir and os.path.exists(local_path(out_dir, trail))
        already_remote = args.upload and image_exists(tid)
        if not args.force and (already_local or already_remote):
            where = "local" if already_local else "Supabase"
            print(f"    → já existe ({where}), pulando  (--force para regenerar)")
            skip += 1
            continue

        prompt = build_prompt(trail)
        print(f"    prompt: {prompt[:110]}…")

        raw = generate_image(client, prompt, use_pollinations, seed=i)
        if not raw:
            fail += 1
            continue

        try:
            jpeg = to_jpeg_1080(raw)
        except Exception as e:
            print(f"    ✗ Conversão falhou: {e}")
            fail += 1
            continue

        saved = False

        if out_dir:
            fpath = local_path(out_dir, trail)
            with open(fpath, "wb") as f:
                f.write(jpeg)
            print(f"    ✓ Local → {os.path.basename(fpath)}  ({len(jpeg)//1024}KB)")
            saved = True

        if args.upload:
            if upload_image(tid, jpeg):
                print(f"    ✓ Supabase → trail-og/{tid}.jpg")
                saved = True
            else:
                print("    ✗ Upload Supabase falhou")
                if not out_dir:
                    fail += 1
                    continue

        if saved:
            ok += 1
        else:
            fail += 1

        if i < len(trails):
            time.sleep(DELAY_S)

    print(f"\n─────────────────────────────")
    print(f"✓ {ok} geradas  |  → {skip} puladas  |  ✗ {fail} falhas")
    if out_dir and ok > 0:
        print(f"\nImagens em: {out_dir}")
        print("Revise e depois rode com --upload para enviar ao Supabase.")

if __name__ == "__main__":
    main()
