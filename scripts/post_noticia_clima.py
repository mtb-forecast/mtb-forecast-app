#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_noticia_clima.py — Gera uma "visão geral" agregada das condições de trilha
no Brasil (estilo resumo de IA) a partir do estado atual de `condicoes`, e
publica no feed interno do app e no Feed do Instagram.

Peça INDEPENDENTE do pipeline principal (mtb-forecast.py): lê o resultado já
gravado em `condicoes` (upsert, 1 linha por trilha) — não participa da geração
do forecast. Toda a saída fica isolada na tabela `noticias_clima`.

Como desligar no futuro (qualquer uma destas opções basta):
  - Desativar o workflow noticia-clima.yml na aba Actions do GitHub (sem tocar
    em código nem no workflow principal do pipeline).
  - NOTICIA_CLIMA_ENABLED=0            desliga a geração inteira (nada roda).
  - NOTICIA_CLIMA_INSTAGRAM=0          gera e grava no feed do app, mas não
                                        posta no Instagram.
  - Ocultar no feed do app: flag NOTICIA_CLIMA_ATIVO em lib/feed.ts (front-end),
    sem precisar mexer neste script.

Uso:
  python scripts/post_noticia_clima.py
  DRY_RUN=1 python scripts/post_noticia_clima.py

Env vars obrigatórias:
  SUPABASE_URL               ex: https://xxx.supabase.co
  SUPABASE_SERVICE_KEY       chave de serviço do Supabase
  ANTHROPIC_API_KEY          para gerar o texto da visão geral

Env vars opcionais (Instagram):
  OG_API_BASE                    ex: https://mtbforecaster.com.br
  INSTAGRAM_ACCESS_TOKEN
  INSTAGRAM_BUSINESS_ACCOUNT_ID

Kill switches:
  NOTICIA_CLIMA_ENABLED=0        pula a execução inteira
  NOTICIA_CLIMA_INSTAGRAM=0      não posta no Instagram (só grava no banco)
  DRY_RUN=1                      mostra o que seria gerado/postado sem gravar nem postar
"""

import json
import os
import time
from datetime import datetime, timezone

import requests

SUPABASE_URL     = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY     = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_KEY    = os.environ.get("ANTHROPIC_API_KEY", "")
OG_API_BASE      = os.environ.get("OG_API_BASE", "https://mtbforecaster.com.br").rstrip("/")
IG_TOKEN         = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID       = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
GRAPH_API        = "https://graph.facebook.com/v21.0"

ENABLED          = os.environ.get("NOTICIA_CLIMA_ENABLED", "1").strip() != "0"
POST_INSTAGRAM   = os.environ.get("NOTICIA_CLIMA_INSTAGRAM", "1").strip() != "0"
DRY_RUN          = os.environ.get("DRY_RUN", "").strip() == "1"

# Mesmo mapeamento UF -> macro-região usado em mtb-forecast.py (_UF_MACRO_REGIAO).
# Duplicado de propósito: este script é independente do pipeline principal e não
# deve importar seu módulo (que tem efeitos colaterais pesados no import).
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
    return _UF_MACRO_REGIAO.get((uf or "").upper().strip(), "DEFAULT")


def _bucket_veredicto(v: str | None) -> str:
    """Mesma prioridade EVITAR > ALERTA > LIBERADO usada em TrilhaCard.tsx."""
    u = (v or "").upper()
    if "ESPERAR" in u or "EVITAR" in u:
        return "EVITAR"
    if "ALERTA" in u:
        return "ALERTA"
    if "LIBERADO" in u:
        return "LIBERADO"
    return "OUTRO"


def _sb_headers() -> dict:
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def _fetch_condicoes() -> list[dict]:
    url = (
        f"{SUPABASE_URL}/rest/v1/condicoes"
        "?select=trilha_id,veredicto_12h,veredicto,acumulo_ef,rajada_max_kmh,temp_media_c"
    )
    r = requests.get(url, headers=_sb_headers(), timeout=20)
    if not r.ok:
        raise RuntimeError(f"Erro ao buscar condicoes: {r.status_code} {r.text}")
    return r.json()


def _fetch_trilhas() -> dict[str, dict]:
    url = f"{SUPABASE_URL}/rest/v1/trilhas?aprovada=eq.true&select=id,name,regiao"
    r = requests.get(url, headers=_sb_headers(), timeout=20)
    if not r.ok:
        raise RuntimeError(f"Erro ao buscar trilhas: {r.status_code} {r.text}")
    return {t["id"]: t for t in r.json()}


def montar_estatisticas() -> dict:
    """Agrega condicoes + trilhas por macro-região."""
    condicoes = _fetch_condicoes()
    trilhas = _fetch_trilhas()

    por_macro: dict[str, dict] = {}

    for c in condicoes:
        trilha = trilhas.get(c.get("trilha_id"))
        if not trilha:
            continue
        macro = _macro_regiao(trilha.get("regiao") or "")
        bucket = _bucket_veredicto(c.get("veredicto_12h") or c.get("veredicto"))

        stat = por_macro.setdefault(macro, {
            "total": 0, "LIBERADO": 0, "ALERTA": 0, "EVITAR": 0, "OUTRO": 0,
            "chuva_max": {"trilha": None, "mm": 0.0},
            "rajada_max": {"trilha": None, "kmh": 0.0},
        })
        stat["total"] += 1
        stat[bucket] += 1

        acumulo = c.get("acumulo_ef") or 0
        if acumulo > stat["chuva_max"]["mm"]:
            stat["chuva_max"] = {"trilha": trilha["name"], "mm": round(acumulo, 1)}

        rajada = c.get("rajada_max_kmh") or 0
        if rajada > stat["rajada_max"]["kmh"]:
            stat["rajada_max"] = {"trilha": trilha["name"], "kmh": round(rajada, 1)}

    return por_macro


def _build_prompt(stats: dict) -> str:
    return f"""Você escreve para o feed do app MTB Forecaster, um serviço de previsão de
