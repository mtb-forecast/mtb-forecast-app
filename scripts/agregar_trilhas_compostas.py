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
só nos campos de veredicto/aderência/texto_dinamico da trilha composta —
nunca recalcula clima/solo, nunca toca nas trilhas componentes. Ver
CLAUDE.md, seção "Integridade do pipeline acima de tudo".

O `texto_dinamico` de uma trilha composta NÃO usa a narrativa normal gerada
pelo pipeline principal (que descreve só o ponto de cadastro da trilha) —
esse texto é sempre sobrescrito aqui por um resumo que analisa TODOS os
trechos componentes e sintetiza a pior situação real do percurso completo,
no mesmo tom conversacional (ver CLAUDE.md, invariante 14).

Como desligar no futuro (qualquer uma destas opções basta):
  - Remover o step correspondente de .github/workflows/mtb-forecast-workflow.yml
    (sem tocar no restante do pipeline).
  - TRILHAS_COMPOSTAS_ENABLED=0   desliga a execução inteira (nada roda).
  - TEXTO_COMPOSTA_ENABLED=0      mantém a agregação de veredicto/aderência,
                                   mas não gera texto_dinamico via LLM (cai no
                                   resumo local template-based).

Uso:
  python scripts/agregar_trilhas_compostas.py
  DRY_RUN=1 python scripts/agregar_trilhas_compostas.py

Env vars obrigatórias:
  SUPABASE_URL             ex: https://xxx.supabase.co
  SUPABASE_SERVICE_KEY     chave de serviço do Supabase

Env vars opcionais (texto_dinamico via LLM):
  DEEPSEEK_API_KEY         provider primário
  ANTHROPIC_API_KEY        fallback (Claude Haiku)

Kill switch:
  TRILHAS_COMPOSTAS_ENABLED=0    pula a execução inteira
  TEXTO_COMPOSTA_ENABLED=0       desliga só a geração de texto via LLM
  DRY_RUN=1                      mostra o que seria alterado sem gravar
"""

import json
import os

import requests

SUPABASE_URL      = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY      = os.environ.get("SUPABASE_SERVICE_KEY", "")
DEEPSEEK_KEY      = os.environ.get("DEEPSEEK_API_KEY", "")
ANTHROPIC_KEY     = os.environ.get("ANTHROPIC_API_KEY", "")
ENABLED           = os.environ.get("TRILHAS_COMPOSTAS_ENABLED", "1").strip() != "0"
TEXTO_ENABLED     = os.environ.get("TEXTO_COMPOSTA_ENABLED", "1").strip() != "0"
DRY_RUN           = os.environ.get("DRY_RUN", "").strip() == "1"

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
        f",frase_secagem,chuva_solo_48h,ultima_chuva_h,texto_dinamico"
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


# ── texto_dinamico da trilha composta ───────────────────────────────────────
#
# Analisa TODOS os trechos (não só o ponto de cadastro da composta) e escreve
# um resumo breve e conversacional -- mesmo tom/regras do
# _build_narrativa_prompt() do pipeline principal (CLAUDE.md invariante 14:
# nunca jargão de hidrologia/solo), mas sintetizando o percurso inteiro em
# vez de descrever uma trilha isolada.

def _build_prompt_composta(nome_composta: str, cond_composta: dict, componentes: list[dict]) -> str:
    linhas_trechos = []
    for c in componentes:
        partes = [c["nome"]]
        if c.get("veredicto"):
            partes.append(f"veredicto {c['veredicto']}")
        if c.get("aderencia_status"):
            partes.append(f"aderência {c['aderencia_status']}")
        if c.get("frase_secagem"):
            partes.append(c["frase_secagem"])
        linhas_trechos.append("- " + " · ".join(partes))

    return f"""Você é especialista em trilhas de mountain bike DH e Enduro no Brasil.

"{nome_composta}" é um percurso longo composto por {len(componentes)} trechos que já
existem cadastrados individualmente no catálogo. Cada trecho tem sua própria condição
calculada. Escreva um resumo BREVE (2 a 4 frases) em português do Brasil sobre o
percurso completo -- não descreva como se fosse um ponto único, sintetize a real
situação considerando todos os trechos abaixo.

REGRA CRÍTICA: seja 100% consistente com os dados abaixo — são a verdade absoluta.
NUNCA sugira condição melhor do que o pior trecho indica. Se todos os trechos estão
bem, diga isso com confiança. Se algum trecho está pior que os outros, cite o nome
dele e avise o rider especificamente sobre aquele pedaço do percurso.

Veredicto final do percurso (já é o pior caso entre os trechos): {cond_composta.get('veredicto', '—')}
Aderência final do percurso (já é o pior caso): {cond_composta.get('aderencia_status', '—')}

Trechos que compõem o percurso:
{chr(10).join(linhas_trechos)}

