#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
post_instagram_dica.py — Posta um card de dica no Feed do Instagram (1080x1080).

Uso:
  python scripts/post_instagram_dica.py --id 1
  DRY_RUN=1 python scripts/post_instagram_dica.py --id 3

Env vars obrigatórias:
  OG_API_BASE                    ex: https://mtbforecaster.com.br
  INSTAGRAM_ACCESS_TOKEN         token de longa duração (60 dias)
  INSTAGRAM_BUSINESS_ACCOUNT_ID  ex: 17841419948549234

Env vars opcionais:
  DRY_RUN=1   mostra o que seria postado sem postar de fato
"""

import argparse
import os
import time
from datetime import datetime, timezone

import requests

OG_API_BASE = os.environ.get("OG_API_BASE", "https://mtbforecaster.com.br").rstrip("/")
IG_TOKEN    = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
IG_USER_ID  = os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
DRY_RUN     = os.environ.get("DRY_RUN", "").strip() == "1"
GRAPH_API   = "https://graph.facebook.com/v21.0"
SITE_URL    = "mtbforecaster.com.br"

TOTAL_DICAS = 7

def auto_dica_id() -> int:
    """Rotaciona dicas 1–7 pelo dia do ano (reinicia a cada ciclo de 7 dias)."""
    day_of_year = datetime.now(timezone.utc).timetuple().tm_yday
    return (day_of_year % TOTAL_DICAS) + 1

CAPTIONS = {
    1: """\
🧭 Como ler o veredicto da trilha

✅ LIBERADO — solo em boas condições, pode pedalar
⚠️ ALERTA — solo úmido, pedale com atenção
⛔ MELHOR ESPERAR — solo enlameado ou chuva prevista

O veredicto é calculado em tempo real com dados de chuva das últimas 48h + previsão para as próximas 24h.

🔗 {site}

#mtb #mountainbike #trilha #mtbbrasil #trailconditions""",

    2: """\
🏔️ Grip e condição do solo — o que cada status significa

🏆 GRIP PERFEITO — solo ideal, máxima tração
👍 BOM GRIP — solo firme, condições favoráveis
💧 ÚMIDO — solo mole, cuidado nas curvas
🟫 LAMA — solo encharcado, evite pedalar

O grip considera chuva acumulada, tipo de solo e bioma de cada trilha.

🔗 {site}

#mtb #mountainbike #trilha #mtbbrasil #trailconditions""",

    3: """\
🌧️ Como a chuva afeta a trilha — nem toda chuva chega ao solo igual

🌿 Dossel fecha: mata fechada absorve até 50% da chuva
🏔️ Altitude importa: solo serrano drena mais devagar
⏱️ Chuva recente pesa mais que chuva de 2 dias atrás
🌫️ Garoa leve pode manter solo úmido por muito mais tempo

O modelo usa dados horários das últimas 48h para cada trilha.

🔗 {site}

#mtb #mountainbike #trilha #mtbbrasil #trailconditions""",

    4: """\
⏳ Meia-vida de secagem — quanto tempo a trilha leva para secar

☀️ Sol + vento: solo seca em 12–18h
⛅ Nublado: secagem mais lenta, 24–36h
🌫️ Garoa e frio: solo pode levar 48h ou mais
🌲 Mata fechada: secagem 30–50% mais lenta que campo aberto

O app calcula a meia-vida em tempo real para cada trilha individualmente.

🔗 {site}

#mtb #mountainbike #trilha #mtbbrasil #trailconditions""",

    5: """\
💨 Vento forte na trilha — quando começar a preocupar

🟡 Acima de 30 km/h: atenção em descidas técnicas
🟠 Acima de 50 km/h: risco de queda em trechos expostos
🔴 Rajadas acima de 70 km/h: não saia para pedalar
🌲 Mata fechada reduz o vento naturalmente

O app emite alerta automático de vento forte quando necessário.

🔗 {site}

#mtb #mountainbike #trilha #mtbbrasil #trailconditions""",

    6: """\
📱 Como usar o MTB Forecaster — 4 passos simples

🔍 Busque sua trilha por nome ou região
📊 Veja o veredicto, grip e dados de clima das próximas 24h
📍 Acesse a página da trilha para histórico e detalhes
🔔 Siga o @mtbforecaster para atualizações diárias

Mais de 130 trilhas mapeadas em todo o Brasil.

🔗 {site}

#mtb #mountainbike #trilha #mtbbrasil #trailconditions""",

    7: """\
✅ A trilha pode estar boa mesmo após a chuva — e o app explica o porquê

🌱 Solo argiloso escoa rápido em terrenos inclinados
🪨 Trilhas rochosas ficam ótimas horas após a chuva parar
📉 O acúmulo efetivo decai com o tempo — modelo em tempo real
✅ Se o veredicto é LIBERADO, o modelo diz que vale a peda

Confie nos dados, não no achismo.

🔗 {site}

#mtb #mountainbike #trilha #mtbbrasil #trailconditions""",
}


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
        return None
    cid = r.json().get("id")
    print(f"  ✓ Container criado: {cid}")
    return cid


def publish_container(creation_id: str) -> str | None:
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


def main():
    parser = argparse.ArgumentParser(description="Posta dica no Instagram Feed")
    parser.add_argument("--id", type=int, required=False, choices=list(CAPTIONS.keys()),
                        help="ID da dica (1–7). Se omitido usa DICA_ID env ou rotação automática por dia do ano.")
    args = parser.parse_args()

    # Prioridade: --id > env DICA_ID > rotação automática por dia do ano
    if args.id:
        dica_id = args.id
    elif os.environ.get("DICA_ID", "").strip():
        dica_id = int(os.environ["DICA_ID"].strip())
    else:
        dica_id = auto_dica_id()
    image_url = f"{OG_API_BASE}/api/og/instagram/dica?id={dica_id}"
    caption   = CAPTIONS[dica_id].format(site=SITE_URL)

    print("=" * 60)
    print(f"MTB Forecaster — Post Dica #{dica_id} {'[DRY RUN]' if DRY_RUN else ''}")
    print(f"Horário: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    if not DRY_RUN:
        required = {"INSTAGRAM_ACCESS_TOKEN": IG_TOKEN, "INSTAGRAM_BUSINESS_ACCOUNT_ID": IG_USER_ID}
        missing = [k for k, v in required.items() if not v]
        if missing:
            print(f"✗ Env vars ausentes: {', '.join(missing)}")
            raise SystemExit(1)

        print("\n[1/3] Verificando token...")
        if not check_token():
            raise SystemExit(1)
    else:
        print("\n[1/3] DRY RUN — pulando verificação de token")

    print(f"\n[2/3] Aquecendo card (dica #{dica_id})...")
    if DRY_RUN:
        print(f"  DRY RUN — URL: {image_url}")
        print(f"\nCaption:\n{'─'*52}\n{caption}\n{'─'*52}")
        print("\n✓ DRY RUN concluído — nada postado.")
        return

    warmup(image_url)

    print(f"\n[3/3] Postando no Feed...")
    print(f"Caption:\n{'─'*52}\n{caption}\n{'─'*52}")

    cid = create_feed_container(image_url, caption)
    if not cid:
        raise SystemExit(1)

    time.sleep(5)
    media_id = publish_container(cid)
    if not media_id:
        raise SystemExit(1)

    print(f"\n✅ Dica #{dica_id} publicada com sucesso!")
    print(f"   URL:      {image_url}")
    print(f"   media_id: {media_id}")


if __name__ == "__main__":
    main()
