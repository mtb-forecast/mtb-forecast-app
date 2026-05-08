import { NextRequest, NextResponse } from 'next/server'

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

  const segments: { id: number }[] = await listRes.json()

  // Busca detalhes de cada segmento em paralelo para obter polyline
  const detailed = await Promise.all(
    segments.map(async (seg) => {
      try {
        const detailRes = await fetch(`https://www.strava.com/api/v3/segments/${seg.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!detailRes.ok) {
          console.log(`Segment ${seg.id} detail fetch failed: ${detailRes.status}`)
          return { ...seg, polyline: null, elevation_profile: null }
        }
        const data = await detailRes.json()
        console.log('Segment detail:', JSON.stringify({
          id: data.id,
          name: data.name,
          map: data.map,
          polyline: data.map?.polyline,
          summary_polyline: data.map?.summary_polyline,
        }))
        return {
          ...seg,
          polyline: data.map?.polyline || data.map?.summary_polyline || null,
          elevation_profile: data.elevation_profile || null,
        }
      } catch {
        return { ...seg, polyline: null, elevation_profile: null }
      }
    })
  )

  return NextResponse.json(detailed)
}
