import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const redirectUri = `${proto}://${host}/api/strava/callback`
  const scope = 'read,activity:read'
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&approval_prompt=auto`
  return NextResponse.redirect(url)
}
