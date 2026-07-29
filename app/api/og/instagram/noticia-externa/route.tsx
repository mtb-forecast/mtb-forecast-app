import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

interface Fonte {
  titulo: string
  url: string
}

interface Bullet {
  regiao: string
  texto: string
}

interface NoticiaExterna {
  id: number
  frase_destaque: string
  bullets: Bullet[]
  fontes: Fonte[]
  created_at: string
}

async function fetchNoticia(id: number | null): Promise<NoticiaExterna | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const filtro = id ? `id=eq.${id}&` : ''
  const res = await fetch(
    `${url}/rest/v1/noticias_externas?${filtro}select=id,frase_destaque,bullets,fontes,created_at&order=created_at.desc&limit=1`,
    { headers, cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0] ?? null
}

function loadFont(filename: string): ArrayBuffer | null {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'fonts', filename))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  } catch {
    return null
  }
}

function loadTextureDataUri(filename: string): string | null {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'textures', filename))
    return `data:image/svg+xml;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

const FOREST_800 = '#1e2e1a'
const FOREST_600 = '#2a4a2a'
const FOREST_EDGE = '#21351f'
const MINT_400 = '#86efac'
const SAND_100 = '#fbfbf6'
const MOSS_300 = 'rgba(167,205,167,0.55)'

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit',
  }).format(new Date(iso))
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const idParam = searchParams.get('id')
    const id = idParam ? parseInt(idParam, 10) : null

    const noticia = await fetchNoticia(id)
    if (!noticia) throw new Error('Nenhuma noticia_externa encontrada')

    const notoSans   = loadFont('noto-sans-regular.ttf')
    const dmSansBold = loadFont('dm-sans-800.ttf')
    const dmMono     = loadFont('dm-mono-400.ttf')
    const fontList: { name: string; data: ArrayBuffer; weight: 400 | 800 }[] = []
    if (notoSans)   fontList.push({ name: 'Noto Sans', data: notoSans,   weight: 400 })
    if (dmSansBold) fontList.push({ name: 'DM Sans',   data: dmSansBold, weight: 800 })
    if (dmMono)     fontList.push({ name: 'DM Mono',   data: dmMono,     weight: 400 })

    const fontSans = dmSansBold ? 'DM Sans' : (notoSans ? 'Noto Sans' : 'sans-serif')
    const fontMono = dmMono ? 'DM Mono' : (notoSans ? 'Noto Sans' : 'monospace')

    const topoTexture = loadTextureDataUri('topo-mint.svg')
    const fontes = (noticia.fontes ?? []).slice(0, 4)
    const bullets = (noticia.bullets ?? []).slice(0, 4)

    return new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1920,
            display: 'flex',
            flexDirection: 'column',
            background: `linear-gradient(150deg, ${FOREST_800} 0%, ${FOREST_600} 46%, ${FOREST_EDGE} 100%)`,
            position: 'relative',
          }}
        >
          {topoTexture ? (
            <img
              src={topoTexture}
              width={1080}
              height={1920}
              style={{ position: 'absolute', top: 0, left: 0, opacity: 0.55 }}
            />
          ) : null}

          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1080,
              height: 1920,
              display: 'flex',
              background: `linear-gradient(180deg, rgba(18,25,15,0.18) 0%, rgba(18,25,15,0.05) 26%, rgba(18,25,15,0.38) 62%, rgba(13,16,10,0.74) 100%)`,
            }}
          />

          <div style={{ display: 'flex', height: 5, background: MINT_400, position: 'relative' }} />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              paddingTop: 140,
              paddingLeft: 80,
              paddingRight: 80,
              paddingBottom: 140,
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontSize: 24, fontFamily: fontSans, fontWeight: 800, color: MINT_400, letterSpacing: 3 }}>
                MTB FORECASTER
              </div>
              <div style={{ display: 'flex', fontSize: 20, fontFamily: fontMono, color: MOSS_300, letterSpacing: 2 }}>
                {formatDate(noticia.created_at)}
              </div>
            </div>

            <div style={{ display: 'flex', height: 1, background: 'rgba(167,205,167,0.18)', marginTop: 32 }} />

            <div style={{ display: 'flex', marginTop: 40 }}>
              <div
                style={{
                  display: 'flex',
                  paddingTop: 8,
                  paddingBottom: 8,
                  paddingLeft: 20,
                  paddingRight: 20,
                  background: 'rgba(134,239,172,0.14)',
                  fontSize: 18,
                  fontFamily: fontSans,
                  fontWeight: 800,
                  color: MINT_400,
                  letterSpacing: 3,
                }}
              >
                CLIMA EXTREMO NO BRASIL
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 52,
                fontFamily: fontSans,
                fontWeight: 800,
                color: SAND_100,
                lineHeight: 1.25,
                letterSpacing: -1,
                marginTop: 32,
              }}
            >
              {noticia.frase_destaque}
            </div>

            <div style={{ display: 'flex', flex: 1 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 24 }}>
              {bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', fontSize: 22, fontFamily: fontMono, fontWeight: 400, color: MINT_400, letterSpacing: 2 }}>
                    {b.regiao}
                  </div>
                  <div style={{ display: 'flex', fontSize: 30, fontFamily: fontSans, fontWeight: 400, color: '#eef2ea', lineHeight: 1.3 }}>
                    {b.texto}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', height: 1, background: 'rgba(167,205,167,0.18)', marginBottom: 24 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', fontSize: 16, fontFamily: fontMono, color: MOSS_300, letterSpacing: 2 }}>
                FONTES
              </div>
              {fontes.map((f, i) => (
                <div key={i} style={{ display: 'flex', fontSize: 18, fontFamily: fontSans, color: '#eef2ea' }}>
                  {hostname(f.url)}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
              <div style={{ display: 'flex', fontSize: 22, fontFamily: fontMono, color: MOSS_300 }}>
                mtbforecaster.com.br
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1920, fonts: fontList }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message + '\n' + err.stack : String(err)
    return new Response('OG Noticia Externa error: ' + msg, { status: 500 })
  }
}
