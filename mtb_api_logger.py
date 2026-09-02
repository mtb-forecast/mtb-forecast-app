"""
mtb_api_logger.py — rastreamento de consumo de APIs externas.

Importado pelo pipeline principal (mtb-forecast.py) via:
    from mtb_api_logger import log_api, gravar_uso_api

Mantido fora do pipeline para não poluir o arquivo de fórmulas.
"""

import json
import os
import time
import uuid
import urllib.request
from datetime import datetime, timezone

# ID único por execução — gerado uma vez na importação do módulo
EXECUCAO_ID: str = str(uuid.uuid4())

_log: list[dict] = []

# Preços em USD por 1 milhão de tokens (input / output)
_PRECOS: dict[str, dict[str, float]] = {
    "anthropic": {"input": 0.80,  "output": 4.00},
    "gemini":    {"input": 0.10,  "output": 0.40},
    "groq":      {"input": 0.59,  "output": 0.59},
    "deepseek":  {"input": 0.27,  "output": 1.10},  # deepseek-chat (V3/V4-flash)
}


def log_api(
    api: str,
    endpoint: str,
    chamadas: int = 1,
    tokens_in: int = 0,
    tokens_out: int = 0,
    sucesso: int = 1,
    falhas: int = 0,
) -> None:
    """Acumula uma entrada de uso de API em memória."""
    p = _PRECOS.get(api, {})
    custo = (tokens_in * p.get("input", 0.0) + tokens_out * p.get("output", 0.0)) / 1_000_000
    _log.append({
        "execucao_id":   EXECUCAO_ID,
        "api_name":      api,
        "endpoint":      endpoint,
        "chamadas":      chamadas,
        "tokens_input":  tokens_in,
        "tokens_output": tokens_out,
        "custo_usd":     round(custo, 8),
        "sucesso":       sucesso,
        "falhas":        falhas,
    })


def gravar_uso_api() -> None:
    """Agrega entradas acumuladas e grava em batch no Supabase ao final da execução."""
    supabase_url = os.getenv("SUPABASE_URL", "") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if _log and supabase_url and supabase_key:
        agg: dict[tuple, dict] = {}
        for e in _log:
            k = (e["api_name"], e["endpoint"])
            if k not in agg:
                agg[k] = {**e, "chamadas": 0, "tokens_input": 0, "tokens_output": 0,
                          "custo_usd": 0.0, "sucesso": 0, "falhas": 0}
            agg[k]["chamadas"]      += e["chamadas"]
            agg[k]["tokens_input"]  += e["tokens_input"]
            agg[k]["tokens_output"] += e["tokens_output"]
            agg[k]["custo_usd"]     += e["custo_usd"]
            agg[k]["sucesso"]       += e["sucesso"]
            agg[k]["falhas"]        += e["falhas"]

        rows    = list(agg.values())
        payload = json.dumps(rows).encode("utf-8")
        req = urllib.request.Request(
            f"{supabase_url}/rest/v1/api_usage_log",
            data=payload,
            method="POST",
            headers={
                "apikey":        supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type":  "application/json",
                "Prefer":        "return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15):
                total_usd = sum(r["custo_usd"] for r in rows)
                print(f"[API Logger] {len(rows)} entradas | custo_est=US${total_usd:.4f} (id={EXECUCAO_ID})")
        except Exception as exc:
            print(f"[API Logger] Falha ao gravar: {exc}")

    _verificar_limites_e_alertar()


def _sb_get(path_qs: str, supabase_url: str, supabase_key: str) -> list:
    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/{path_qs}",
        headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _sb_patch(path_qs: str, supabase_url: str, supabase_key: str, payload: dict) -> None:
    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/{path_qs}",
        data=json.dumps(payload).encode("utf-8"),
        method="PATCH",
        headers={
            "apikey":        supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=15):
        pass


def _alertar_telegram_admin(mensagem: str) -> None:
    token   = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("ADMIN_TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        print("[API Logger] TELEGRAM_BOT_TOKEN/ADMIN_TELEGRAM_CHAT_ID ausente — alerta de limite não enviado")
        return
    try:
        payload = json.dumps({"chat_id": chat_id, "text": mensagem}).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as exc:
        print(f"[API Logger] Falha ao enviar alerta Telegram: {exc}")


def _verificar_limites_e_alertar() -> None:
    """Compara o consumo acumulado do período (dia/mês corrente) com os limites
    cadastrados em `api_limits` e dispara um alerta Telegram para o admin quando
    algum é estourado. Deduplica por `ultimo_alerta_em` — só realerta no próximo
    período. Nunca lança exceção: falha aqui não pode derrubar o pipeline."""
    supabase_url = os.getenv("SUPABASE_URL", "") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        return

    try:
        limites = _sb_get("api_limits?select=*&ativo=eq.true", supabase_url, supabase_key)
    except Exception as exc:
        print(f"[API Logger] Falha ao buscar api_limits: {exc}")
        return

    agora = datetime.now(timezone.utc)
    for lim in limites:
        try:
            api_name = lim["api_name"]
            tipo     = lim["tipo"]
            inicio = (
                agora.replace(hour=0, minute=0, second=0, microsecond=0)
                if tipo == "diario"
                else agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            )

            ultimo_alerta = lim.get("ultimo_alerta_em")
            if ultimo_alerta:
                dt_alerta = datetime.fromisoformat(ultimo_alerta.replace("Z", "+00:00"))
                if dt_alerta >= inicio:
                    continue  # já alertou nesse período

            inicio_iso = inicio.strftime("%Y-%m-%dT%H:%M:%SZ")
            rows = _sb_get(
                f"api_usage_log?select=chamadas,tokens_input,tokens_output,custo_usd"
                f"&api_name=eq.{api_name}&criado_em=gte.{inicio_iso}",
                supabase_url, supabase_key,
            )
            chamadas = sum(r.get("chamadas", 0) or 0 for r in rows)
            tokens   = sum((r.get("tokens_input", 0) or 0) + (r.get("tokens_output", 0) or 0) for r in rows)
            custo    = sum(r.get("custo_usd", 0) or 0 for r in rows)

            estourou, detalhe = False, ""
            if lim.get("limite_chamadas") and chamadas >= lim["limite_chamadas"]:
                estourou, detalhe = True, f"{chamadas}/{lim['limite_chamadas']} chamadas"
            elif lim.get("limite_tokens") and tokens >= lim["limite_tokens"]:
                estourou, detalhe = True, f"{tokens}/{lim['limite_tokens']} tokens"
            elif lim.get("limite_custo_usd") and custo >= float(lim["limite_custo_usd"]):
                estourou, detalhe = True, f"US${custo:.4f}/US${float(lim['limite_custo_usd']):.4f}"

            if not estourou:
                continue

            msg = (
                f"🚨 MTB Forecaster — limite de API estourado\n"
                f"API: {api_name} ({tipo})\n"
                f"Consumo: {detalhe}"
            )
            print(f"[API Logger] ALERTA — {msg}")
            _alertar_telegram_admin(msg)
            try:
                _sb_patch(f"api_limits?id=eq.{lim['id']}", supabase_url, supabase_key,
                          {"ultimo_alerta_em": agora.isoformat()})
            except Exception as exc:
                print(f"[API Logger] Falha ao gravar ultimo_alerta_em: {exc}")
        except Exception as exc:
            print(f"[API Logger] Falha ao checar limite de {lim.get('api_name')}: {exc}")
