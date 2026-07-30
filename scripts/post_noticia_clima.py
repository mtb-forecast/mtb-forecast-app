#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_noticia_clima.py — Gera uma "visão geral" agregada das condições de trilha
no Brasil (estilo resumo de IA) a partir do estado atual de `condicoes`, e
publica no feed interno do app e no Stories do Instagram.

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


def _fetch_pumptracks() -> dict[str, dict]:
    url = f"{SUPABASE_URL}/rest/v1/trilhas_pumptrack?select=id,nome,uf"
    r = requests.get(url, headers=_sb_headers(), timeout=20)
    if not r.ok:
        raise RuntimeError(f"Erro ao buscar trilhas_pumptrack: {r.status_code} {r.text}")
    return {p["id"]: p for p in r.json()}


def _fetch_condicoes_pumptrack() -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/condicoes_pumptrack?select=pumptrack_id,rain_mm,wind_kmh"
    r = requests.get(url, headers=_sb_headers(), timeout=20)
    if not r.ok:
        raise RuntimeError(f"Erro ao buscar condicoes_pumptrack: {r.status_code} {r.text}")
    return r.json()


def montar_estatisticas() -> dict:
    """Agrega condicoes + trilhas por macro-região."""
    condicoes = _fetch_condicoes()
    trilhas = _fetch_trilhas()

    por_macro: dict[str, dict] = {}

    for c in condicoes:
        trilha = trilhas.get(c.get("trilha_id"))
        if not trilha:
            continue
        # Trilhas nunca favoritadas ficam com todos os campos zerados no upsert
        # (ver gravar_sem_favorito_bulk) — acumulo_ef é None nesse caso. Excluir
        # da agregação: não são condições reais, são placeholder.
        if c.get("acumulo_ef") is None:
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

    # Pump tracks: piso duro, sem modelo de solo/veredicto (condicoes_pumptrack
    # só tem previsão de chuva/vento) — entram como métrica de clima à parte,
    # nunca contam pro bucket LIBERADO/ALERTA/EVITAR.
    pumptracks = _fetch_pumptracks()
    for c in _fetch_condicoes_pumptrack():
        pt = pumptracks.get(c.get("pumptrack_id"))
        if not pt:
            continue
        macro = _macro_regiao(pt.get("uf") or "")
        stat = por_macro.setdefault(macro, {
            "total": 0, "LIBERADO": 0, "ALERTA": 0, "EVITAR": 0, "OUTRO": 0,
            "chuva_max": {"trilha": None, "mm": 0.0},
            "rajada_max": {"trilha": None, "kmh": 0.0},
        })
        pt_stat = stat.setdefault("pumptrack", {
            "chuva_max": {"nome": None, "mm": 0.0},
            "vento_max": {"nome": None, "kmh": 0.0},
        })

        chuva = c.get("rain_mm") or 0
        if chuva > pt_stat["chuva_max"]["mm"]:
            pt_stat["chuva_max"] = {"nome": pt["nome"], "mm": round(chuva, 1)}

        vento = c.get("wind_kmh") or 0
        if vento > pt_stat["vento_max"]["kmh"]:
            pt_stat["vento_max"] = {"nome": pt["nome"], "kmh": round(vento, 1)}

    return por_macro


def _sanitizar_stats_para_prompt(stats: dict) -> dict:
    """Remove o total por região antes de mandar pro Claude — a notícia pode
    citar contagem absoluta por veredicto (ex: "37 trilhas em DROP LIBERADO"),
    mas nunca o denominador. Expor "de 39 monitoradas" revela que a cobertura
    de trilhas com dado real ainda é parcial, o que passa uma imagem de menos
    robustez do que o produto tem."""
    limpo = {}
    for macro, s in stats.items():
        s2 = dict(s)
        sem_trilha_de_terra = s2.get("total", 0) == 0
        s2.pop("total", None)
        if sem_trilha_de_terra:
            # Região só tem dado de pump track — remove as chaves de trilha de
            # terra zeradas (LIBERADO/ALERTA/EVITAR/OUTRO/chuva_max/rajada_max)
            # pra não sugerir ao modelo que existem trilhas de terra ali.
            for chave in ("LIBERADO", "ALERTA", "EVITAR", "OUTRO", "chuva_max", "rajada_max"):
                s2.pop(chave, None)
        if "pumptrack" in s2:
            pt = dict(s2["pumptrack"])
            if pt.get("chuva_max", {}).get("nome") is None:
                pt.pop("chuva_max", None)
            if pt.get("vento_max", {}).get("nome") is None:
                pt.pop("vento_max", None)
            if pt:
                s2["pumptrack"] = pt
            else:
                s2.pop("pumptrack", None)
        limpo[macro] = s2
    return limpo


