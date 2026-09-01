#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_noticia_externa.py — Pesquisa notícias reais de clima extremo no Brasil
(via Tavily Search API) e publica um resumo com as fontes de verdade
retornadas pela busca, no feed do app e no Stories do Instagram.

Peça INDEPENDENTE de noticias_clima (que resume só dados das nossas trilhas).
Aqui o conteúdo vem de uma busca real na web — as fontes exibidas ("fontes")
são exatamente os resultados que a Tavily retornou, nunca inventadas.
NUNCA adicionar selo de fonte que não veio de um resultado real da busca.

Arquitetura (ago/2026): busca (Tavily) e resumo (LLM) são etapas separadas —
diferente do desenho anterior, que usava a tool web_search do Claude para
fazer as duas coisas numa chamada só. Resumo tenta DeepSeek primeiro (mais
barato), com Claude como fallback só de texto (sem tool de busca, já que as
fontes vêm prontas da Tavily) — mesmo padrão de post_noticia_clima.py.

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
  SUPABASE_URL, SUPABASE_SERVICE_KEY, TAVILY_API_KEY

Env vars opcionais:
  DEEPSEEK_API_KEY   provider primário do resumo (recomendado)
  ANTHROPIC_API_KEY  fallback do resumo se DeepSeek falhar/não configurada
  OG_API_BASE, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID
"""

import json
import os
import time
from datetime import datetime, timezone

import requests

SUPABASE_URL   = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY   = os.environ.get("SUPABASE_SERVICE_KEY", "")
TAVILY_KEY     = os.environ.get("TAVILY_API_KEY", "")
DEEPSEEK_KEY   = os.environ.get("DEEPSEEK_API_KEY", "")
ANTHROPIC_KEY  = os.environ.get("ANTHROPIC_API_KEY", "")
OG_API_BASE    = os.environ.get("OG_API_BASE", "https://mtbforecaster.com.br").rstrip("/")
IG_TOKEN       = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID     = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
GRAPH_API      = "https://graph.facebook.com/v21.0"

ENABLED        = os.environ.get("NOTICIA_EXTERNA_ENABLED", "1").strip() != "0"
POST_INSTAGRAM = os.environ.get("NOTICIA_EXTERNA_INSTAGRAM", "1").strip() != "0"
DRY_RUN        = os.environ.get("DRY_RUN", "").strip() == "1"

_TAVILY_QUERY = (
    "clima extremo Brasil hoje: seca, temporal, chuva forte, onda de calor, "
    "alerta meteorológico regional"
)


def _sb_headers() -> dict:
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def _parse_json_final(texto: str) -> dict:
    texto = texto.strip()
    if texto.startswith("```"):
        texto = texto.strip("`").split("\n", 1)[-1]
        if texto.rstrip().endswith("```"):
            texto = texto.rstrip()[:-3]
        texto = texto.strip()
    # O modelo às vezes emenda uma frase antes/depois do JSON mesmo com o
    # prompt pedindo "APENAS JSON" — extrai do primeiro '{' ao último '}'
    # em vez de assumir que a string inteira é o objeto.
    inicio, fim = texto.find("{"), texto.rfind("}")
    if inicio == -1 or fim == -1 or fim < inicio:
        raise RuntimeError(f"Nenhum objeto JSON encontrado no texto final: {texto[:300]!r}")
    return json.loads(texto[inicio:fim + 1])


def buscar_fontes() -> list[dict]:
    """Busca real na web via Tavily (topic=news, últimas 24h). Retorna lista
    de {"titulo", "url", "resumo"} — nunca inventado, sempre resultado bruto
    da API."""
    if not TAVILY_KEY:
        raise RuntimeError("TAVILY_API_KEY não configurada")

    payload = {
        "api_key": TAVILY_KEY,
        "query": _TAVILY_QUERY,
        "topic": "news",
        "search_depth": "basic",  # 1 crédito/busca — suficiente pra manchete, mais barato que "advanced"
        "days": 1,
        "max_results": 8,
        "include_answer": False,
        "country": "brazil",
    }
    r = requests.post("https://api.tavily.com/search", json=payload, timeout=30)
    if not r.ok:
        raise RuntimeError(f"Erro na API Tavily: {r.status_code} {r.text}")

    fontes = []
    for item in r.json().get("results", []):
        url = item.get("url")
        if not url:
            continue
        fontes.append({
            "titulo": item.get("title") or url,
            "url": url,
            "resumo": (item.get("content") or "")[:600],
        })
    return fontes


def _build_prompt_resumo(fontes: list[dict]) -> str:
    trechos = "\n\n".join(
        f"[{i+1}] {f['titulo']}\nURL: {f['url']}\nTrecho: {f['resumo']}"
        for i, f in enumerate(fontes)
    )
    return f"""Você é editor de notícias climáticas do app MTB Forecaster. Abaixo estão
trechos reais de uma busca na web sobre clima extremo no Brasil hoje:

{trechos or '(nenhum resultado retornado pela busca)'}

