#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_noticia_externa.py — Pesquisa notícias reais de clima extremo no Brasil
(via web_search tool do Claude) e publica um resumo com as fontes de verdade
retornadas pela busca, no feed do app e no Instagram.

Peça INDEPENDENTE de noticias_clima (que resume só dados das nossas trilhas).
Aqui o conteúdo vem de uma busca real na web — as fontes exibidas ("fontes")
são exatamente as citações que a API de busca retornou, nunca inventadas.
NUNCA adicionar selo de fonte que não veio de uma citação real da API.

Como desligar no futuro (qualquer uma destas opções basta):
  - Desativar o workflow noticia-externa.yml na aba Actions do GitHub.
  - NOTICIA_EXTERNA_ENABLED=0            desliga a geração inteira.
  - NOTICIA_EXTERNA_INSTAGRAM=0          gera e grava no feed do app, mas não
                                          posta no Instagram.
  - NOTICIA_EXTERNA_ATIVO em lib/feed.ts  some do feed do app, sem tocar aqui.

Uso:
  python scripts/post_noticia_externa.py
  DRY_RUN=1 python scripts/post_noticia_externa.py

Env vars obrigatórias:
  SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY

Env vars opcionais (Instagram):
  OG_API_BASE, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID
"""

import json
import os
import time
from datetime import datetime, timezone

import requests

SUPABASE_URL   = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY   = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_KEY  = os.environ.get("ANTHROPIC_API_KEY", "")
OG_API_BASE    = os.environ.get("OG_API_BASE", "https://mtbforecaster.com.br").rstrip("/")
IG_TOKEN       = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID     = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
GRAPH_API      = "https://graph.facebook.com/v21.0"

ENABLED        = os.environ.get("NOTICIA_EXTERNA_ENABLED", "1").strip() != "0"
POST_INSTAGRAM = os.environ.get("NOTICIA_EXTERNA_INSTAGRAM", "1").strip() != "0"
DRY_RUN        = os.environ.get("DRY_RUN", "").strip() == "1"

# claude-haiku-4-5 não suporta a variante com dynamic filtering (_20260209) —
# usar a variante básica, suficiente para uma busca simples e pontual.
_WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search"}

_PROMPT = """Pesquise as principais notícias de HOJE sobre clima extremo no Brasil
(secas, temporais, ondas de calor, alertas meteorológicos regionais). Use a
busca na web para encontrar fontes reais e recentes.

Depois de pesquisar, sua ÚLTIMA mensagem deve conter APENAS um JSON válido
(sem markdown, sem cercas ```, sem texto explicando que você pesquisou, sem
título) no formato exato:
{
  "frase_destaque": "1 frase (até 220 caracteres) resumindo o contraste climático mais notável no país hoje, tom direto de manchete, sem markdown",
  "bullets": [
    {"regiao": "NOME DA REGIÃO OU TEMA", "texto": "1 frase curta (até 140 caracteres) baseada só no que você encontrou"}
  ]
}

Inclua no máximo 4 bullets. NÃO invente números ou eventos que não estejam nas
fontes encontradas. Se a busca não retornar nada relevante, responda com
frase_destaque explicando isso e bullets vazio — nunca invente pra preencher.
Nunca use negrito, asteriscos, cabeçalhos markdown (#, ##) ou bullets com •
dentro dos valores do JSON — texto corrido simples."""


def _sb_headers() -> dict:
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def _parse_json_final(texto: str) -> dict:
    texto = texto.strip()
    if texto.startswith("```"):
        texto = texto.strip("`").split("\n", 1)[-1]
        if texto.rstrip().endswith("```"):
            texto = texto.rstrip()[:-3]
    return json.loads(texto)


def pesquisar_e_resumir() -> tuple[dict, list[dict]]:
    """Chama o Claude com web_search, retorna (noticia_json, fontes_citadas).

    noticia_json = {"frase_destaque": str, "bullets": [{"regiao","texto"}]}
    """
    if not ANTHROPIC_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY não configurada")

    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1024,
        "tools": [_WEB_SEARCH_TOOL],
        "messages": [{"role": "user", "content": _PROMPT}],
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
    }

    r = requests.post("https://api.anthropic.com/v1/messages", json=payload, headers=headers, timeout=60)
    if not r.ok:
        raise RuntimeError(f"Erro na API Anthropic: {r.status_code} {r.text}")

    data = r.json()

    # A resposta pode ter texto intermediário ("vou pesquisar...") intercalado
    # com blocos de busca — só o ÚLTIMO bloco de texto é o JSON final pedido
    # no prompt. Citações, porém, coletamos de todos os blocos de texto.
    textos: list[str] = []
    fontes: list[dict] = []
    vistos: set[str] = set()

    for block in data.get("content", []):
        if block.get("type") == "text":
            textos.append(block.get("text", ""))
            for cit in block.get("citations") or []:
                url = cit.get("url")
                titulo = cit.get("title") or url
                if url and url not in vistos:
                    vistos.add(url)
                    fontes.append({"titulo": titulo, "url": url})

    if not textos:
        raise RuntimeError("Resposta do Claude veio vazia (sem texto final)")

    noticia = _parse_json_final(textos[-1])
    if "frase_destaque" not in noticia:
        raise RuntimeError(f"JSON final sem frase_destaque: {textos[-1][:300]}")
    noticia.setdefault("bullets", [])

    return noticia, fontes


