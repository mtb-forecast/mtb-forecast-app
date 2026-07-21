#!/usr/bin/env python3
"""
mtb_email_html.py — Report de trilhas por email.

Lê veredictos já gravados em condicoes + favoritos do Supabase,
monta HTML inspirado nos cards do app e envia via proxy Vercel.
Não recalcula nada — é um leitor puro do banco.
"""

import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

# ─── Config ───────────────────────────────────────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://eydlkvrjopffyqpdstzh.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
SEND_SECRET  = os.getenv("SEND_EMAIL_SECRET")
APP_URL      = "https://www.mtbforecaster.com.br"
BRT          = timezone(timedelta(hours=-3))

# Janelas fixas de envio do pipeline (ver lib/schedule.ts / mtb-forecast-workflow.yml)
_JANELAS = (6, 12, 16, 20)
_TODOS_DIAS     = [0, 1, 2, 3, 4, 5, 6]
_TODAS_JANELAS  = ["06h", "12h", "16h", "20h"]


def _janela_atual(agora: datetime) -> str:
    """Janela de envio mais próxima do horário atual (o script roda logo após o disparo)."""
    mais_proxima = min(_JANELAS, key=lambda h: abs(h - agora.hour))
    return f"{mais_proxima:02d}h"


def _usuario_quer_receber_agora(u: dict, weekday_atual: int, janela_atual: str) -> bool:
    dias      = u.get("notif_dias") or _TODOS_DIAS
    horarios  = u.get("notif_horarios") or _TODAS_JANELAS
    return weekday_atual in dias and janela_atual in horarios

# ─── Paleta (espelha o TrilhaCard do app) ─────────────────────────────────────

_VERD_STYLE = {
    "DROP LIBERADO": {
        "bar": "#2a6b1e", "bg": "#d6edcc", "text": "#2a6b1e",
        "border": "#a8d99a", "emoji": "✅",
    },
    "DROP LIBERADO - Veja os alertas": {
        "bar": "#8a5e00", "bg": "#fdf0cc", "text": "#8a5e00",
        "border": "#e8d080", "emoji": "⚠️",
    },
    "MELHOR ESPERAR": {
        "bar": "#8a1a1a", "bg": "#fcd8d8", "text": "#8a1a1a",
        "border": "#e8a0a0", "emoji": "🛑",
    },
}
_VERD_DEFAULT = {
    "bar": "#d0d4c6", "bg": "#eaece4", "text": "#6d745f",
    "border": "#d0d4c6", "emoji": "—",
}

_SOLO_LABEL = {
    "GRIP PERFEITO":  "SECO",
    "SECO":           "SECO",
    "BOA ADERÊNCIA":  "ÚMIDO",
    "BAIXA ADERÊNCIA":"SATURADO",
}

_VERD_ORDER = {
    "DROP LIBERADO": 0,
    "DROP LIBERADO - Veja os alertas": 1,
    "MELHOR ESPERAR": 2,
}

# ─── Supabase ─────────────────────────────────────────────────────────────────

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


def _buscar_usuarios() -> list:
    return _get(
        "profiles"
        "?select=id,email,apelido,nome,regiao,notif_dias,notif_horarios"
        "&receber_email=eq.true"
    )


def _buscar_favoritos(user_id: str) -> list:
    rows = _get(f"favoritos?select=trilha_id&user_id=eq.{user_id}")
    return [r["trilha_id"] for r in rows if r.get("trilha_id")]


def _buscar_condicoes(trilha_ids: list) -> list:
    """Retorna condições de hoje para os trilha_ids fornecidos (dedup por trilha_id)."""
    hoje = datetime.now(BRT).strftime("%Y-%m-%d")
    ids_csv = ",".join(trilha_ids)
    rows = _get(
        "condicoes"
        f"?select=trilha_id,aderencia_status,veredicto,veredicto_12h"
        f",rain_mm,wind_ms,ultima_chuva_h,texto_dinamico,frase_secagem"
        f",trilhas(name,regiao,trail_type,desnivel_m,extensao_km)"
        f"&trilha_id=in.({ids_csv})"
        f"&gerado_em=gte.{hoje}T00:00:00"
        f"&order=gerado_em.desc"
    )
    # pega apenas o registro mais recente de cada trilha (já ordenado desc)
    vistos: set = set()
    resultado = []
    for row in rows:
        tid = row.get("trilha_id")
        if tid and tid not in vistos:
            vistos.add(tid)
            resultado.append(row)
    return resultado



