export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')

  if (!lat || !lon) {
    return Response.json({ error: 'lat and lon required' }, { status: 400 })
  }

  const props = [
    'sol_clay_usda.soiltax_c_250m_b0..0cm_1950..2017_v0.2',
    'sol_sand_usda.soiltax_c_250m_b0..0cm_1950..2017_v0.2',
  ].join('|')

  const url = `http://api.openlandmap.org/query/point?lat=${lat}&lon=${lon}&coll=predicted250m&regex=${props}`

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } })
    const data = await res.json()
    const props_data = data?.properties || {}

    let clay_raw: number | null = null
    let sand_raw: number | null = null

    for (const [k, v] of Object.entries(props_data)) {
      const vals = Array.isArray(v) ? v : [v]
      const val = vals.find((x) => x !== null && x !== undefined) as number | undefined
      if (val === undefined) continue
      if (k.includes('clay')) clay_raw = val
      if (k.includes('sand')) sand_raw = val
    }

    if (clay_raw === null) return Response.json({ error: 'no data' }, { status: 404 })

    const clay_pct = Math.round(clay_raw / 10)
    const sand_pct = sand_raw !== null ? Math.round(sand_raw / 10) : null

    let solo_type_sugerido = 'misto'
    if (clay_pct > 40) solo_type_sugerido = 'terra'
    else if (clay_pct < 20) solo_type_sugerido = 'pedra'

    return Response.json({ clay_pct, sand_pct, solo_type_sugerido })
  } catch {
    return Response.json({ error: 'api error' }, { status: 500 })
  }
}
