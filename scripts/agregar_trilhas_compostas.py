#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io as _io
sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
agregar_trilhas_compostas.py — Trilhas longas (>5km) que fisicamente atravessam
trechos já cadastrados como trilhas próprias no catálogo (ver `trilha_segmentos`)
podem ter condição pior num trecho específico do que no ponto de cadastro da
trilha inteira. Este script lê as condições já gravadas (pela trilha composta
E por cada trilha componente) e escala o veredicto/aderência da composta para
o PIOR CASO entre elas, sempre que algum componente for mais severo.

Peça INDEPENDENTE do pipeline principal (mtb-forecast.py): roda DEPOIS dele,
lê `condicoes` já gravado (upsert, 1 linha por trilha) e faz um PATCH pontual
só nos campos de veredicto/aderência da trilha composta — nunca recalcula
clima/solo, nunca toca nas trilhas componentes. Ver CLAUDE.md, seção
"Integridade do pipeline acima de tudo".

Como desligar no futuro (qualquer uma destas opções basta):
  - Remover o step correspondente de .github/workflows/mtb-forecast-workflow.yml
    (sem tocar no restante do pipeline).
  - TRILHAS_COMPOSTAS_ENABLED=0   desliga a execução inteira (nada roda).

Uso:
  python scripts/agregar_trilhas_compostas.py
  DRY_RUN=1 python scripts/agregar_trilhas_compostas.py

Env vars obrigatórias:
  SUPABASE_URL             ex: https://xxx.supabase.co
  SUPABASE_SERVICE_KEY     chave de serviço do Supabase

Kill switch:
  TRILHAS_COMPOSTAS_ENABLED=0    pula a execução inteira
  DRY_RUN=1                      mostra o que seria alterado sem gravar