Com base SOMENTE nesses trechos — NUNCA invente números, locais ou eventos que
não estejam neles —, escreva um resumo estilo manchete de clima extremo no
país. Responda APENAS com um JSON válido (sem markdown, sem cercas ```, sem
texto fora do JSON) no formato exato:
{{
  "frase_destaque": "1 frase (até 220 caracteres) resumindo o contraste climático mais notável no país hoje, tom direto de manchete",
  "bullets": [
    {{"regiao": "NOME DA REGIÃO OU TEMA", "texto": "1 frase curta (até 140 caracteres) baseada só nos trechos acima", "fontes_indices": [1]}}
  ]
}}

fontes_indices = lista dos números entre colchetes ([n]) dos trechos acima que
embasam aquele bullet. Inclua no máximo 4 bullets. Se nenhum trecho tiver
conteúdo relevante sobre clima extremo, responda com frase_destaque explicando
isso e bullets vazio — nunca invente pra preencher. Nunca use negrito,
asteriscos, cabeçalhos markdown (#, ##) ou bullets com • dentro dos valores do
JSON — texto corrido simples."""


def _montar_fontes_citadas(noticia: dict, fontes: list[dict]) -> list[dict]:
    usados: set[int] = set()
    for b in noticia.get("bullets", []):
        for idx in (b.pop("fontes_indices", None) or []):
            if isinstance(idx, int) and 1 <= idx <= len(fontes):
                usados.add(idx)
    return [{"titulo": fontes[i - 1]["titulo"], "url": fontes[i - 1]["url"]} for i in sorted(usados)]


def _resumo_via_deepseek(fontes: list[dict]) -> dict | None:
    """DeepSeek Chat — provider primário do resumo. Retorna None se falhar,
    acionando o fallback para Claude."""
    if not DEEPSEEK_KEY:
        return None

    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": _build_prompt_resumo(fontes)}],
        "max_tokens": 700,
        "temperature": 0.5,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_KEY}",
    }

    for attempt in range(2):
        try:
            r = requests.post("https://api.deepseek.com/chat/completions", json=payload, headers=headers, timeout=45)
            if not r.ok:
                print(f"[DeepSeek Notícia Externa] HTTP {r.status_code} (tentativa {attempt+1}): {r.text}")
                if r.status_code in (400, 402):
                    return None
                time.sleep(2)
                continue
            texto = r.json()["choices"][0]["message"]["content"]
            noticia = _parse_json_final(texto)
            if "frase_destaque" not in noticia:
                print(f"[DeepSeek Notícia Externa] JSON sem frase_destaque: {texto[:300]}")
                return None
            noticia.setdefault("bullets", [])
            print("[DeepSeek Notícia Externa] OK")
            return noticia
        except Exception as exc:
            print(f"[DeepSeek Notícia Externa] Erro (tentativa {attempt+1}): {exc}")
            time.sleep(2)
    return None


def _resumo_via_claude(fontes: list[dict]) -> dict:
    """Fallback: só gera texto a partir das fontes já buscadas — sem tool de
    busca, que é o item mais caro do fluxo antigo."""
    if not ANTHROPIC_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY não configurada")

    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 700,
        "messages": [{"role": "user", "content": _build_prompt_resumo(fontes)}],
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
    }

    last_err = None
    for attempt in range(3):
        try:
            r = requests.post("https://api.anthropic.com/v1/messages", json=payload, headers=headers, timeout=45)
            if not r.ok:
                last_err = f"HTTP {r.status_code}: {r.text}"
                if r.status_code == 400:
                    break
                time.sleep(2 ** attempt)
                continue
            texto = r.json()["content"][0]["text"]
            noticia = _parse_json_final(texto)
            if "frase_destaque" not in noticia:
                raise RuntimeError(f"JSON sem frase_destaque: {texto[:300]}")
            noticia.setdefault("bullets", [])
            return noticia
        except Exception as exc:
            last_err = str(exc)
            time.sleep(2 ** attempt)

    raise RuntimeError(f"Falha ao gerar resumo via Claude: {last_err}")


def buscar_e_resumir() -> tuple[dict, list[dict]]:
    """Busca fontes reais (Tavily) e resume (DeepSeek, fallback Claude).

    Retorna (noticia_json, fontes_citadas). noticia_json =
    {"frase_destaque": str, "bullets": [{"regiao","texto"}]}
    """
    fontes = buscar_fontes()

    noticia = _resumo_via_deepseek(fontes)
    if noticia is None:
        print("[Notícia Externa] DeepSeek indisponível — usando Claude como fallback")
        noticia = _resumo_via_claude(fontes)

    fontes_citadas = _montar_fontes_citadas(noticia, fontes)
    return noticia, fontes_citadas


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


def postar_instagram(noticia_id: int) -> bool:
    required = {
        "INSTAGRAM_ACCESS_TOKEN": IG_TOKEN,
        "INSTAGRAM_BUSINESS_ACCOUNT_ID": IG_USER_ID,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"  ⚠ Env vars ausentes p/ Instagram: {', '.join(missing)} — pulando post")
        return False

    if not _check_token():
        return False

    image_url = f"{OG_API_BASE}/api/og/instagram/noticia-externa?id={noticia_id}"
    if not _warmup(image_url):
        return False

    # Stories não aceita "caption" na Graph API — o texto e as fontes já vão
    # todos dentro da imagem (renderizados na rota OG).
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media",
        data={"image_url": image_url, "media_type": "STORIES", "access_token": IG_TOKEN},
        timeout=30,
    )
    if not r.ok:
        print(f"  ✗ Erro ao criar container: {r.status_code} {r.text}")
        return False
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
        return False
    print(f"  ✓ Publicado! media_id={r.json().get('id')}")
    return True


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
    noticia, fontes = buscar_e_resumir()
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
        ok = postar_instagram(noticia_id)
        if not ok:
            # Notícia já está gravada e visível no feed do app — só o post no
            # Instagram falhou. Falha o workflow (em vez de sair 0 em silêncio)
            # para ficar visível na aba Actions do GitHub.
            raise SystemExit(
                f"✗ Notícia externa gravada (id={noticia_id}), mas o post no "
                "Instagram falhou — ver mensagens acima para a causa."
            )
    else:
        print("\nNOTICIA_EXTERNA_INSTAGRAM=0 — pulando post no Instagram.")

    print("\n✅ Concluído.")


if __name__ == "__main__":
    main()
