export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logApiUsage } from '@/lib/api-usage-log'

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
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const token = request.cookies.get('strava_token')?.value
  if (!token) {
    return NextResponse.json({ error: 'Token Strava não encontrado. Reconecte o Strava.' }, { status: 401 })
  }

  const listRes = await fetch('https://www.strava.com/api/v3/segments/starred?per_page=50', {
    headers: { Authorization: `Bearer ${token}` },
  })
  await logApiUsage('strava', 'segments/starred', { sucesso: listRes.ok ? 1 : 0, falhas: listRes.ok ? 0 : 1 })

  if (!listRes.ok) {
    return NextResponse.json({ error: 'Erro ao buscar segmentos do Strava.' }, { status: listRes.status })
  }

  const rawSegments: StarredSegment[] = await listRes.json()

  const segments = rawSegments.map((s) => {
    const polyline = s.map?.summary_polyline || s.map?.polyline || null
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
