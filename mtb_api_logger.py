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
    if not _log:
        return

    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not supabase_url or not supabase_key:
        return

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