# ─── HTML helpers ─────────────────────────────────────────────────────────────

def _fmt_ultima_chuva(h) -> str:
    if h is None:
        return None
    h = float(h)
    return f"{round(h)}h atrás" if h < 24 else f"{int(h // 24)}d atrás"


def _card(row: dict) -> str:
    t          = row.get("trilhas") or {}
    name       = t.get("name") or "Trilha"
    regiao     = t.get("regiao") or ""
    trail_type = t.get("trail_type") or "natural"
    desnivel   = t.get("desnivel_m")
    extensao   = t.get("extensao_km")
    is_strava  = row.get("strava", False)
    trilha_id  = row.get("trilha_id")

    verd = ((row.get("veredicto_12h") or row.get("veredicto")) or "").strip()
    vs   = _VERD_STYLE.get(verd, _VERD_DEFAULT)

    adh        = (row.get("aderencia_status") or "").strip()
    solo_label = _SOLO_LABEL.get(adh, "")

    rain   = row.get("rain_mm", 0) or 0
    wind   = row.get("wind_ms", 0) or 0
    ultima = _fmt_ultima_chuva(row.get("ultima_chuva_h"))
    nota   = (row.get("texto_dinamico") or row.get("frase_secagem") or "").strip()

    tipo_label = (
        "🟠 Strava"     if is_strava else
        "🏟 Bike Park"  if trail_type == "bikepark" else
        "🏔 Trilha"
    )

    desn_str = ""
    if desnivel and extensao:
        desn_str = f" · ⛰ {desnivel}m / {extensao}km"
    elif desnivel:
        desn_str = f" · ⛰ {desnivel}m"

    link = f"{APP_URL}/trilhas/{trilha_id}" if trilha_id else APP_URL

    solo_badge = (
        f'<span style="display:inline-block;padding:3px 10px;border-radius:999px;'
        f'font-size:11px;font-weight:600;background:#eaece4;color:#6d745f;'
        f'border:0.5px solid #d0d4c6;margin-left:6px;">{solo_label}</span>'
    ) if solo_label else ""

    ultima_html = (
        f'<br><span style="font-size:11px;color:#8a9480;">⏱ Últ. chuva: <b>{ultima}</b></span>'
    ) if ultima else ""

    nota_html = (
        f'<br><span style="font-size:11px;color:#6d745f;font-style:italic;">{nota}</span>'
    ) if nota else ""

    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;border-radius:12px;overflow:hidden;border:0.5px solid #d0d4c6;background:#ffffff;">
<tr><td>

  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="height:3px;background:{vs['bar']};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>

  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="padding:14px 16px 12px;">

      <div style="font-size:15px;font-weight:700;color:#2a2e25;line-height:1.3;">{name}</div>
      <div style="font-size:11px;color:#6d745f;margin-top:2px;">{tipo_label}{desn_str}{(' · ' + regiao) if regiao else ''}</div>

      <div style="margin-top:10px;">
        <span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;
                     font-weight:700;background:{vs['bg']};color:{vs['text']};
                     border:0.5px solid {vs['border']};">
          {vs['emoji']} {verd if verd else '—'}
        </span>{solo_badge}
      </div>

      <div style="margin-top:10px;font-size:12px;color:#6d745f;line-height:1.9;">
        🌧 <b>{rain}mm</b> &nbsp;·&nbsp; 💨 <b>{wind}m/s</b>
        {ultima_html}
        {nota_html}
      </div>

    </td>
  </tr></table>

  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:0.5px solid #d0d4c6;background:#f4f5f0;"><tr>
    <td style="padding:9px 16px;">
      <a href="{link}" style="font-size:11px;color:#2a6b1e;font-weight:700;text-decoration:none;">
        Ver detalhes no app →
      </a>
    </td>
  </tr></table>

