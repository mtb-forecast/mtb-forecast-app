import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  const redirectUri = process.env.NEXT_PUBLIC_STRAVA_REDIRECT_URI
  const scope = 'read,activity:read'
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&approval_prompt=auto`
  return NextResponse.redirect(url)
}
