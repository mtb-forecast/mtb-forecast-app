import { NextRequest, NextResponse } from 'next/server'

type StarredSegment = {
  id: number
  name: string
  map?: { summary_polyline?: string; polyline?: string }
  elevation_profile?: string
  [key: string]: unknown
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

  const segments = rawSegments.map((segment) => {
    console.log('Segment:', segment.name, 'summary_polyline length:', segment.map?.summary_polyline?.length)
    return {
      ...segment,
      polyline: segment.map?.summary_polyline || segment.map?.polyline || null,
      elevation_profile: segment.elevation_profile || null,
    }
  })

  return NextResponse.json(segments)
}