Tom conversacional, como avisar um amigo antes de sair pra pedalar -- NÃO um relatório
técnico, NÃO liste os trechos um por um mecanicamente. Evite jargão de
hidrologia/solo (nunca "meia-vida de secagem", "dossel", "acúmulo efetivo" -- traduza
pra linguagem natural, tipo "esse trecho seca rápido" ou "essa parte segura mais
umidade"). Pode citar nomes de trechos e números de chuva/tempo quando ajudar.

Regras:
- Se o percurso inteiro está numa condição uniforme (todos os trechos parecidos),
  resuma isso em 1-2 frases sem precisar nomear cada trecho
- Se existe um trecho claramente pior que os demais, dedique uma frase específica
  a ele, citando o nome
- NUNCA contradiga o veredicto/aderência final informados acima
- Sem markdown, sem bullet points, sem título, sem saudações
- Máximo 450 caracteres"""


def _gerar_texto_composta_deepseek(prompt: str) -> str | None:
    if not DEEPSEEK_KEY:
        return None
    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 250,
        "temperature": 0.7,
    }
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_KEY}"}
    for attempt in range(2):
        try:
            r = requests.post("https://api.deepseek.com/chat/completions", json=payload, headers=headers, timeout=30)
            if not r.ok:
                print(f"  [DeepSeek texto composta] HTTP {r.status_code} (tentativa {attempt+1})")
                if r.status_code in (400, 402):
                    return None
                continue
            return r.json()["choices"][0]["message"]["content"].strip()
        except Exception as exc:
            print(f"  [DeepSeek texto composta] Erro (tentativa {attempt+1}): {exc}")
    return None


def _gerar_texto_composta_claude(prompt: str) -> str | None:
    if not ANTHROPIC_KEY:
        return None
    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 250,
        "messages": [{"role": "user", "content": prompt}],
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
    }
    try:
        r = requests.post("https://api.anthropic.com/v1/messages", json=payload, headers=headers, timeout=30)
        if not r.ok:
            print(f"  [Claude texto composta] HTTP {r.status_code}")
            return None
        return r.json()["content"][0]["text"].strip()
    except Exception as exc:
        print(f"  [Claude texto composta] Erro: {exc}")
        return None


def _resumo_composta_local(nome_composta: str, cond_composta: dict, componentes: list[dict], origem_trecho: str | None) -> str:
    """Fallback sem LLM -- sempre disponível, nunca falha."""
    veredicto = cond_composta.get("veredicto") or "condição indefinida"
    base = f"Esse percurso tem {len(componentes)} trechos conhecidos do catálogo. Veredicto geral: {veredicto.lower()}."
    if origem_trecho:
        return f"{base} O ponto de atenção é o trecho {origem_trecho}, que está pior que o resto do percurso -- ajuste a expectativa nessa parte."
    return f"{base} Os trechos que compõem o percurso estão em situação parecida entre si."


def gerar_texto_composta(nome_composta: str, cond_composta: dict, componentes: list[dict], origem_trecho: str | None) -> str:
    if not TEXTO_ENABLED:
        return _resumo_composta_local(nome_composta, cond_composta, componentes, origem_trecho)

    prompt = _build_prompt_composta(nome_composta, cond_composta, componentes)
    texto = _gerar_texto_composta_deepseek(prompt) or _gerar_texto_composta_claude(prompt)
    return texto or _resumo_composta_local(nome_composta, cond_composta, componentes, origem_trecho)


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

        # texto_dinamico da composta NUNCA usa a narrativa de ponto único que o
        # pipeline principal gerou pra ela -- sempre sobrescrito aqui com um
        # resumo que analisa todos os trechos (ver gerar_texto_composta()).
        componentes_info = [
            {"nome": nomes.get(cid, cid), **condicoes[cid]}
            for cid in componente_ids if cid in condicoes
        ]
        nome_composta = nomes.get(composta_id, composta_id)
        campos = {
            "veredicto":        pior_v48[1].get("veredicto"),
            "veredicto_12h":    pior_v12[1].get("veredicto_12h"),
            "aderencia_status": pior_ader[1].get("aderencia_status"),
            "veredicto_origem_trecho": origem_trecho,
        }
        if not DRY_RUN:
            campos["texto_dinamico"] = gerar_texto_composta(nome_composta, {**cond_composta, **campos}, componentes_info, origem_trecho)

        veredicto_mudou = any(campos[k] != cond_composta.get(k) for k in ("veredicto", "veredicto_12h", "aderencia_status")) \
            or campos["veredicto_origem_trecho"] != cond_composta.get("veredicto_origem_trecho")

        nome_origem = f" (pior trecho: {origem_trecho})" if origem_trecho else ""
        if veredicto_mudou:
            print(f"  [ATUALIZA] {nome_composta}: {cond_composta.get('veredicto')!r} -> {campos['veredicto']!r}{nome_origem}")
        else:
            print(f"  [TEXTO] {nome_composta}: veredicto já era o pior caso, regenerando só texto_dinamico{nome_origem}")

        if not DRY_RUN:
            patch_condicao(composta_id, campos)
        n_atualizadas += 1

    print(f"Concluído. {n_atualizadas}/{len(grupos)} trilha(s) composta(s) atualizada(s).")


if __name__ == "__main__":
    main()
