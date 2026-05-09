import csv
import json
import urllib.request
import urllib.error

SUPABASE_URL = "https://eydlkvrjopffyqpdstzh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5ZGxrdnJqb3BmZnlxcGRzdHpoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE4MDg1MSwiZXhwIjoyMDkzNzU2ODUxfQ.h6FpQDNmuXrcd-pJdd68Y8PTsj-CmCdUGmZWJ2zH280"
CSV_FILE = "trilhas.csv"


def parse_optional_float(value: str):
    v = value.strip()
    return float(v) if v else None


def parse_optional_str(value: str):
    v = value.strip()
    return v if v else None


def insert_trilha(row: dict) -> tuple[bool, str]:
    payload = {
        "name":        row["name"].strip(),
        "lat":         float(row["lat"]),
        "lon":         float(row["lon"]),
        "solo_type":   row["solo_type"].strip(),
        "exposicao":   row["exposicao"].strip().lower(),
        "altitude_m":  int(float(row["altitude_m"])),
        "trail_type":  row["trail_type"].strip(),
        "desnivel_m":  parse_optional_float(row.get("desnivel_m", "")),
        "extensao_km": parse_optional_float(row.get("extensao_km", "")),
        "regiao":      row["regiao"].strip(),
        "bioma":       parse_optional_str(row.get("bioma", "")),
        "aprovada":    True,
    }

    body = json.dumps(payload).encode("utf-8")
    url = f"{SUPABASE_URL}/rest/v1/trilhas"

    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation",
        },
    )

    try:
        with urllib.request.urlopen(req) as resp:
            body_resp = json.loads(resp.read().decode("utf-8"))
            inserted_id = body_resp[0].get("id", "?") if body_resp else "?"
            return True, f"id={inserted_id}"
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8")
        return False, f"HTTP {e.code} — {detail}"


def main():
    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        rows = list(reader)

    total = len(rows)
    print(f"Encontradas {total} trilhas em {CSV_FILE}\n")
    print("-" * 60)

    ok = 0
    fail = 0
    for i, row in enumerate(rows, 1):
        name = row.get("name", "").strip()
        success, info = insert_trilha(row)
        status = "OK" if success else "ERRO"
        print(f"[{i:02d}/{total}] {status}  {name}")
        if success:
            print(f"         {info}")
            ok += 1
        else:
            print(f"         ERRO: {info}")
            fail += 1

    print("-" * 60)
    print(f"\nResultado: {ok} inseridas com sucesso, {fail} com erro.")


if __name__ == "__main__":
    main()
