export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = cookies()
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
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.redirect(new URL('/perfil', request.url))

  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/perfil?strava_error=1', request.url))
  }

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/perfil?strava_error=1', request.url))
  }

  const tokenData = await tokenRes.json()
  const accessToken: string = tokenData.access_token

  const segRes = await fetch('https://www.strava.com/api/v3/segments/starred?per_page=50', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const rawSegments = segRes.ok ? await segRes.json() : []

  const segments = (Array.isArray(rawSegments) ? rawSegments : [])
    .filter((s: { kom_rank?: number | null; distance?: number }) =>
      s.kom_rank != null || (s.distance ?? 0) > 500
    )
    .slice(0, 15)
    .map((s: {
      id: number; name: string; distance: number;
      total_elevation_gain: number; elevation_high?: number;
      start_latlng: number[]; end_latlng: number[];
      city?: string; state?: string; country?: string;
      map?: { summary_polyline?: string; polyline?: string };
      elevation_profile?: string;
    }) => ({
      id: s.id,
      name: s.name,
      distance: s.distance,
      total_elevation_gain: s.total_elevation_gain,
      elevation_high: s.elevation_high ?? null,
      start_latlng: s.start_latlng,
      end_latlng: s.end_latlng,
      city: s.city ?? null,
      state: s.state ?? null,
      country: s.country ?? null,
      polyline: s.map?.summary_polyline || s.map?.polyline || null,
      elevation_profile: s.elevation_profile || null,
    }))

  const redirectUrl = new URL('/perfil/strava', request.url)
  redirectUrl.searchParams.set('segments', JSON.stringify(segments))

  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set('strava_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600,
    path: '/',
  })

  return response
}
