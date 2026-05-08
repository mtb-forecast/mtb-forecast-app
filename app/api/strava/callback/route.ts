import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/perfil?strava_error=1', request.url))
  }

  // Troca code por access_token
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

  // Busca segmentos favoritos
  const segRes = await fetch('https://www.strava.com/api/v3/segments/starred?per_page=50', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const rawSegments = segRes.ok ? await segRes.json() : []

  // Filtra segmentos relevantes e reduz payload para a URL
  const segments = (Array.isArray(rawSegments) ? rawSegments : [])
    .filter((s: { kom_rank?: number | null; distance?: number }) =>
      s.kom_rank != null || (s.distance ?? 0) > 500
    )
    .slice(0, 15)
    .map((s: {
      id: number; name: string; distance: number;
      total_elevation_gain: number; start_latlng: number[];
      end_latlng: number[]; city?: string; state?: string; country?: string;
    }) => ({
      id: s.id,
      name: s.name,
      distance: s.distance,
      total_elevation_gain: s.total_elevation_gain,
      start_latlng: s.start_latlng,
      end_latlng: s.end_latlng,
      city: s.city ?? null,
      state: s.state ?? null,
      country: s.country ?? null,
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
