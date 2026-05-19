import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      new URL('/admin/importar-strava?erro=acesso_negado', request.url)
    )
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
    return NextResponse.redirect(
      new URL('/admin/importar-strava?erro=token', request.url)
    )
  }

  const { access_token } = await tokenRes.json()

  const response = NextResponse.redirect(
    new URL('/admin/importar-strava', request.url)
  )
  response.cookies.set('strava_admin_token', access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 21600, // 6h
    path: '/',
  })

  return response
}
