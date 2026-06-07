import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
  }

  try {
    // Segue o redirect (maps.app.goo.gl → URL completa do Google Maps)
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    return NextResponse.json({ resolvedUrl: res.url })
  } catch {
    return NextResponse.json({ error: 'Não foi possível resolver a URL' }, { status: 500 })
  }
}