</td></tr>
</table>"""


def _gerar_html(apelido: str, trails: list, data_hora: str) -> str:
    cards_html = "".join(_card(r) for r in trails)

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#eaece4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#eaece4;padding:28px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1e2e1a 0%,#2a4a2a 100%);
                 border-radius:14px 14px 0 0;padding:28px 28px 22px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2.5px;color:#86efac;
                text-transform:uppercase;margin-bottom:8px;">🚵 MTB Forecaster</div>
    <div style="font-size:22px;font-weight:800;color:#ffffff;line-height:1.25;">
      Olá, {apelido}!
    </div>
    <div style="font-size:13px;color:#94a3b8;margin-top:6px;">
      Aqui está o report das suas trilhas
    </div>
    <div style="font-size:12px;color:#64748b;margin-top:3px;">{data_hora}</div>
  </td></tr>

  <!-- Cards -->
  <tr><td style="background:#f0f1eb;padding:20px 16px 8px;">
    {cards_html}
  </td></tr>

  <!-- CTA -->
  <tr><td style="background:#f0f1eb;padding:4px 16px 24px;text-align:center;">
    <a href="{APP_URL}"
       style="display:inline-block;padding:13px 32px;background:#2a6b1e;color:#ffffff;
              font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;
              letter-spacing:.4px;">
      Abrir MTB Forecaster →
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#1a2618;border-radius:0 0 14px 14px;padding:16px 28px;text-align:center;">
    <div style="font-size:11px;color:#86efac;">mtbforecaster.com.br</div>
    <div style="font-size:10px;color:#4a6b4a;margin-top:4px;">
      Para cancelar, acesse Perfil → Notificações no app.
    </div>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>"""

# ─── Envio ────────────────────────────────────────────────────────────────────

def _enviar(destinatario: str, assunto: str, html: str) -> bool:
    if not SEND_SECRET:
        print("  [Email] SEND_EMAIL_SECRET ausente — email não enviado")
        return False

    payload = json.dumps({
        "to":      destinatario,
        "subject": assunto,
        "html":    html,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{APP_URL}/api/send-email",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {SEND_SECRET}",
            "Content-Type":  "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        return True
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"  [Email] HTTP {exc.code}: {body}")
        return False
    except Exception as exc:
        print(f"  [Email] Erro: {exc}")
        return False

# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    if not SUPABASE_KEY:
        print("[Email] SUPABASE_SERVICE_ROLE_KEY ausente — abortando")
        return

    agora         = datetime.now(BRT)
    data_str      = agora.strftime("%d-%m-%Y")
    hora_str      = agora.strftime("%H:%M")
    data_hora     = f"{data_str} | {hora_str}"
    weekday_atual = agora.weekday()
    janela_atual  = _janela_atual(agora)

    print(f"\n[MTB Email] {data_hora} — janela {janela_atual} — iniciando...")

    try:
        usuarios = _buscar_usuarios()
    except Exception as exc:
        print(f"[Email] Erro ao buscar usuários: {exc}")
        return

    if not usuarios:
        print("  Nenhum usuário com receber_email=true")
        return

    print(f"  {len(usuarios)} usuário(s) com email ativado")

    for u in usuarios:
        uid   = u.get("id")
        email = u.get("email")
        if not uid or not email:
            continue
        if not _usuario_quer_receber_agora(u, weekday_atual, janela_atual):
            print(f"  {email}: fora da preferência de dia/horário — pulando")
            continue

        apelido = u.get("apelido") or u.get("nome") or email.split("@")[0]
        trails: list = []

        try:
            fav_ids = _buscar_favoritos(uid)
            if fav_ids:
                trails.extend(_buscar_condicoes(fav_ids))
        except Exception as exc:
            print(f"  [Email] Erro favoritos de {email}: {exc}")

        if not trails:
            print(f"  {email}: sem trilhas com dados hoje — pulando")
            continue

        # Ordena: DROP LIBERADO → alertas → MELHOR ESPERAR
        trails.sort(key=lambda r: _VERD_ORDER.get(
            ((r.get("veredicto_12h") or r.get("veredicto")) or "").strip(), 3
        ))

        html   = _gerar_html(apelido, trails, data_hora)
        assunto = f"Olá {apelido}, aqui está o report de suas trilhas {data_str} | {hora_str}"

        print(f"  Enviando para {email} ({len(trails)} trilha(s))...")
        ok = _enviar(email, assunto, html)
        print(f"  {'✉️  Enviado' if ok else '❌  Falhou'}")


if __name__ == "__main__":
    main()
