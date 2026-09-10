#!/usr/bin/env python3
"""
notificar_selecoes.py — Lembrete "um dia antes" das seleções de trilhas
personalizadas (feature: seleções colaborativas).

Script isolado, independente do pipeline principal (mtb-forecast.py) e do
mtb_telegram.py existente — lê selecoes_trilhas + selecao_membros + profiles
+ selecao_trilhas_itens + trilhas via REST puro do Supabase e envia Telegram
para quem tem telegram_ativo=true e telegram_chat_id preenchido.

Roda 1x/dia via .github/workflows/selecoes-lembrete.yml, antes da janela das
07h do pipeline principal, notificando as seleções cuja `data` é amanhã.

Uso: `python scripts/notificar_selecoes.py` (envia de verdade)
     `python scripts/notificar_selecoes.py --dry-run` (só imprime, não envia)
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

SUPABASE_URL   = os.getenv("SUPABASE_URL", "https://eydlkvrjopffyqpdstzh.supabase.co")
SUPABASE_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
APP_URL        = "https://www.mtbforecaster.com.br"
BRT            = timezone(timedelta(hours=-3))
DRY_RUN        = "--dry-run" in sys.argv


def _get(path: str) -> list:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _enviar(chat_id: int, mensagem: str) -> bool:
    if DRY_RUN:
        print(f"  [dry-run] mensagem para chat_id={chat_id}:\n{mensagem}\n")
        return True
    if not TELEGRAM_TOKEN:
        return False
    try:
        payload = json.dumps({
            "chat_id":                  chat_id,
            "text":                     mensagem,
            "parse_mode":               "Markdown",
            "disable_web_page_preview": True,
        }).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"  [Telegram] Erro ao enviar para {chat_id}: HTTP {exc.code} — {body}")
        return False
    except Exception as exc:
        print(f"  [Telegram] Erro ao enviar para {chat_id}: {exc}")
        return False


def _buscar_selecoes_de_amanha(amanha: str) -> list:
    return _get(
        "selecoes_trilhas"
        f"?select=id,nome,data,owner_id"
        f"&data=eq.{amanha}"
    )


def _buscar_membros(selecao_id: str) -> list:
    """Colaboradores + owner, com dados de Telegram já embutidos via join."""
    membros = _get(
        "selecao_membros"
        f"?select=profile_id,profiles(id,apelido,nome,telegram_ativo,telegram_chat_id)"
        f"&selecao_id=eq.{selecao_id}"
    )
    perfis = [m["profiles"] for m in membros if m.get("profiles")]
    return perfis


def _buscar_owner(owner_id: str) -> dict | None:
    rows = _get(
        "profiles"
        f"?select=id,apelido,nome,telegram_ativo,telegram_chat_id"
        f"&id=eq.{owner_id}"
    )
    return rows[0] if rows else None


def _buscar_trilhas(selecao_id: str) -> list:
    itens = _get(
        "selecao_trilhas_itens"
        f"?select=trilhas(name)"
        f"&selecao_id=eq.{selecao_id}"
    )
    return [i["trilhas"]["name"] for i in itens if i.get("trilhas") and i["trilhas"].get("name")]


def _montar_mensagem(nome_destinatario: str, selecao_nome: str, data_str: str, trilhas: list) -> str:
    linhas_trilhas = "\n".join(f"• {t}" for t in trilhas) or "_(sem trilhas cadastradas ainda)_"
    return (
        f"📋 *MTB Forecaster — Seleção de amanhã*\n\n"
        f"Olá, *{nome_destinatario}*! Amanhã ({data_str}) rola a seleção "
        f"*{selecao_nome}*:\n\n"
        f"{linhas_trilhas}\n\n"
        f"🔗 [Ver condições]({APP_URL}/perfil/minhas-trilhas)"
    )


def main() -> None:
    if not SUPABASE_KEY:
        print("[Seleções] SUPABASE_SERVICE_ROLE_KEY ausente — abortando")
        return
    if not TELEGRAM_TOKEN and not DRY_RUN:
        print("[Seleções] TELEGRAM_BOT_TOKEN ausente — abortando")
        return

    amanha = (datetime.now(BRT).date() + timedelta(days=1)).strftime("%Y-%m-%d")
    amanha_fmt = (datetime.now(BRT).date() + timedelta(days=1)).strftime("%d/%m/%Y")

    print(f"\n[Seleções] Verificando seleções para {amanha}...")

    try:
        selecoes = _buscar_selecoes_de_amanha(amanha)
    except Exception as exc:
        print(f"[Seleções] Erro ao buscar seleções: {exc}")
        return

    if not selecoes:
        print("  Nenhuma seleção para amanhã")
        return

    for s in selecoes:
        selecao_id = s["id"]
        nome_selecao = s["nome"]

        try:
            trilhas = _buscar_trilhas(selecao_id)
            destinatarios = _buscar_membros(selecao_id)
            owner = _buscar_owner(s["owner_id"])
            if owner and not any(d.get("id") == owner["id"] for d in destinatarios):
                destinatarios.append(owner)
        except Exception as exc:
            print(f"  [Seleções] Erro ao montar dados de '{nome_selecao}': {exc}")
            continue

        print(f"  '{nome_selecao}' — {len(trilhas)} trilha(s), {len(destinatarios)} destinatário(s)")

        for d in destinatarios:
            chat_id = d.get("telegram_chat_id")
            if not d.get("telegram_ativo") or not chat_id:
                continue
            nome_dest = d.get("apelido") or d.get("nome") or "Rider"
            mensagem = _montar_mensagem(nome_dest, nome_selecao, amanha_fmt, trilhas)
            ok = _enviar(int(chat_id), mensagem)
            print(f"    {nome_dest}: {'✓ enviado' if ok else '✗ falhou'}")


if __name__ == "__main__":
    main()