condições de trilha de mountain bike no Brasil. Gere uma "visão geral" curta, no
estilo de resumo jornalístico (como um card de notícia), SOMENTE com base nos
dados agregados abaixo — não invente números, clima ou eventos que não estejam
nos dados. Se uma região não aparece nos dados, não fale dela.

Dados agregados por macro-região (contagem de trilhas por veredicto, maior
acúmulo de chuva efetiva em mm, maior rajada de vento em km/h):
{json.dumps(stats, ensure_ascii=False, indent=2)}

Responda APENAS com um JSON válido (sem markdown, sem texto fora do JSON) no
formato exato:
{{
  "frase_destaque": "1 frase (até 220 caracteres) resumindo o contraste regional mais notável entre as trilhas monitoradas hoje",
  "bullets": [
    {{"regiao": "NOME DA MACRO-REGIÃO", "texto": "1 frase curta (até 140 caracteres) sobre a condição predominante das trilhas nessa região"}}
  ]
}}

Inclua no máximo 4 bullets, priorizando as regiões com dado mais relevante
(mais trilhas em EVITAR, maior chuva ou maior rajada). Tom direto, sem
alarmismo, sem emojis, sem markdown."""


def gerar_texto_claude(stats: dict) -> dict:
    if not ANTHROPIC_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY não configurada")

    prompt = _build_prompt(stats)
    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}],
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
    }

    last_err = None
    for attempt in range(3):
        try:
            r = requests.post(f"https://api.anthropic.com/v1/messages", json=payload, headers=headers, timeout=30)
            if not r.ok:
                last_err = f"HTTP {r.status_code}: {r.text}"
                if r.status_code == 400:
                    break
                time.sleep(2 ** attempt)
                continue
            data = r.json()
            texto = data["content"][0]["text"].strip()
            # remove eventuais cercas de markdown que o modelo insista em usar
            if texto.startswith("```"):
                texto = texto.strip("`").split("\n", 1)[-1]
                if texto.rstrip().endswith("```"):
                    texto = texto.rstrip()[:-3]
            return json.loads(texto)
        except Exception as exc:
            last_err = str(exc)
            time.sleep(2 ** attempt)

    raise RuntimeError(f"Falha ao gerar texto via Claude: {last_err}")


def gravar_noticia(noticia: dict) -> int:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/noticias_clima",
        json={"frase_destaque": noticia["frase_destaque"], "bullets": noticia["bullets"]},
        headers={**_sb_headers(), "Content-Type": "application/json", "Prefer": "return=representation"},
        timeout=10,
    )
    if not r.ok:
        raise RuntimeError(f"Erro ao gravar noticia_clima: {r.status_code} {r.text}")
    return r.json()[0]["id"]


def _check_token() -> bool:
    r = requests.get(f"{GRAPH_API}/me", params={"access_token": IG_TOKEN, "fields": "id,name"}, timeout=10)
    if not r.ok:
        print(f"  ⚠ Token inválido ou expirado: {r.text}")
        return False
    data = r.json()
    print(f"  ✓ Token OK — conta: {data.get('name')} ({data.get('id')})")
    return True


def _warmup(url: str) -> bool:
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


def _create_feed_container(image_url: str, caption: str) -> str | None:
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


def _publish_container(creation_id: str) -> str | None:
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


def postar_instagram(noticia_id: int, noticia: dict) -> None:
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

    image_url = f"{OG_API_BASE}/api/og/instagram/noticia?id={noticia_id}"
    if not _warmup(image_url):
        return

    caption = noticia["frase_destaque"] + "\n\n" + "\n".join(
        f"{b['regiao']}: {b['texto']}" for b in noticia["bullets"]
    )
    cid = _create_feed_container(image_url, caption)
    if not cid:
        return
    time.sleep(5)
    _publish_container(cid)


def main():
    print("=" * 60)
    print(f"MTB Forecaster — Notícia Climática {'[DRY RUN]' if DRY_RUN else ''}")
    print(f"Horário: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    if not ENABLED:
        print("NOTICIA_CLIMA_ENABLED=0 — feature desligada, encerrando sem fazer nada.")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SystemExit("SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios")

    print("\n[1/3] Agregando condicoes por macro-região...")
    stats = montar_estatisticas()
    if not stats:
        print("  ⚠ Nenhuma condição encontrada — encerrando.")
        return
    print(f"  ✓ {len(stats)} macro-região(ões) com dados")

    print("\n[2/3] Gerando texto via Claude...")
    noticia = gerar_texto_claude(stats)
    print(f"  ✓ {noticia['frase_destaque']}")
    for b in noticia["bullets"]:
        print(f"    • {b['regiao']}: {b['texto']}")

    if DRY_RUN:
        print("\nDRY RUN — nada foi gravado nem postado.")
        return

    print("\n[3/3] Gravando em noticias_clima...")
    noticia_id = gravar_noticia(noticia)
    print(f"  ✓ Gravado (id={noticia_id})")

    if POST_INSTAGRAM:
        print("\nPostando no Instagram...")
        postar_instagram(noticia_id, noticia)
    else:
        print("\nNOTICIA_CLIMA_INSTAGRAM=0 — pulando post no Instagram.")

    print("\n✅ Concluído.")


if __name__ == "__main__":
    main()
