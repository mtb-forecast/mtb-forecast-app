#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_reels_clima_extremo.py — Transforma a notícia externa mais recente
([[noticias_externas]], gerada por scripts/post_noticia_externa.py) num Reels
de ~15s e publica no Instagram.

Por quê Reels e não Stories: Stories só alcançam quem já segue a conta.
Reels é o único formato que o Instagram empurra pra fora da base de
seguidores (Explore/descoberta) — é a alavanca de crescimento que faltava.

Peça INDEPENDENTE de post_noticia_externa.py: lê a última linha já gravada
por ele (não busca nem resume de novo — zero custo extra de Tavily/LLM) e só
cuida da parte de vídeo + publicação como Reels. Nunca reprocessa uma notícia
que já tenha reels_postado_em preenchido.

Vídeo: reaproveita a mesma rota OG vertical (1080x1920) já usada pro Stories
(/api/og/instagram/noticia-externa), mas passando um parâmetro extra `bg`
com uma imagem gerada por IA (Pollinations.ai — gratuito, sem chave/cadastro)
relacionada ao conteúdo da notícia (chuva, seca, calor etc.), pra ficar mais
vivo que só o gradiente estático. O prompt em inglês da imagem é gerado a
partir do texto da notícia via DeepSeek (fallback: heurística por palavra-
chave se a chave não estiver configurada ou a chamada falhar — nunca quebra
o pipeline por causa da imagem). A rota OG busca essa imagem server-side e
cai de volta no gradiente puro se a busca falhar (ver route.tsx) — o Stories
nunca usa `bg` e continua com o visual antigo, inalterado.

Depois de composto (texto + imagem de fundo) pela rota OG, anima com leve
zoom (efeito Ken Burns, via ffmpeg zoompan) e adiciona uma trilha ambiente
100% sintetizada (ondas senoidais geradas pelo próprio ffmpeg — nunca uma
faixa de música real, pra não ter risco nenhum de direito autoral). ffmpeg é
instalado via apt-get no início do workflow (não vem mais pré-instalado no
runner ubuntu-latest do GitHub Actions).

Diferente do Stories, Reels aceita caption de verdade — o texto completo
(frase de destaque + bullets + fontes) vai na legenda, não só embutido na
imagem.

Como desligar no futuro (qualquer uma destas opções basta):
  - Desativar o workflow reels-clima-extremo.yml na aba Actions do GitHub.
  - REELS_CLIMA_EXTREMO_ENABLED=0     desliga a geração inteira.
  - REELS_CLIMA_EXTREMO_INSTAGRAM=0   gera o vídeo mas não publica no Instagram.

Uso:
  python scripts/post_reels_clima_extremo.py
  DRY_RUN=1 python scripts/post_reels_clima_extremo.py

Env vars obrigatórias:
  SUPABASE_URL, SUPABASE_SERVICE_KEY

Env vars opcionais:
  OG_API_BASE, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID,
  DEEPSEEK_API_KEY (melhora o prompt da imagem de fundo; sem ela usa heurística)
