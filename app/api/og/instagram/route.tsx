import { createClient } from '@supabase/supabase-js'
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
  localidades: { cidade: string; estado: string } | null,
  regiao: string
): string {
  if (localidades?.cidade && localidades?.estado) return `${localidades.cidade} — ${localidades.estado}`
  if (localidades?.cidade) return localidades.cidade
  if (localidades?.estado) return localidades.estado
  return regiao ?? ''
}

function trailNameFontSize(name: string): number {
  if (name.length <= 6) return 140
  if (name.length <= 12) return 100
  if (name.length <= 20) return 72
  return 56
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const trilhaId = searchParams.get('trilha_id')

  if (!trilhaId) {
    return new Response('trilha_id required', { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [trilhaRes, condicaoRes] = await Promise.all([
    supabase
      .from('trilhas')
      .select('name, trail_type, regiao, localidades(cidade, estado)')
      .eq('id', trilhaId)
      .single(),
    supabase
      .from('condicoes')
      .select('veredicto, veredicto_12h, aderencia_status, rain_mm, wind_ms, temp_max, pop_48h')
      .eq('trilha_id', trilhaId)
      .single(),
  ])

  if (trilhaRes.error || !trilhaRes.data) {
    return new Response('Trilha não encontrada', { status: 404 })
  }
  if (condicaoRes.error || !condicaoRes.data) {
    return new Response('Condição não encontrada', { status: 404 })
  }

  const trilha = trilhaRes.data
  const condicao = condicaoRes.data

  // Fonts
  let dmSansBold: ArrayBuffer | null = null
  let dmMono: ArrayBuffer | null = null

  try {
    ;[dmSansBold, dmMono] = await Promise.all([
      fetch('https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-800-normal.woff').then(r => r.arrayBuffer()),
      fetch('https://cdn.jsdelivr.net/fontsource/fonts/dm-mono@latest/latin-400-normal.woff').then(r => r.arrayBuffer()),
    ])
  } catch {
    try {
      ;[dmSansBold, dmMono] = await Promise.all([
        fetch('https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwA.ttf').then(r => r.arrayBuffer()),
        fetch('https://fonts.gstatic.com/s/dmmono/v14/aFTU7PB1QTsUX8KYhh2aBYyMcKw.ttf').then(r => r.arrayBuffer()),
      ])
    } catch {
      // sem fontes custom, Satori usará sans-serif
    }
  }

  const categoria = bgCategoria(condicao.rain_mm, condicao.pop_48h)
  const bg = bgUrl(categoria)
  const verdict = verdictDisplay(condicao.veredicto)
  const localidadesRaw = trilha.localidades
  const localidade = Array.isArray(localidadesRaw)
    ? (localidadesRaw[0] as { cidade: string; estado: string } | undefined) ?? null
    : (localidadesRaw as { cidade: string; estado: string } | null)
  const location = formatLocation(localidade, trilha.regiao)
  const nameSize = trailNameFontSize(trilha.name ?? '')
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  const tempLabel = condicao.temp_max != null ? `${Math.round(condicao.temp_max)}°` : '—'
  const rainLabel = condicao.rain_mm != null ? `${condicao.rain_mm.toFixed(1)}mm` : '—'
  const windLabel = condicao.wind_ms != null ? `${condicao.wind_ms.toFixed(1)}m/s` : '—'

  const aderenciaLabel = (() => {
    const s = condicao.aderencia_status
    if (!s) return ''
    if (s === 'SECO') return 'Solo Seco'
    if (s === 'PERFEITO') return 'Grip Perfeito'
    if (s === 'BOM') return 'Bom Grip'
    if (s === 'LAMA') return 'Solo Enlameado'
    if (s === 'BAIXA') return 'Baixa Aderência'
    return s
  })()

  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 800 }[] = []
  if (dmSansBold) fonts.push({ name: 'DM Sans', data: dmSansBold, weight: 800 })
  if (dmMono) fonts.push({ name: 'DM Mono', data: dmMono, weight: 400 })

  const fontSans = dmSansBold ? 'DM Sans' : 'sans-serif'
  const fontMono = dmMono ? 'DM Mono' : 'monospace'

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          background: '#2a2e25',
        }}
      >
        {/* Background image blurred */}
        <img
          src={bg}
          style={{
            position: 'absolute',
            top: -40,
            left: -40,
            width: 1160,
            height: 1160,
            objectFit: 'cover',
            filter: 'blur(50px) saturate(0.65) brightness(0.85)',
          }}
        />

        {/* Dark overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(42,46,37,0.87)',
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

        {/* Content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '56px 72px 52px',
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 48,
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

          {/* Modality label */}
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              fontFamily: fontSans,
              fontWeight: 700,
              letterSpacing: 4,
              color: '#a8b899',
              marginBottom: 20,
              textTransform: 'uppercase',
            }}
          >
            TRILHA DE MOUNTAIN BIKE
          </div>

          {/* Trail name */}
          <div
            style={{
              display: 'flex',
              fontSize: nameSize,
              fontFamily: fontSans,
              fontWeight: 800,
              color: '#fff',
              lineHeight: 0.9,
              letterSpacing: -3,
              marginBottom: 28,
              maxWidth: 900,
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
                marginBottom: 52,
              }}
            >
              📍 {location}
            </div>
          ) : (
            <div style={{ display: 'flex', marginBottom: 52 }} />
          )}

          {/* Verdict badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              marginBottom: 48,
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '14px 32px',
                borderRadius: 12,
                background: verdict.bg,
                border: `1.5px solid ${verdict.border}`,
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
                  padding: '14px 28px',
                  borderRadius: 12,
                  background: 'rgba(168,184,153,0.08)',
                  border: '1.5px solid rgba(168,184,153,0.12)',
                  fontSize: 24,
                  fontFamily: fontSans,
                  fontWeight: 600,
                  color: 'rgba(168,184,153,0.7)',
                  letterSpacing: 0.5,
                }}
              >
                {aderenciaLabel}
              </div>
            ) : null}
          </div>

          {/* Metrics grid — 3 columns via flex */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 2,
              borderRadius: 20,
              overflow: 'hidden',
              background: 'rgba(168,184,153,0.08)',
            }}
          >
            {/* Temperatura */}
            <div
              style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                alignItems: 'center',
                padding: '32px 24px',
                background: 'rgba(42,46,37,0.65)',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', fontSize: 28 }}>🌡</div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 40,
                  fontFamily: fontMono,
                  color: '#fff',
                  fontWeight: 400,
                }}
              >
                {tempLabel}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 18,
                  fontFamily: fontSans,
                  fontWeight: 700,
                  color: 'rgba(168,184,153,0.35)',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                MÁXIMA
              </div>
            </div>

            {/* Chuva */}
            <div
              style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                alignItems: 'center',
                padding: '32px 24px',
                background: 'rgba(42,46,37,0.65)',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', fontSize: 28 }}>💧</div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 40,
                  fontFamily: fontMono,
                  color: '#fff',
                  fontWeight: 400,
                }}
              >
                {rainLabel}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 18,
                  fontFamily: fontSans,
                  fontWeight: 700,
                  color: 'rgba(168,184,153,0.35)',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                CHUVA 24H
              </div>
            </div>

            {/* Vento */}
            <div
              style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                alignItems: 'center',
                padding: '32px 24px',
                background: 'rgba(42,46,37,0.65)',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', fontSize: 28 }}>💨</div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 40,
                  fontFamily: fontMono,
                  color: '#fff',
                  fontWeight: 400,
                }}
              >
                {windLabel}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 18,
                  fontFamily: fontSans,
                  fontWeight: 700,
                  color: 'rgba(168,184,153,0.35)',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                VENTO
              </div>
            </div>
          </div>

          {/* Spacer */}
          <div style={{ display: 'flex', flex: 1 }} />

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 22,
                fontFamily: fontMono,
                color: 'rgba(168,184,153,0.35)',
              }}
            >
              mtbforecaster.com.br
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 18,
                fontFamily: fontSans,
                fontWeight: 700,
                color: 'rgba(168,184,153,0.2)',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              DADOS EM TEMPO REAL
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts,
    }
  )
}
