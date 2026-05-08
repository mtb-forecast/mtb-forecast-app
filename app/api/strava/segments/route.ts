import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('strava_token')?.value

  if (!token) {
    return NextResponse.json({ error: 'Token Strava não encontrado. Reconecte o Strava.' }, { status: 401 })
  }

  const res = await fetch('https://www.strava.com/api/v3/segments/starred?per_page=50', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Erro ao buscar segmentos do Strava.' }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