"""

import os
import subprocess
import sys
import tempfile
import time
import urllib.parse
from datetime import datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mtb_api_logger import log_api

SUPABASE_URL   = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY   = os.environ.get("SUPABASE_SERVICE_KEY", "")
OG_API_BASE    = os.environ.get("OG_API_BASE", "https://mtbforecaster.com.br").rstrip("/")
IG_TOKEN       = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID     = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
DEEPSEEK_KEY   = os.environ.get("DEEPSEEK_API_KEY", "")
GRAPH_API      = "https://graph.facebook.com/v21.0"
POLLINATIONS_API = "https://image.pollinations.ai/prompt/"

ENABLED        = os.environ.get("REELS_CLIMA_EXTREMO_ENABLED", "1").strip() != "0"
POST_INSTAGRAM = os.environ.get("REELS_CLIMA_EXTREMO_INSTAGRAM", "1").strip() != "0"
DRY_RUN        = os.environ.get("DRY_RUN", "").strip() == "1"

VIDEO_DURACAO_S = 15
VIDEO_W, VIDEO_H = 1080, 1920
VIDEO_FPS = 30

HASHTAGS = "#mtb #mountainbike #trilha #mtbbrasil #trailconditions #climaextremo #clima"


def _sb_headers() -> dict:
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def buscar_noticia_pendente() -> dict | None:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/noticias_externas"
        "?select=id,frase_destaque,bullets,fontes,reels_postado_em"
        "&order=id.desc&limit=1",
        headers=_sb_headers(),
        timeout=10,
    )
    if not r.ok:
        raise RuntimeError(f"Erro ao buscar noticia_externa: {r.status_code} {r.text}")
    rows = r.json()
    if not rows:
        return None
    noticia = rows[0]
    if noticia.get("reels_postado_em"):
        print(f"[Reels Clima Extremo] Notícia #{noticia['id']} já virou Reels — nada a fazer")
        return None
    return noticia


def _check_token() -> bool:
    r = requests.get(f"{GRAPH_API}/me", params={"access_token": IG_TOKEN, "fields": "id,name"}, timeout=10)
    if not r.ok:
        print(f"  ⚠ Token inválido ou expirado: {r.text}")
        return False
    print(f"  ✓ Token OK — conta: {r.json().get('name')}")
    return True


_PALAVRAS_CHAVE_IMAGEM = [
    (("seca", "estiagem", "sem chuva"), "severe drought, cracked dry earth, wilted vegetation, "
        "harsh sunlight, brazilian countryside, dramatic cinematic photo"),
    (("calor", "onda de calor", "temperatura recorde"), "brutal heatwave, shimmering heat haze over "
        "a brazilian city skyline, intense sun, dramatic cinematic photo"),
    (("frio", "geada", "baixas temperaturas"), "cold front, frost covered fields, grey misty morning "
        "in southern brazil, dramatic cinematic photo"),
    (("temporal", "chuva forte", "enchente", "alagamento", "tempestade"), "intense tropical storm, "
        "heavy rain and lightning over a brazilian city, flooded street, dramatic cinematic photo"),
    (("vento", "rajada", "vendaval"), "powerful windstorm bending trees, storm clouds over brazil, "
        "dramatic cinematic photo"),
]
_PROMPT_FALLBACK = "dramatic extreme weather over Brazil, storm clouds, cinematic photo, moody lighting"


def _prompt_heuristico(texto: str) -> str:
    texto_lower = texto.lower()
    for palavras, prompt in _PALAVRAS_CHAVE_IMAGEM:
        if any(p in texto_lower for p in palavras):
            return prompt
    return _PROMPT_FALLBACK


def _prompt_via_deepseek(texto: str) -> str | None:
    if not DEEPSEEK_KEY:
        return None
    payload = {
        "model": "deepseek-chat",
        "messages": [{
            "role": "user",
            "content": (
                "Baseado neste resumo de clima extremo no Brasil, escreva UM prompt em "
                "inglês (máx. 30 palavras) pra um gerador de imagens, descrevendo uma cena "
                "fotorrealista e cinematográfica do fenômeno climático descrito (chuva, seca, "
                "calor, frio, vento etc.), sempre ambientada no Brasil. NUNCA inclua texto, "
                "letras, palavras ou pessoas em close no prompt. Responda APENAS com o prompt, "
                f"sem aspas, sem explicação.\n\nResumo: {texto}"
            ),
        }],
        "max_tokens": 120,
        "temperature": 0.7,
    }
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_KEY}"}
    try:
        r = requests.post("https://api.deepseek.com/chat/completions", json=payload, headers=headers, timeout=20)
        if not r.ok:
            print(f"[Reels Clima Extremo] DeepSeek prompt HTTP {r.status_code} — usando heurística")
            log_api("deepseek", "chat_completions", sucesso=0, falhas=1)
            return None
        body = r.json()
        prompt = body["choices"][0]["message"]["content"].strip().strip('"')
        usage = body.get("usage", {})
        log_api("deepseek", "chat_completions",
                tokens_in=usage.get("prompt_tokens", 0),
                tokens_out=usage.get("completion_tokens", 0), sucesso=1)
        return prompt or None
    except Exception as exc:
        print(f"[Reels Clima Extremo] Erro ao gerar prompt via DeepSeek: {exc} — usando heurística")
        log_api("deepseek", "chat_completions", sucesso=0, falhas=1)
        return None


def montar_url_imagem_ia(noticia: dict) -> str:
    texto = noticia["frase_destaque"] + " " + " ".join(
        b.get("texto", "") for b in noticia.get("bullets", [])
    )
    prompt = _prompt_via_deepseek(texto) or _prompt_heuristico(texto)
    print(f"  ✓ Prompt da imagem de fundo: {prompt}")
    prompt_encoded = urllib.parse.quote(prompt)
    seed = noticia["id"]
    return f"{POLLINATIONS_API}{prompt_encoded}?width=1080&height=1920&nologo=true&seed={seed}"


def baixar_imagem_fundo(noticia_id: int, destino: str, bg_url: str | None) -> None:
    url = f"{OG_API_BASE}/api/og/instagram/noticia-externa?id={noticia_id}"
    if bg_url:
        url += f"&bg={urllib.parse.quote(bg_url, safe='')}"
    r = requests.get(url, timeout=60)
    if not r.ok or "image" not in r.headers.get("content-type", ""):
        raise RuntimeError(f"Falha ao baixar imagem de fundo: HTTP {r.status_code}")
    with open(destino, "wb") as f:
        f.write(r.content)
    print(f"  ✓ Imagem de fundo OK ({len(r.content) // 1024}KB)")


def gerar_video(imagem_path: str, video_path: str) -> None:
    """Anima a imagem estática com zoom lento (Ken Burns) e adiciona uma
    trilha ambiente 100% sintetizada (senoides geradas pelo ffmpeg, nunca uma
    gravação de música real — zero risco de direito autoral)."""
    total_frames = VIDEO_DURACAO_S * VIDEO_FPS
    zoompan = (
        f"scale=8000:-1,zoompan=z='min(zoom+0.0008,1.15)':d={total_frames}:"
        f"s={VIDEO_W}x{VIDEO_H}:fps={VIDEO_FPS}"
    )
    # Pad ambiente: duas senoides graves levemente dissonantes, com fade
    # in/out, mixadas e atenuadas — textura de fundo, não "música".
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", imagem_path,
        "-f", "lavfi", "-i", f"sine=frequency=110:duration={VIDEO_DURACAO_S}",
        "-f", "lavfi", "-i", f"sine=frequency=146.83:duration={VIDEO_DURACAO_S}",
        "-filter_complex",
        f"[0:v]{zoompan}[v];"
        f"[1:a]volume=0.10,afade=t=in:st=0:d=2,afade=t=out:st={VIDEO_DURACAO_S-2}:d=2[a1];"
        f"[2:a]volume=0.07,afade=t=in:st=0:d=2,afade=t=out:st={VIDEO_DURACAO_S-2}:d=2[a2];"
        f"[a1][a2]amix=inputs=2:duration=first[a]",
        "-map", "[v]", "-map", "[a]",
        "-t", str(VIDEO_DURACAO_S),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(VIDEO_FPS),
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        video_path,
    ]
    resultado = subprocess.run(cmd, capture_output=True, text=True)
    if resultado.returncode != 0:
        raise RuntimeError(f"ffmpeg falhou: {resultado.stderr[-2000:]}")
    print(f"  ✓ Vídeo gerado ({os.path.getsize(video_path) // 1024}KB)")


def upload_video(video_path: str, noticia_id: int) -> str:
    path = f"clima-extremo-{noticia_id}-{int(time.time())}.mp4"
    with open(video_path, "rb") as f:
        r = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/reels/{path}",
            data=f.read(),
            headers={**_sb_headers(), "Content-Type": "video/mp4"},
            timeout=60,
        )
    if not r.ok:
        raise RuntimeError(f"Erro ao subir vídeo pro Storage: {r.status_code} {r.text}")
    url = f"{SUPABASE_URL}/storage/v1/object/public/reels/{path}"
    print(f"  ✓ Vídeo publicado no Storage: {url}")
    return url


def montar_caption(noticia: dict) -> str:
    linhas = [noticia["frase_destaque"], ""]
    for b in noticia.get("bullets", []):
        linhas.append(f"📍 {b.get('regiao', '')}: {b.get('texto', '')}")
    fontes = noticia.get("fontes") or []
    if fontes:
        linhas.append("")
        linhas.append("Fontes: " + ", ".join(f["titulo"] for f in fontes[:3]))
    linhas.append("")
    linhas.append("🔗 mtbforecaster.com.br")
    linhas.append(HASHTAGS)
    return "\n".join(linhas)


def publicar_reels(video_url: str, caption: str) -> bool:
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media",
        data={
            "video_url": video_url,
            "media_type": "REELS",
            "caption": caption,
            "access_token": IG_TOKEN,
        },
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao criar container: {r.status_code} {r.text}")
        return False
    cid = r.json().get("id")
    print(f"  ✓ Container criado: {cid}")

    # Processamento de vídeo é assíncrono na Graph API — precisa aguardar
    # status_code=FINISHED antes de publicar.
    for tentativa in range(20):
        time.sleep(6)
        r = requests.get(
            f"{GRAPH_API}/{cid}",
            params={"fields": "status_code,status", "access_token": IG_TOKEN},
            timeout=15,
        )
        if not r.ok:
            print(f"  ⚠ Erro ao checar status (tentativa {tentativa+1}): {r.text}")
            continue
        status = r.json().get("status_code")
        print(f"  … status: {status} (tentativa {tentativa+1})")
        if status == "FINISHED":
            break
        if status == "ERROR":
            print(f"  ✗ Processamento falhou: {r.json()}")
            return False
    else:
        print("  ✗ Timeout aguardando processamento do vídeo")
        return False

    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media_publish",
        data={"creation_id": cid, "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao publicar: {r.status_code} {r.text}")
        return False
    print(f"  ✓ Publicado! media_id={r.json().get('id')}")
    return True


def marcar_postado(noticia_id: int) -> None:
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/noticias_externas?id=eq.{noticia_id}",
        json={"reels_postado_em": datetime.now(timezone.utc).isoformat()},
        headers={**_sb_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"},
        timeout=10,
    )
    if not r.ok:
        raise RuntimeError(f"Erro ao marcar reels_postado_em: {r.status_code} {r.text}")


def main() -> None:
    if not ENABLED:
        print("[Reels Clima Extremo] REELS_CLIMA_EXTREMO_ENABLED=0 — desligado")
        return
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_KEY não configuradas")

    noticia = buscar_noticia_pendente()
    if noticia is None:
        return

    noticia_id = noticia["id"]
    print(f"[Reels Clima Extremo] Gerando Reels a partir da notícia #{noticia_id}")

    with tempfile.TemporaryDirectory() as tmp:
        imagem_path = os.path.join(tmp, "fundo.png")
        video_path = os.path.join(tmp, "reels.mp4")

        bg_url = montar_url_imagem_ia(noticia)
        baixar_imagem_fundo(noticia_id, imagem_path, bg_url)
        gerar_video(imagem_path, video_path)

        if DRY_RUN:
            print(f"[DRY RUN] Vídeo gerado em {video_path} — não vai subir nem postar")
            return

        video_url = upload_video(video_path, noticia_id)

    if not POST_INSTAGRAM:
        print("[Reels Clima Extremo] REELS_CLIMA_EXTREMO_INSTAGRAM=0 — vídeo gerado mas não publicado")
        return

    required = {
        "INSTAGRAM_ACCESS_TOKEN": IG_TOKEN,
        "INSTAGRAM_BUSINESS_ACCOUNT_ID": IG_USER_ID,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        raise SystemExit(f"Env vars ausentes p/ Instagram: {', '.join(missing)}")

    if not _check_token():
        raise SystemExit("Token do Instagram inválido ou expirado")

    caption = montar_caption(noticia)
    ok = publicar_reels(video_url, caption)
    if not ok:
        log_api("instagram", "reels_clima_extremo", sucesso=0, falhas=1)
        raise SystemExit("Falha ao publicar Reels no Instagram")

    log_api("instagram", "reels_clima_extremo", sucesso=1)
    marcar_postado(noticia_id)


if __name__ == "__main__":
    main()