"""

import json
import os

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ENABLED      = os.environ.get("TRILHAS_COMPOSTAS_ENABLED", "1").strip() != "0"
DRY_RUN      = os.environ.get("DRY_RUN", "").strip() == "1"

# Mesma prioridade de lib/veredicto.ts::veredictoSeverity — nunca duplicar essa
# lógica com uma ordem diferente entre frontend e este script.
def _veredicto_severity(v: str | None) -> int:
    if not v:
        return -1
    u = v.upper()
    if "ESPERAR" in u or "EVITAR" in u:
        return 2
    if "ALERTA" in u:
        return 1
    return 0

# Mesma tabela de lib/veredicto.ts::ADERENCIA_SEVERIDADE.
_ADERENCIA_SEVERIDADE = {
    "SECO": 0, "GRIP PERFEITO": 1, "BOA ADERÊNCIA - ÚMIDO": 2, "BAIXA ADERÊNCIA": 3,
}


def _sb_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def carregar_segmentos() -> dict[str, list[str]]:
    """trilha_composta_id -> [trilha_componente_id, ...]"""
    url = f"{SUPABASE_URL}/rest/v1/trilha_segmentos?select=trilha_composta_id,trilha_componente_id"
    r = requests.get(url, headers=_sb_headers(), timeout=20)
    r.raise_for_status()
    grupos: dict[str, list[str]] = {}
    for row in r.json():
        grupos.setdefault(row["trilha_composta_id"], []).append(row["trilha_componente_id"])
    return grupos


def carregar_condicoes(trilha_ids: list[str]) -> dict[str, dict]:
    """trilha_id -> linha de condicoes (campos relevantes)"""
    if not trilha_ids:
        return {}
    ids_str = ",".join(trilha_ids)
    url = (
        f"{SUPABASE_URL}/rest/v1/condicoes"
        f"?trilha_id=in.({ids_str})"
        f"&select=trilha_id,veredicto,veredicto_12h,aderencia_status"
    )
    r = requests.get(url, headers=_sb_headers(), timeout=20)
    r.raise_for_status()
    return {row["trilha_id"]: row for row in r.json()}


def carregar_nomes(trilha_ids: list[str]) -> dict[str, str]:
    if not trilha_ids:
        return {}
    ids_str = ",".join(trilha_ids)
    url = f"{SUPABASE_URL}/rest/v1/trilhas?id=in.({ids_str})&select=id,name"
    r = requests.get(url, headers=_sb_headers(), timeout=20)
    r.raise_for_status()
    return {row["id"]: row["name"] for row in r.json()}


def patch_condicao(trilha_id: str, campos: dict) -> None:
    url = f"{SUPABASE_URL}/rest/v1/condicoes?trilha_id=eq.{trilha_id}"
    r = requests.patch(url, headers=_sb_headers(), data=json.dumps(campos), timeout=20)
    r.raise_for_status()


def main() -> None:
    print(f"MTB Forecaster — Agregação de trilhas compostas {'[DRY RUN]' if DRY_RUN else ''}")

    if not ENABLED:
        print("TRILHAS_COMPOSTAS_ENABLED=0 — pulando execução.")
        return
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SystemExit("SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios")

    grupos = carregar_segmentos()
    if not grupos:
        print("Nenhuma trilha composta cadastrada (trilha_segmentos vazia). Nada a fazer.")
        return

    todos_ids = list({*grupos.keys(), *[cid for comps in grupos.values() for cid in comps]})
    condicoes = carregar_condicoes(todos_ids)
    nomes     = carregar_nomes(todos_ids)

    n_atualizadas = 0
    for composta_id, componente_ids in grupos.items():
        cond_composta = condicoes.get(composta_id)
        if not cond_composta:
            print(f"  [SKIP] {nomes.get(composta_id, composta_id)}: sem condição própria ainda gravada.")
            continue

        candidatos = [(composta_id, cond_composta)] + [
            (cid, condicoes[cid]) for cid in componente_ids if cid in condicoes
        ]

        pior_v48  = max(candidatos, key=lambda c: _veredicto_severity(c[1].get("veredicto")))
        pior_v12  = max(candidatos, key=lambda c: _veredicto_severity(c[1].get("veredicto_12h")))
        pior_ader = max(
            candidatos,
            key=lambda c: _ADERENCIA_SEVERIDADE.get(c[1].get("aderencia_status") or "", -1),
        )

        origem_trecho = None
        if pior_v48[0] != composta_id and _veredicto_severity(pior_v48[1].get("veredicto")) > _veredicto_severity(cond_composta.get("veredicto")):
            origem_trecho = nomes.get(pior_v48[0])
        elif pior_v12[0] != composta_id and _veredicto_severity(pior_v12[1].get("veredicto_12h")) > _veredicto_severity(cond_composta.get("veredicto_12h")):
            origem_trecho = nomes.get(pior_v12[0])

        campos = {
            "veredicto":        pior_v48[1].get("veredicto"),
            "veredicto_12h":    pior_v12[1].get("veredicto_12h"),
            "aderencia_status": pior_ader[1].get("aderencia_status"),
            "veredicto_origem_trecho": origem_trecho,
        }

        mudou = any(campos[k] != cond_composta.get(k) for k in ("veredicto", "veredicto_12h", "aderencia_status")) \
            or campos["veredicto_origem_trecho"] != cond_composta.get("veredicto_origem_trecho")

        if not mudou:
            print(f"  [OK] {nomes.get(composta_id, composta_id)}: já reflete o pior caso, nada a atualizar.")
            continue

        nome_origem = f" (pior trecho: {origem_trecho})" if origem_trecho else ""
        print(f"  [ATUALIZA] {nomes.get(composta_id, composta_id)}: {cond_composta.get('veredicto')!r} -> {campos['veredicto']!r}{nome_origem}")

        if not DRY_RUN:
            patch_condicao(composta_id, campos)
        n_atualizadas += 1

    print(f"Concluído. {n_atualizadas}/{len(grupos)} trilha(s) composta(s) atualizada(s).")


if __name__ == "__main__":
    main()
