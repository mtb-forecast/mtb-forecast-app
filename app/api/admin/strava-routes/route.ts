import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

type RawSegment = {
  id: number
  name: string
  distance: number
  total_elevation_gain: number
  elevation_high?: number
  elevation_low?: number
  start_latlng?: number[]
  city?: string
  state?: string
  map?: { summary_polyline?: string; polyline?: string }
}

export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const token = request.cookies.get('strava_admin_token')?.value
  if (!token) {
    return NextResponse.json({ error: 'no_token' }, { status: 401 })
  }

  const res = await fetch(
    'https://www.strava.com/api/v3/segments/starred?per_page=50',
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (res.status === 429) {
    return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
  }
  if (res.status === 401) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'strava_error' }, { status: res.status })
  }

  const raw: RawSegment[] = await res.json()

  const segments = (Array.isArray(raw) ? raw : []).map((s) => {
    const desnivel = s.total_elevation_gain > 0
      ? Math.round(s.total_elevation_gain)
      : s.elevation_high != null && s.elevation_low != null
        ? Math.round(s.elevation_high - s.elevation_low)
        : 0

    return {
      strava_segment_id: s.id,
      name: s.name,
      distance_km: +(s.distance / 1000).toFixed(2),
      desnivel_m: desnivel,
      lat: s.start_latlng?.[0] ?? null,
      lon: s.start_latlng?.[1] ?? null,
      city: s.city ?? null,
      state: s.state ?? null,
      polyline: s.map?.polyline || s.map?.summary_polyline || null,
    }
  })

  return NextResponse.json(segments)
}
