import requests
import json
import csv
from datetime import datetime

# ── CONFIGURAÇÃO ──────────────────────────────────────────────
REGIOES = [
    {"nome": "Nova Lima / Macacos - MG", "lat": -20.0, "lon": -43.9, "raio_m": 20000},
    {"nome": "Mairiporã - SP",           "lat": -23.32, "lon": -46.58, "raio_m": 15000},
]

OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter"
OUTPUT_JSON  = "trilhas_osm.json"
OUTPUT_CSV   = "trilhas_osm.csv"
# ──────────────────────────────────────────────────────────────


def buscar_trilhas(lat, lon, raio_m, nome_regiao):
    query = f"""
    [out:json][timeout:30];
    (
      way["highway"~"path|track"]["mtb:scale"](around:{raio_m},{lat},{lon});
      way["highway"~"path|track"]["sport"="cycling"](around:{raio_m},{lat},{lon});
      relation["route"="mtb"](around:{raio_m},{lat},{lon});
      relation["route"="bicycle"]["mtb"="yes"](around:{raio_m},{lat},{lon});
    );
    out body;
    >;
    out skel qt;
    """
    print(f"\n🔍 Buscando trilhas em: {nome_regiao}")
    print(f"   Centro: lat {lat}, lon {lon} | Raio: {raio_m/1000:.0f}km")

    try:
        response = requests.post(
            OVERPASS_URL,
            data={"data": query},
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
            timeout=35
        )
        response.raise_for_status()
        data = response.json()
        elementos = data.get("elements", [])
        print(f"   ✅ {len(elementos)} elementos retornados pelo OSM")
        return elementos
    except requests.exceptions.Timeout:
        print(f"   ❌ Timeout — tente aumentar o timeout ou reduzir o raio")
        return []
    except Exception as e:
        print(f"   ❌ Erro: {e}")
        return []


def extrair_centro(elemento, nodes_map):
    if elemento.get("type") == "node":
        return elemento.get("lat"), elemento.get("lon")
    node_ids = elemento.get("nodes", [])
    if not node_ids:
        return None, None
    lats = [nodes_map[n]["lat"] for n in node_ids if n in nodes_map]
    lons = [nodes_map[n]["lon"] for n in node_ids if n in nodes_map]
    if not lats:
        return None, None
    return round(sum(lats) / len(lats), 6), round(sum(lons) / len(lons), 6)


def processar_elementos(elementos, nome_regiao):
    nodes_map = {e["id"]: e for e in elementos if e.get("type") == "node"}
    trilhas = []
    for el in elementos:
        if el.get("type") not in ("way", "relation"):
            continue
        tags = el.get("tags", {})
        if not tags:
            continue
        nome = (
            tags.get("name") or
            tags.get("name:pt") or
            tags.get("ref") or
            f"Trilha OSM #{el['id']}"
        )
        lat, lon = extrair_centro(el, nodes_map)
        if not lat or not lon:
            continue
        dificuldade_map = {
            "0": "beginner", "1": "intermediate", "2": "intermediate",
            "3": "hard", "4": "expert", "5": "extreme",
        }
        dificuldade_raw = tags.get("mtb:scale", "")
        dificuldade = dificuldade_map.get(str(dificuldade_raw).strip(), dificuldade_raw or "unknown")
        trilha = {
            "osm_id":      el["id"],
            "osm_type":    el["type"],
            "nome":        nome,
            "lat":         lat,
            "lon":         lon,
            "regiao":      nome_regiao,
            "dificuldade": dificuldade,
            "mtb_scale":   tags.get("mtb:scale", ""),
            "surface":     tags.get("surface", ""),
            "highway":     tags.get("highway", ""),
            "route":       tags.get("route", ""),
            "sport":       tags.get("sport", ""),
            "access":      tags.get("access", ""),
            "osm_tags":    json.dumps(tags, ensure_ascii=False),
        }
        trilhas.append(trilha)
    return trilhas


def salvar_resultados(todas_trilhas):
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(todas_trilhas, f, ensure_ascii=False, indent=2)
    print(f"\n💾 JSON salvo: {OUTPUT_JSON}")
    if todas_trilhas:
        campos = list(todas_trilhas[0].keys())
        with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=campos)
            writer.writeheader()
            writer.writerows(todas_trilhas)
        print(f"💾 CSV salvo:  {OUTPUT_CSV}")


def main():
    print("=" * 60)
    print("  MTB Forecaster — Importador de Trilhas OSM")
    print(f"  {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("=" * 60)

    todas_trilhas = []

    for regiao in REGIOES:
        elementos = buscar_trilhas(
            lat=regiao["lat"],
            lon=regiao["lon"],
            raio_m=regiao["raio_m"],
            nome_regiao=regiao["nome"],
        )
        if elementos:
            trilhas = processar_elementos(elementos, regiao["nome"])
            todas_trilhas.extend(trilhas)
            print(f"   📍 {len(trilhas)} trilhas processadas")

    print(f"\n{'=' * 60}")
    print(f"  TOTAL: {len(todas_trilhas)} trilhas encontradas")
    print(f"{'=' * 60}")

    if todas_trilhas:
        salvar_resultados(todas_trilhas)
        print(f"\n📋 Amostra das primeiras 10:")
        print(f"{'#':<4} {'Nome':<40} {'Lat':>9} {'Lon':>10} {'Dific.':<14} {'Surface'}")
        print("-" * 90)
        for i, t in enumerate(todas_trilhas[:10], 1):
            print(f"{i:<4} {t['nome'][:39]:<40} {t['lat']:>9} {t['lon']:>10} {t['dificuldade']:<14} {t['surface'] or '—'}")
        print(f"\n✅ Revise o CSV e importe no Supabase.")
    else:
        print("\n⚠️  Nenhuma trilha encontrada. Tente aumentar o raio_m.")


if __name__ == "__main__":
    main()
