#!/usr/bin/env python3
"""
refresh_instagram_token.py — Renova o token de longa duração do Instagram.

A Meta permite renovar um long-lived token (60 dias) chamando o mesmo
endpoint de troca com o token atual. O novo token recebe mais 60 dias.

Env vars obrigatórias:
  META_APP_ID              ID do app no Meta Developer Dashboard
  META_APP_SECRET          Secret do app
  INSTAGRAM_ACCESS_TOKEN   Token atual (pode estar próximo de expirar)

Saída:
  Imprime NEW_TOKEN=<valor> na última linha se a renovação for bem-sucedida.
  Sai com código 1 em caso de erro.
"""
import datetime
import os
import sys

import requests

APP_ID    = os.environ.get("META_APP_ID", "").strip()
APP_SECRET= os.environ.get("META_APP_SECRET", "").strip()
IG_TOKEN  = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "").strip()

if not all([APP_ID, APP_SECRET, IG_TOKEN]):
    print("✗ Env vars obrigatórias: META_APP_ID, META_APP_SECRET, INSTAGRAM_ACCESS_TOKEN")
    sys.exit(1)

# ─── Inspeciona token atual ───────────────────────────────────────────────────

print("Verificando token atual...")
r_debug = requests.get(
    "https://graph.facebook.com/debug_token",
    params={
        "input_token":  IG_TOKEN,
        "access_token": f"{APP_ID}|{APP_SECRET}",
    },
    timeout=10,
)
if r_debug.ok:
    data = r_debug.json().get("data", {})
    is_valid   = data.get("is_valid", False)
    expires_at = data.get("expires_at", 0)
    if expires_at:
        dt_exp  = datetime.datetime.fromtimestamp(expires_at, tz=datetime.timezone.utc)
        days_left = (dt_exp - datetime.datetime.now(tz=datetime.timezone.utc)).days
        print(f"  Token válido: {is_valid}  |  Expira em: {days_left} dias ({dt_exp.strftime('%Y-%m-%d')})")
    else:
        print(f"  Token válido: {is_valid}  |  Sem data de expiração (token de página?)")
else:
    print(f"  ⚠ Não foi possível inspecionar token: {r_debug.status_code}")

# ─── Renova token ─────────────────────────────────────────────────────────────

print("Renovando token (fb_exchange_token)...")
r = requests.get(
    "https://graph.facebook.com/oauth/access_token",
    params={
        "grant_type":       "fb_exchange_token",
        "client_id":        APP_ID,
        "client_secret":    APP_SECRET,
        "fb_exchange_token": IG_TOKEN,
    },
    timeout=10,
)

if not r.ok:
    print(f"✗ Erro ao renovar token: {r.status_code} {r.text}")
    sys.exit(1)

new_token = r.json().get("access_token", "").strip()
if not new_token:
    print(f"✗ Resposta inesperada da API: {r.text}")
    sys.exit(1)

# Confirma data de expiração do novo token
r_debug2 = requests.get(
    "https://graph.facebook.com/debug_token",
    params={
        "input_token":  new_token,
        "access_token": f"{APP_ID}|{APP_SECRET}",
    },
    timeout=10,
)
if r_debug2.ok:
    data2 = r_debug2.json().get("data", {})
    exp2  = data2.get("expires_at", 0)
    if exp2:
        dt2 = datetime.datetime.fromtimestamp(exp2, tz=datetime.timezone.utc)
        print(f"  ✓ Novo token válido até: {dt2.strftime('%Y-%m-%d')} (+{(dt2 - datetime.datetime.now(tz=datetime.timezone.utc)).days} dias)")

# Imprime na última linha para captura no workflow
print(f"NEW_TOKEN={new_token}")