def gravar_noticia(noticia: dict, fontes: list[dict]) -> int:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/noticias_externas",
        json={"frase_destaque": noticia["frase_destaque"], "bullets": noticia["bullets"], "fontes": fontes},
        headers={**_sb_headers(), "Content-Type": "application/json", "Prefer": "return=representation"},
        timeout=10,
    )
    if not r.ok:
        raise RuntimeError(f"Erro ao gravar noticia_externa: {r.status_code} {r.text}")
    return r.json()[0]["id"]


def _check_token() -> bool:
    r = requests.get(f"{GRAPH_API}/me", params={"access_token": IG_TOKEN, "fields": "id,name"}, timeout=10)
    if not r.ok:
        print(f"  ⚠ Token inválido ou expirado: {r.text}")
        return False
    print(f"  ✓ Token OK — conta: {r.json().get('name')}")
    return True


def _warmup(url: str) -> bool:
    try:
        r = requests.get(url, timeout=60)
        if not r.ok or "image" not in r.headers.get("content-type", ""):
            print(f"  ✗ Warm-up falhou: HTTP {r.status_code}")
            return False
        print(f"  ✓ Imagem OK ({len(r.content) // 1024}KB)")
        return True
    except Exception as e:
        print(f"  ✗ Erro no warm-up: {e}")
        return False


def postar_instagram(noticia_id: int, noticia: dict, fontes: list[dict]) -> None:
    required = {
        "INSTAGRAM_ACCESS_TOKEN": IG_TOKEN,
        "INSTAGRAM_BUSINESS_ACCOUNT_ID": IG_USER_ID,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"  ⚠ Env vars ausentes p/ Instagram: {', '.join(missing)} — pulando post")
        return

    if not _check_token():
        return

    image_url = f"{OG_API_BASE}/api/og/instagram/noticia-externa?id={noticia_id}"
    if not _warmup(image_url):
        return

    caption = noticia["frase_destaque"] + "\n\n" + "\n".join(
        f"{b['regiao']}: {b['texto']}" for b in noticia["bullets"]
    )
    if fontes:
        caption += "\n\nFontes: " + ", ".join(f["titulo"] for f in fontes[:4])

    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media",
        data={"image_url": image_url, "caption": caption, "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao criar container: {r.status_code} {r.text}")
        return
    cid = r.json().get("id")
    print(f"  ✓ Container criado: {cid}")

    time.sleep(5)
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media_publish",
        data={"creation_id": cid, "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao publicar: {r.status_code} {r.text}")
        return
    print(f"  ✓ Publicado! media_id={r.json().get('id')}")


def main():
    print("=" * 60)
    print(f"MTB Forecaster — Notícia Externa (busca real) {'[DRY RUN]' if DRY_RUN else ''}")
    print(f"Horário: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    if not ENABLED:
        print("NOTICIA_EXTERNA_ENABLED=0 — feature desligada, encerrando sem fazer nada.")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SystemExit("SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios")

    print("\n[1/3] Pesquisando na web e gerando resumo...")
    noticia, fontes = pesquisar_e_resumir()
    print(f"  ✓ {noticia['frase_destaque']}")
    for b in noticia["bullets"]:
        print(f"    • {b['regiao']}: {b['texto']}")
    print(f"  ✓ {len(fontes)} fonte(s) citada(s):")
    for f in fontes:
        print(f"    • {f['titulo']} — {f['url']}")

    if DRY_RUN:
        print("\nDRY RUN — nada foi gravado nem postado.")
        return

    print("\n[2/3] Gravando em noticias_externas...")
    noticia_id = gravar_noticia(noticia, fontes)
    print(f"  ✓ Gravado (id={noticia_id})")

    if POST_INSTAGRAM:
        print("\n[3/3] Postando no Instagram...")
        postar_instagram(noticia_id, noticia, fontes)
    else:
        print("\nNOTICIA_EXTERNA_INSTAGRAM=0 — pulando post no Instagram.")

    print("\n✅ Concluído.")


if __name__ == "__main__":
    main()