def _build_prompt(stats: dict) -> str:
    stats_prompt = _sanitizar_stats_para_prompt(stats)
    return f"""Você escreve para o feed do app MTB Forecaster, um serviço de previsão de
condições de trilha de mountain bike no Brasil (trilhas de terra + pump tracks).
Gere uma "visão geral" curta, no estilo de resumo jornalístico (como um card de
notícia), SOMENTE com base nos dados agregados abaixo — não invente números,
clima ou eventos que não estejam nos dados. Se uma região não aparece nos
dados, não fale dela.

Dados agregados por macro-região (contexto — a contagem por veredicto NÃO
deve aparecer no seu texto, ver regra abaixo):
- LIBERADO/ALERTA/EVITAR/OUTRO: contagem de trilhas de terra por veredicto
- chuva_max / rajada_max: maior acúmulo de chuva efetiva (mm) / rajada de
  vento (km/h) entre as trilhas de terra dessa região
- pumptrack (quando presente): dado de PUMP TRACK — piso duro, sem modelo de
  secagem de solo, então NUNCA tem veredicto. É só previsão de chuva/vento.

{json.dumps(stats_prompt, ensure_ascii=False, indent=2)}

REGRA CRÍTICA — NÃO cite números de trilhas por veredicto (não escreva "37
trilhas em DROP LIBERADO", "2 em alerta", "3 liberadas" etc.). Esses números
são exibidos separadamente pelo sistema, de forma exata — se você os citar em
texto livre, o risco de errar a contagem ou confundir ALERTA com EVITAR é
alto. Sua frase e seus bullets devem descrever só o CLIMA (chuva, vento,
temperatura) e a tendência geral (ex: "tempo seco predomina", "chuva
concentrada no Sul"), nunca contagens de trilha.

Também NUNCA cite ou insinue o total/denominador de trilhas monitoradas (ex:
"de 39 trilhas", "do total de", "das X monitoradas"), nem quantos pump tracks
existem numa região — esse número não existe nos dados de propósito.

Responda APENAS com um JSON válido (sem markdown, sem texto fora do JSON) no
formato exato:
{{
  "frase_destaque": "1 frase (até 220 caracteres) resumindo o contraste climático regional mais notável hoje — só clima, sem contagem de trilhas",
  "bullets": [
    {{"regiao": "NOME DA MACRO-REGIÃO", "texto": "1 frase curta (até 120 caracteres) só sobre o clima dessa região (chuva/vento/temperatura) — sem contagem de trilhas"}}
  ]
}}

Inclua no máximo 4 bullets, priorizando as regiões com dado mais relevante
(maior chuva, maior rajada, ou pior situação de veredicto). Tom direto, sem
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


def _anexar_contagens(noticia: dict, stats: dict) -> dict:
    """Anexa contagem exata de veredicto (liberado/alerta/evitar) a cada
    bullet, calculada aqui em Python a partir de `stats` — nunca pelo Claude.
    Mantém LIBERADO e "DROP LIBERADO - Veja os alertas" (bucket ALERTA)
    como categorias sempre separadas, com o mesmo esquema de cores do
    TrilhaCard (verde/âmbar/vermelho), exibidas como badge no card, não
    dependendo do texto livre do modelo pra não errar a contagem."""
    for b in noticia.get("bullets", []):
        chave = (b.get("regiao") or "").strip().upper()
        s = stats.get(chave, {})
        b["liberado"] = s.get("LIBERADO", 0)
        b["alerta"] = s.get("ALERTA", 0)
        b["evitar"] = s.get("EVITAR", 0)
    return noticia


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


def _create_stories_container(image_url: str) -> str | None:
    # Stories não aceita "caption" na Graph API (diferente de post de Feed) —
    # o texto precisa estar todo dentro da imagem, que já é o caso aqui.
    r = requests.post(
        f"{GRAPH_API}/{IG_USER_ID}/media",
        data={"image_url": image_url, "media_type": "STORIES", "access_token": IG_TOKEN},
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


def postar_instagram(noticia_id: int) -> None:
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

    cid = _create_stories_container(image_url)
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
    noticia = _anexar_contagens(noticia, stats)
    print(f"  ✓ {noticia['frase_destaque']}")
    for b in noticia["bullets"]:
        print(f"    • {b['regiao']}: {b['texto']} (liberado={b['liberado']} alerta={b['alerta']} evitar={b['evitar']})")

    if DRY_RUN:
        print("\nDRY RUN — nada foi gravado nem postado.")
        return

    print("\n[3/3] Gravando em noticias_clima...")
    noticia_id = gravar_noticia(noticia)
    print(f"  ✓ Gravado (id={noticia_id})")

    if POST_INSTAGRAM:
        print("\nPostando no Instagram...")
        postar_instagram(noticia_id)
    else:
        print("\nNOTICIA_CLIMA_INSTAGRAM=0 — pulando post no Instagram.")

    print("\n✅ Concluído.")


if __name__ == "__main__":
    main()
