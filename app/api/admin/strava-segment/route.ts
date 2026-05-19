import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

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

  const segmentId = request.nextUrl.searchParams.get('id')
  if (!segmentId) {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  }

  const res = await fetch(
    `https://www.strava.com/api/v3/segments/${segmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (res.status === 429) {
    return NextResponse.json({ error: 'rate_limit' }, { status: 429 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'strava_error' }, { status: res.status })
  }

  const data = await res.json()
  const polyline: string | null = data.map?.polyline ?? null
  const altitude_m: number | null = data.elevation_high != null ? Math.round(data.elevation_high) : null

  return NextResponse.json({ polyline, altitude_m })
}
