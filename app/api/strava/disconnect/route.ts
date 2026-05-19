export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = cookies()

  cookieStore.delete('strava_access_token')
  cookieStore.delete('strava_refresh_token')

  return NextResponse.json({ success: true })
}
