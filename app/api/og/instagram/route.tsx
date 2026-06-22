import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

function bgCategoria(rain: number | null, pop: number | null): string {
  const r = rain ?? 0
  const p = pop ?? 0
  if (r >= 15 || (r >= 10 && p >= 70)) return 'tempestade'
  if (r >= 5 || p > 60) return 'chuva'
  if (r >= 0.5 || p >= 35) return 'garoa'
  if (p >= 20) return 'nublado'
  return 'sol'
}

function bgUrl(categoria: string): string {
  const n = Math.floor(Math.random() * 3) + 1
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/storage/v1/object/public/instagram-bg/${categoria}_${n}.jpg`
}

function verdictDisplay(v: string | null) {
  if (!v) return { label: 'SEM DADOS', color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.2)' }
  if (v.trim() === 'DROP LIBERADO')
    return { label: 'DROP LIBERADO', color: '#4ADE80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.2)' }
  if (v.includes('Veja os alertas'))
    return { label: 'VEJA OS ALERTAS', color: '#FBBF24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.2)' }
  if (v.includes('MELHOR ESPERAR'))
    return { label: 'MELHOR ESPERAR', color: '#FCA5A5', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.2)' }
  return { label: v.toUpperCase(), color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.2)' }
}

function formatLocation(
  cidade: string | null,
  estado: string | null,
  regiao: string | null
): string {
  if (cidade && estado) return `${cidade} — ${estado}`
  if (cidade) return cidade
  if (estado) return estado
  return regiao ?? ''
}

function trailNameFontSize(name: string): number {
  if (name.length <= 6) return 140
  if (name.length <= 12) return 100
  if (name.length <= 20) return 72
  return 56
}

async function fetchSupabase<T>(table: string, select: string, filter: string): Promise<T | null> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&${filter}&limit=1`
  const res = await fetch(url, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) return null
  const data = await res.json() as T[]
  return data[0] ?? null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const trilhaId = searchParams.get('trilha_id')

    if (!trilhaId) {
      return new Response('trilha_id required', { status: 400 })
    }

    const [trilha, condicao] = await Promise.all([
      fetchSupabase<{
        name: string
        regiao: string
        localidades: { cidade: string; estado: string } | { cidade: string; estado: string }[] | null
      }>(
        'trilhas',
        'name,regiao,localidades(cidade,estado)',
        `id=eq.${trilhaId}`
      ),
      fetchSupabase<{
        veredicto: string | null
        aderencia_status: string | null
        rain_mm: number | null
        wind_ms: number | null
        temp_max: number | null
        pop_48h: number | null
      }>(
        'condicoes',
        'veredicto,aderencia_status,rain_mm,wind_ms,temp_max,pop_48h',
        `trilha_id=eq.${trilhaId}`
      ),
    ])

    if (!trilha) return new Response('Trilha nao encontrada', { status: 404 })
    if (!condicao) return new Response('Condicao nao encontrada', { status: 404 })


    // Fonts disabled for now to isolate crash
    const dmSansBold: ArrayBuffer | null = null
    const dmMono: ArrayBuffer | null = null

    const categoria = bgCategoria(condicao.rain_mm, condicao.pop_48h)
    const bg = bgUrl(categoria)
    const verdict = verdictDisplay(condicao.veredicto)

    const loc = trilha.localidades
    const locObj = Array.isArray(loc) ? (loc[0] ?? null) : loc
    const location = formatLocation(locObj?.cidade ?? null, locObj?.estado ?? null, trilha.regiao)

    const nameSize = trailNameFontSize(trilha.name ?? '')
    const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

    const tempLabel = condicao.temp_max != null ? `${Math.round(condicao.temp_max)} C` : '--'
    const rainLabel = condicao.rain_mm != null ? `${condicao.rain_mm.toFixed(1)}mm` : '--'
    const windLabel = condicao.wind_ms != null ? `${condicao.wind_ms.toFixed(1)}m/s` : '--'

    const aderenciaLabel = (() => {
      const s = condicao.aderencia_status
      if (!s) return ''
      if (s === 'SECO') return 'Solo Seco'
      if (s === 'PERFEITO') return 'Grip Perfeito'
      if (s === 'BOM') return 'Bom Grip'
      if (s === 'LAMA') return 'Solo Enlameado'
      if (s === 'BAIXA') return 'Baixa Aderencia'
      return s
    })()

    const fonts: { name: string; data: ArrayBuffer; weight: 400 | 800 }[] = []
    if (dmSansBold) fonts.push({ name: 'DM Sans', data: dmSansBold, weight: 800 })
    if (dmMono) fonts.push({ name: 'DM Mono', data: dmMono, weight: 400 })

    const fontSans = dmSansBold ? 'DM Sans' : 'sans-serif'
    const fontMono = dmMono ? 'DM Mono' : 'monospace'

    // Satori (ImageResponse) limitations vs standard CSS:
    // - NO inset shorthand: use top/left/right/bottom separately
    // - NO filter on <img>: overlay handles darkness
    // - NO objectFit on absolute img: just size it
    // - NO lineHeight < 1: use 1.1 minimum
    // - NO negative letterSpacing: use 0 minimum
    // - NO textTransform: write strings uppercase directly
    // - gap IS supported

    return new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1080,
            display: 'flex',
            position: 'relative',
            background: '#2a2e25',
          }}
        >
          {/* Dark background — img disabled until bucket is populated */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: '#1e2218',
              display: 'flex',
            }}
          />

          {/* Top stripe */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: '#a8b899',
              display: 'flex',
            }}
          />

          {/* Main content */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              paddingTop: 56,
              paddingLeft: 72,
              paddingRight: 72,
              paddingBottom: 52,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 40,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: 24,
                  fontFamily: fontSans,
                  fontWeight: 800,
                  color: '#a8b899',
                  letterSpacing: 3,
                }}
              >
                MTB FORECASTER
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 22,
                  fontFamily: fontMono,
                  color: 'rgba(168,184,153,0.5)',
                }}
              >
                {dateStr}
              </div>
            </div>

            {/* Modality */}
            <div
              style={{
                display: 'flex',
                fontSize: 22,
                fontFamily: fontSans,
                fontWeight: 700,
                letterSpacing: 4,
                color: '#a8b899',
                marginBottom: 16,
              }}
            >
              TRILHA DE MOUNTAIN BIKE
            </div>

            {/* Trail name — no negative letterSpacing, lineHeight >= 1 */}
            <div
              style={{
                display: 'flex',
                fontSize: nameSize,
                fontFamily: fontSans,
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.1,
                letterSpacing: 0,
                marginBottom: 24,
              }}
            >
              {trilha.name ?? ''}
            </div>

            {/* Location */}
            {location ? (
              <div
                style={{
                  display: 'flex',
                  fontSize: 28,
                  fontFamily: fontSans,
                  fontWeight: 500,
                  color: 'rgba(168,184,153,0.6)',
                  marginBottom: 44,
                }}
              >
                {location}
              </div>
            ) : (
              <div style={{ display: 'flex', height: 44, marginBottom: 44 }} />
            )}

            {/* Verdict + aderencia */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                marginBottom: 44,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  paddingTop: 14,
                  paddingBottom: 14,
                  paddingLeft: 32,
                  paddingRight: 32,
                  background: verdict.bg,
                  fontSize: 26,
                  fontFamily: fontSans,
                  fontWeight: 700,
                  color: verdict.color,
                  letterSpacing: 1,
                }}
              >
                {verdict.label}
              </div>
              {aderenciaLabel ? (
                <div
                  style={{
                    display: 'flex',
                    paddingTop: 14,
                    paddingBottom: 14,
                    paddingLeft: 28,
                    paddingRight: 28,
                    background: 'rgba(168,184,153,0.08)',
                    fontSize: 24,
                    fontFamily: fontSans,
                    fontWeight: 600,
                    color: 'rgba(168,184,153,0.7)',
                  }}
                >
                  {aderenciaLabel}
                </div>
              ) : null}
            </div>

            {/* Metrics — 3 columns */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: 2, background: 'rgba(168,184,153,0.06)' }}>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, paddingLeft: 20, paddingRight: 20, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{tempLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)' }}>MAXIMA</div>
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, paddingLeft: 20, paddingRight: 20, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{rainLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)' }}>CHUVA 24H</div>
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, paddingLeft: 20, paddingRight: 20, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{windLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)' }}>VENTO</div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', fontSize: 22, fontFamily: fontMono, color: 'rgba(168,184,153,0.35)' }}>
                mtbforecaster.com.br
              </div>
              <div style={{ display: 'flex', fontSize: 18, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.2)', letterSpacing: 2 }}>
                DADOS EM TEMPO REAL
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1080, fonts }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message + '\n' + err.stack : String(err)
    return new Response('OG error: ' + msg, { status: 500 })
  }
}
