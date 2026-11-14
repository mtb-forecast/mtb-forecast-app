#!/usr/bin/env python3
"""
setup_telegram_webhook.py — Registra o webhook do bot do Telegram.

Rodar localmente (uma vez, ou sempre que o token for rotacionado). Não existe
mais como rota pública — era assim que o token antigo vazou (hardcoded em
app/api/telegram/setup/route.ts, num repositório público).

Env vars obrigatórias:
  TELEGRAM_BOT_TOKEN        token atual do bot (gerado no @BotFather)
  TELEGRAM_WEBHOOK_SECRET   secret_token que o endpoint /api/telegram/webhook
                            exige no header X-Telegram-Bot-Api-Secret-Token
                            (mesmo valor configurado no Vercel)
"""
import os
import sys
import urllib.request
import urllib.parse

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
WEBHOOK_URL = "https://www.mtbforecaster.com.br/api/telegram/webhook"

if not TOKEN or not SECRET:
    print("Defina TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET no ambiente antes de rodar.")
    sys.exit(1)

params = urllib.parse.urlencode({"url": WEBHOOK_URL, "secret_token": SECRET})
url = f"https://api.telegram.org/bot{TOKEN}/setWebhook?{params}"

with urllib.request.urlopen(url, timeout=10) as resp:
    print(resp.read().decode())
