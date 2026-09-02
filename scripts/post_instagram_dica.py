#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_instagram_dica.py — Posta um card de dica no Feed do Instagram (1080x1080).

Seleção round-robin via Supabase: sempre posta a dica com a data de postagem mais
antiga (ou nunca postada), garantindo que todas as dicas sejam exibidas antes de
qualquer repetição.

Uso:
  python scripts/post_instagram_dica.py
  python scripts/post_instagram_dica.py --id 5
  DRY_RUN=1 python scripts/post_instagram_dica.py

Env vars obrigatórias:
  OG_API_BASE                    ex: https://mtbforecaster.com.br
  NEXT_PUBLIC_SUPABASE_URL       ex: https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY      chave de serviço do Supabase
  INSTAGRAM_ACCESS_TOKEN         token de longa duração (60 dias)
  INSTAGRAM_BUSINESS_ACCOUNT_ID  ex: 17841419948549234

Env vars opcionais:
  DICA_ID   força uma dica específica (sobreposto por --id)
  DRY_RUN=1 mostra o que seria postado sem postar de fato
"""

import argparse
import os
import time
from datetime import datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mtb_api_logger import log_api, gravar_uso_api

OG_API_BASE    = os.environ.get("OG_API_BASE", "https://mtbforecaster.com.br").rstrip("/")
SUPABASE_URL   = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY   = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
IG_TOKEN       = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID     = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
DRY_RUN        = os.environ.get("DRY_RUN", "").strip() == "1"
GRAPH_API      = "https://graph.facebook.com/v21.0"

def _sb_headers() -> dict:
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def get_next_dica(force_id: int | None = None) -> dict:
    """
    Retorna a próxima dica a ser postada.
    - Se force_id fornecido: busca essa dica específica.
    - Senão: seleciona a dica ativa com ultima_postagem mais antiga (round-robin).
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios")

    if force_id:
        url = f"{SUPABASE_URL}/rest/v1/instagram_dicas?id=eq.{force_id}&ativo=eq.true&select=id,caption"
    else:
        url = (
            f"{SUPABASE_URL}/rest/v1/instagram_dicas"
            f"?ativo=eq.true&select=id,caption&order=ultima_postagem.asc.nullsfirst&limit=1"
        )

    r = requests.get(url, headers=_sb_headers(), timeout=10)
    if not r.ok:
        raise RuntimeError(f"Erro ao buscar dica: {r.status_code} {r.text}")

    rows = r.json()
    if not rows:
        raise RuntimeError(f"Nenhuma dica encontrada (force_id={force_id})")

    return rows[0]


def mark_posted(dica_id: int) -> None:
    """Atualiza ultima_postagem da dica para agora."""
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/instagram_dicas?id=eq.{dica_id}",
        json={"ultima_postagem": datetime.now(timezone.utc).isoformat()},
        headers={**_sb_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"},
        timeout=10,
    )
    if r.ok:
        print(f"  ✓ ultima_postagem atualizado (dica #{dica_id})")
    else:
        print(f"  ⚠ Falha ao atualizar ultima_postagem: {r.status_code} {r.text}")


def check_token() -> bool:
    r = requests.get(
        f"{GRAPH_API}/me",
        params={"access_token": IG_TOKEN, "fields": "id,name"},
        timeout=10,
    )
    if not r.ok:
        print(f"  ⚠ Token inválido ou expirado: {r.text}")
        log_api("instagram", "me", sucesso=0, falhas=1)
        return False
    data = r.json()
    print(f"  ✓ Token OK — conta: {data.get('name')} ({data.get('id')})")
    log_api("instagram", "me", sucesso=1)
    return True


def warmup(url: str) -> bool:
    print(f"  Warm-up: {url}")
    try:
        r = requests.get(url, timeout=60)
        if not r.ok:
            print(f"  ✗ HTTP {r.status_code}")
            return False
        if "image" not in r.headers.get("content-type", ""):
            print(f"  ✗ Content-type inesperado: {r.headers.get('content-type')}")
            return False
        print(f"  ✓ Imagem OK ({len(r.content) // 1024}KB)")
        return True
    except Exception as e:
        print(f"  ✗ Erro: {e}")
        return False


def create_feed_container(image_url: str, caption: str) -> str | None:
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media",
        data={"image_url": image_url, "caption": caption, "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao criar container: {r.status_code} {r.text}")
        log_api("instagram", "media", sucesso=0, falhas=1)
        return None
    cid = r.json().get("id")
    print(f"  ✓ Container criado: {cid}")
    log_api("instagram", "media", sucesso=1)
    return cid


def publish_container(creation_id: str) -> str | None:
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media_publish",
        data={"creation_id": creation_id, "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao publicar: {r.status_code} {r.text}")
        log_api("instagram", "media_publish", sucesso=0, falhas=1)
        return None
    media_id = r.json().get("id")
    print(f"  ✓ Publicado! media_id={media_id}")
    log_api("instagram", "media_publish", sucesso=1)
    return media_id


def main():
    try:
        _main()
    finally:
        gravar_uso_api()


def _main():
    parser = argparse.ArgumentParser(description="Posta dica no Instagram Feed (round-robin via Supabase)")
    parser.add_argument("--id", type=int, required=False,
                        help="ID da dica (1–20). Se omitido usa DICA_ID env ou round-robin automático.")
    args = parser.parse_args()

    # Prioridade: --id > env DICA_ID > round-robin
    force_id: int | None = None
    if args.id:
        force_id = args.id
    elif os.environ.get("DICA_ID", "").strip():
        force_id = int(os.environ["DICA_ID"].strip())

    print("=" * 60)
    print(f"MTB Forecaster — Post Dica {'[DRY RUN]' if DRY_RUN else ''}")
    print(f"Horário: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    print(f"\n[1/4] Buscando próxima dica{f' (forçado id={force_id})' if force_id else ' (round-robin)'}...")
    dica = get_next_dica(force_id)
    dica_id = dica["id"]
    caption = dica["caption"]
    image_url = f"{OG_API_BASE}/api/og/instagram/dica?id={dica_id}"
    print(f"  ✓ Dica #{dica_id} selecionada")

    if not DRY_RUN:
        required = {
            "INSTAGRAM_ACCESS_TOKEN": IG_TOKEN,
            "INSTAGRAM_BUSINESS_ACCOUNT_ID": IG_USER_ID,
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            print(f"✗ Env vars ausentes: {', '.join(missing)}")
            raise SystemExit(1)

        print("\n[2/4] Verificando token...")
        if not check_token():
            raise SystemExit(1)
    else:
        print("\n[2/4] DRY RUN — pulando verificação de token")

    print(f"\n[3/4] Aquecendo card (dica #{dica_id})...")
    if DRY_RUN:
        print(f"  DRY RUN — URL: {image_url}")
        print(f"\nCaption:\n{'─'*52}\n{caption}\n{'─'*52}")
        print("\n✓ DRY RUN concluído — nada postado.")
        return

    warmup(image_url)

    print(f"\n[4/4] Postando no Feed...")
    print(f"Caption:\n{'─'*52}\n{caption}\n{'─'*52}")

    cid = create_feed_container(image_url, caption)
    if not cid:
        raise SystemExit(1)

    time.sleep(5)
    media_id = publish_container(cid)
    if not media_id:
        raise SystemExit(1)

    mark_posted(dica_id)

    print(f"\n✅ Dica #{dica_id} publicada com sucesso!")
    print(f"   URL:      {image_url}")
    print(f"   media_id: {media_id}")


if __name__ == "__main__":
    main()
