import { NextRequest, NextResponse } from 'next/server'

type StarredSegment = {
  id: number
  name: string
  distance: number
  total_elevation_gain: number
  elevation_high?: number
  city?: string
  state?: string
  country?: string
  start_latlng: number[]
  end_latlng: number[]
  map?: { summary_polyline?: string; polyline?: string }
  elevation_profile?: string
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('strava_token')?.value

  if (!token) {
    return NextResponse.json({ error: 'Token Strava não encontrado. Reconecte o Strava.' }, { status: 401 })
  }

  const listRes = await fetch('https://www.strava.com/api/v3/segments/starred?per_page=50', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!listRes.ok) {
    return NextResponse.json({ error: 'Erro ao buscar segmentos do Strava.' }, { status: listRes.status })
  }

  const rawSegments: StarredSegment[] = await listRes.json()

  const segments = rawSegments.map((s) => {
    const polyline = s.map?.summary_polyline || s.map?.polyline || null
    console.log('Segment:', s.name, 'summary_polyline length:', s.map?.summary_polyline?.length ?? 0)
    return {
      id: s.id,
      name: s.name,
      distance: s.distance,
      total_elevation_gain: s.total_elevation_gain,
      elevation_high: s.elevation_high ?? null,
      city: s.city ?? null,
      state: s.state ?? null,
      country: s.country ?? null,
      start_latlng: s.start_latlng,
      end_latlng: s.end_latlng,
      polyline,
      map: s.map ?? null,
    }
  })

  return NextResponse.json(segments)
}
