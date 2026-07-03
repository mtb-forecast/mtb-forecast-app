import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

interface Dica {
  id: number
  titulo: string
  subtitulo: string
  itens: { emoji: string; texto: string }[]
  rodape?: string | null
}

async function fetchDica(id: number): Promise<{ dica: Dica | null; total: number }> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { dica: null, total: 0 }

  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  const [dicaRes, totalRes] = await Promise.all([
    fetch(`${url}/rest/v1/instagram_dicas?id=eq.${id}&ativo=eq.true&select=id,titulo,subtitulo,itens,rodape`, { headers, cache: 'no-store' }),
    fetch(`${url}/rest/v1/instagram_dicas?ativo=eq.true&select=id`, { headers, cache: 'no-store' }),
  ])

  const rows  = dicaRes.ok  ? await dicaRes.json()  : []
  const all   = totalRes.ok ? await totalRes.json() : []

  return { dica: rows[0] ?? null, total: all.length }
}

function loadFont(filename: string): ArrayBuffer | null {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'fonts', filename))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = parseInt(searchParams.get('id') ?? '1', 10)

    let { dica, total } = await fetchDica(id)

    // fallback: se id não existe, busca o primeiro
    if (!dica) {
      const fallback = await fetchDica(1)
      dica  = fallback.dica
      total = fallback.total
    }

    if (!dica) throw new Error('Nenhuma dica encontrada no banco')

    const notoSans   = loadFont('noto-sans-regular.ttf')
    const dmSansBold = loadFont('dm-sans-800.ttf')
    const dmMono     = loadFont('dm-mono-400.ttf')
    const fontList: { name: string; data: ArrayBuffer; weight: 400 | 800 }[] = []
    if (notoSans)   fontList.push({ name: 'Noto Sans', data: notoSans,   weight: 400 })
    if (dmSansBold) fontList.push({ name: 'DM Sans',   data: dmSansBold, weight: 800 })
    if (dmMono)     fontList.push({ name: 'DM Mono',   data: dmMono,     weight: 400 })

    const fontSans = dmSansBold ? 'DM Sans'  : (notoSans ? 'Noto Sans' : 'sans-serif')
    const fontMono = dmMono     ? 'DM Mono'  : (notoSans ? 'Noto Sans' : 'monospace')

    return new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1080,
            display: 'flex',
            flexDirection: 'column',
            background: '#1e2218',
            paddingTop: 0,
            paddingLeft: 0,
            paddingRight: 0,
            paddingBottom: 0,
            position: 'relative',
          }}
        >
          {/* Faixa verde topo */}
          <div style={{ display: 'flex', height: 5, background: '#a8b899' }} />

          {/* Conteúdo */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              paddingTop: 64,
              paddingLeft: 80,
              paddingRight: 80,
              paddingBottom: 56,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontSize: 24, fontFamily: fontSans, fontWeight: 800, color: '#a8b899', letterSpacing: 3 }}>
                MTB FORECASTER
              </div>
              <div style={{ display: 'flex', fontSize: 20, fontFamily: fontMono, color: 'rgba(168,184,153,0.4)', letterSpacing: 2 }}>
                DICA {String(dica.id).padStart(2, '0')}/{String(total).padStart(2, '0')}
              </div>
            </div>

            {/* Separador */}
            <div style={{ display: 'flex', height: 1, background: 'rgba(168,184,153,0.15)', marginTop: 32 }} />

            {/* Tag */}
            <div style={{ display: 'flex', marginTop: 40 }}>
              <div
                style={{
                  display: 'flex',
                  paddingTop: 8,
                  paddingBottom: 8,
                  paddingLeft: 20,
                  paddingRight: 20,
                  background: 'rgba(168,184,153,0.10)',
                  fontSize: 18,
                  fontFamily: fontSans,
                  fontWeight: 800,
                  color: '#a8b899',
                  letterSpacing: 3,
                }}
              >
                GUIA DO APP
              </div>
            </div>

            {/* Título */}
            <div
              style={{
                display: 'flex',
                fontSize: 72,
                fontFamily: fontSans,
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.1,
                marginTop: 24,
              }}
            >
              {dica.titulo}
            </div>

            {/* Subtítulo */}
            <div
              style={{
                display: 'flex',
                fontSize: 28,
                fontFamily: fontSans,
                fontWeight: 400,
                color: 'rgba(168,184,153,0.6)',
                marginTop: 16,
                lineHeight: 1.4,
              }}
            >
              {dica.subtitulo}
            </div>

            {/* Spacer */}
            <div style={{ display: 'flex', flex: 1 }} />

            {/* Itens */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {dica.itens.map((item, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 20 }}>
                  <div style={{ display: 'flex', fontSize: 32, width: 44, flexShrink: 0 }}>
                    {item.emoji}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 30,
                      fontFamily: fontSans,
                      fontWeight: 400,
                      color: '#e8ede3',
                      lineHeight: 1.35,
                      flex: 1,
                    }}
                  >
                    {item.texto}
                  </div>
                </div>
              ))}
            </div>

            {/* Separador rodapé */}
            <div style={{ display: 'flex', height: 1, background: 'rgba(168,184,153,0.15)', marginTop: 40 }} />

            {/* Rodapé */}
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
              <div style={{ display: 'flex', fontSize: 22, fontFamily: fontMono, color: 'rgba(168,184,153,0.35)' }}>
                mtbforecaster.com.br
              </div>
              {dica.rodape ? (
                <div
                  style={{
                    display: 'flex',
                    fontSize: 18,
                    fontFamily: fontSans,
                    fontWeight: 400,
                    color: 'rgba(168,184,153,0.35)',
                    maxWidth: 500,
                    textAlign: 'right',
                  }}
                >
                  {dica.rodape}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1080, fonts: fontList }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message + '\n' + err.stack : String(err)
    return new Response('OG Dica error: ' + msg, { status: 500 })
  }
}
