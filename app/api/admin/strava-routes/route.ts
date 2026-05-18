import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

type RawRoute = {
  id: number
  name: string
  distance: number
  elevation_gain: number
  start_latlng?: number[]
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
    'https://www.strava.com/api/v3/athlete/routes?per_page=50',
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

  const raw: RawRoute[] = await res.json()

  const routes = (Array.isArray(raw) ? raw : []).map((r) => ({
    id: r.id,
    name: r.name,
    distance_km: +(r.distance / 1000).toFixed(2),
    desnivel_m: Math.round(r.elevation_gain),
    lat: r.start_latlng?.[0] ?? null,
    lon: r.start_latlng?.[1] ?? null,
    polyline: r.map?.polyline || r.map?.summary_polyline || null,
  }))

  return NextResponse.json(routes)
}
