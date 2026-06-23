import { ImageResponse } from 'next/og'
import { unstable_after as after, NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

// Node.js runtime — WASM do Satori é mais estável fora do Edge Runtime
export const dynamic = 'force-dynamic'

function bgCategoria(rain: number | null, pop: number | null): string {
  const r = rain ?? 0
  const p = pop ?? 0
  if (r >= 15 || (r >= 10 && p >= 70)) return 'tempestade'
  if (r >= 5 || p > 60) return 'chuva'
  if (r >= 0.5 || p >= 35) return 'garoa'
  if (p >= 20) return 'nublado'
  return 'sol'
}

function verdictDisplay(v: string | null) {
  if (!v) return { label: 'SEM DADOS', color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
  const u = v.toUpperCase()
  if (u.includes('ESPERAR') || u.includes('EVITAR'))
    return { label: v.toUpperCase(), color: '#FCA5A5', bg: 'rgba(239,68,68,0.12)' }
  if (u.includes('ALERTA') || u.includes('ALERTAS'))
    return { label: v.toUpperCase(), color: '#FBBF24', bg: 'rgba(245,158,11,0.12)' }
  if (u.includes('LIBERADO'))
    return { label: v.toUpperCase(), color: '#4ADE80', bg: 'rgba(34,197,94,0.12)' }
  return { label: v.toUpperCase(), color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
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

function bgUrl(categoria: string): string {
  const counts: Record<string, number> = { chuva: 2, garoa: 1, nublado: 1, sol: 1, tempestade: 1 }
  const max = counts[categoria] ?? 1
  const n = Math.floor(Math.random() * max) + 1
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/storage/v1/object/public/instagram-bg/${categoria}_${n}.png`
}

function trailNameFontSize(name: string): number {
  if (name.length <= 6) return 140
  if (name.length <= 12) return 100
  if (name.length <= 20) return 72
  return 56
}

// ─── Geração on-demand via Pollinations ──────────────────────────────────────

const BIOMA_EN: Record<string, string> = {
  'Mata Atlântica': 'Atlantic Forest, dense tropical rainforest, mossy rocks, red clay soil, towering trees',
  'Cerrado':        'Brazilian Cerrado savanna, twisted gnarled trees, red laterite soil, dry golden grass',
  'Amazônia':       'Amazon rainforest, impossibly dense jungle, giant buttress roots, 40-meter canopy',
  'Caatinga':       'Caatinga semi-arid scrubland, thorny cacti, leafless white-barked trees, limestone rocks',
  'Pampa':          'Southern Pampa, rolling green hills, golden grass, wide open sky, minimal trees',
  'Pantanal':       'Pantanal wetlands, flooded tropical forest, palm trees, vast flat landscape',
}

const CATEGORIA_EN: Record<string, string> = {
  sol:        'bright sunny weather, golden light, clear blue sky',
  nublado:    'overcast grey sky, flat diffused light, moody atmosphere',
  garoa:      'persistent light drizzle, fine mist, glistening wet surfaces, cool blue-grey light',
  chuva:      'heavy rainfall, rain streaks in air, puddles, dark dramatic sky',
  tempestade: 'violent thunderstorm, lightning bolts, torrential rain, apocalyptic dark clouds',
}

const SOLO_EN: Record<string, string> = {
  terra:    'red clay dirt trail',
  rocha:    'rocky terrain, exposed granite slabs and boulders',
  misto:    'mixed dirt and rock surface with embedded roots',
  misto_mg: 'iron-rich red soil mixed with quartzite slabs',
  ferro:    'iron-rich reddish-brown soil of Quadrilátero Ferrífero',
  preto:    'dark volcanic black soil trail',
}

function buildTrailPrompt(
  bioma: string | null,
  exposicao: string | null,
  soloType: string | null,
  altitudeM: number | null,
  categoria: string,
  veredicto: string | null,
): string {
  const biomaDesc = BIOMA_EN[bioma ?? ''] ?? BIOMA_EN['Mata Atlântica']
  const catDesc   = CATEGORIA_EN[categoria] ?? CATEGORIA_EN['sol']
  const soloDesc  = SOLO_EN[soloType ?? ''] ?? SOLO_EN['terra']
  const expDesc   = exposicao === 'aberta'
    ? 'exposed open ridgeline, panoramic mountain views'
    : exposicao === 'fechada'
    ? 'fully enclosed by dense canopy, green tunnel of trees'
    : 'alternating forest and open sections'
  const altDesc = altitudeM && altitudeM >= 1200
    ? `high altitude ${altitudeM}m, cloud forest, misty peaks`
    : altitudeM && altitudeM >= 700
    ? `mid-altitude mountain terrain ${altitudeM}m`
    : ''
  const condDesc = veredicto?.toUpperCase().includes('ESPERAR') || veredicto?.toUpperCase().includes('EVITAR')
    ? 'trail closed due to dangerous wet conditions'
    : veredicto?.toUpperCase().includes('ALERTA')
    ? 'trail open with caution, partially wet terrain'
    : 'trail in good condition'

  return [
    'Cinematic photorealistic aerial-perspective photograph of a mountain bike singletrack trail cutting through wilderness.',
    `Biome: ${biomaDesc}.`,
    `Trail surface: narrow dirt singletrack, ${soloDesc}, winding path through vegetation, ${expDesc}.`,
    altDesc ? `Elevation: ${altDesc}.` : '',
    `Atmosphere: ${catDesc}.`,
    `Condition: ${condDesc}.`,
    'NO rivers. NO water. NO lakes. NO streams. NO bridges. NO roads. NO people. NO bikes. NO text. NO logos. NO buildings.',
    'The trail is the main subject — a winding singletrack path visible through the landscape.',
    'Dramatic side lighting, dark moody shadows in corners, bright center, perfect for white text overlay.',
    'Ultra wide angle, square 1:1 format. Brazil, South America.',
  ].filter(Boolean).join(' ')
}

function trailBgStorageUrl(trilhaId: string, categoria: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/instagram-bg/${trilhaId}_${categoria}.jpg`
}

async function generateAndUploadTrailBg(trilhaId: string, categoria: string, prompt: string): Promise<void> {
  const storageKey = `${trilhaId}_${categoria}.jpg`
  try {
    // Gera via Pollinations (Flux) — gratuito, sem API key
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true&model=flux&seed=${trilhaId.charCodeAt(0) + trilhaId.charCodeAt(4)}`
    const imgRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(90_000) })
    if (!imgRes.ok) return

    const imgBuf = await imgRes.arrayBuffer()

    // Upload para Supabase Storage (trail-og bucket, público)
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/instagram-bg/${storageKey}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: imgBuf,
      }
    )
  } catch { /* falha silenciosa — próxima requisição tentará novamente */ }
}

// ─────────────────────────────────────────────────────────────────────────────

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
    const trilhaId = searchParams.get('trilha_id')

    // Fontes carregadas via fs — confiável no runtime Node.js
    const notoSans = loadFont('noto-sans-regular.ttf')
    const dmSansBold = loadFont('dm-sans-800.ttf')
    const dmMono = loadFont('dm-mono-400.ttf')
    const fontList: { name: string; data: ArrayBuffer; weight: 400 | 800 }[] = []
    if (notoSans) fontList.push({ name: 'Noto Sans', data: notoSans, weight: 400 })
    if (dmSansBold) fontList.push({ name: 'DM Sans', data: dmSansBold, weight: 800 })
    if (dmMono) fontList.push({ name: 'DM Mono', data: dmMono, weight: 400 })

    const fontSans = dmSansBold ? 'DM Sans' : (notoSans ? 'Noto Sans' : 'sans-serif')
    const fontMono = dmMono ? 'DM Mono' : (notoSans ? 'Noto Sans' : 'monospace')

    if (!trilhaId) {
      return new Response('trilha_id required', { status: 400 })
    }

    const [trilha, condicao] = await Promise.all([
      fetchSupabase<{
        name: string
        regiao: string
        bioma: string | null
        exposicao: string | null
        solo_type: string | null
        altitude_m: number | null
        localidades: { cidade: string; estado: string } | { cidade: string; estado: string }[] | null
      }>(
        'trilhas',
        'name,regiao,bioma,exposicao,solo_type,altitude_m,localidades(cidade,estado)',
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

    const categoria = bgCategoria(condicao.rain_mm, condicao.pop_48h)

    // Tenta imagem gerada on-demand para esta trilha + categoria de tempo.
    // Se não existir: usa fallback estático e dispara geração em background com after().
    const trailBgUrl  = trailBgStorageUrl(trilhaId, categoria)
    const staticBgUrl = bgUrl(categoria)

    let bgDataUrl: string | null = null
    let trailBgExists = false

    for (const src of [trailBgUrl, staticBgUrl]) {
      try {
        const res = await fetch(src)
        if (!res.ok) continue
        const buf = await res.arrayBuffer()
        const bytes = new Uint8Array(buf.slice(0, 4))
        const isPng  = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
        const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
        const mime = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : 'image/png'
        bgDataUrl = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
        if (src === trailBgUrl) trailBgExists = true
        break
      } catch { /* tenta próximo candidato */ }
    }

    // Se a imagem personalizada ainda não existe, gera em background após responder
    if (!trailBgExists && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const prompt = buildTrailPrompt(
        trilha.bioma ?? null,
        trilha.exposicao ?? null,
        trilha.solo_type ?? null,
        trilha.altitude_m ?? null,
        categoria,
        condicao.veredicto,
      )
      after(() => generateAndUploadTrailBg(trilhaId, categoria, prompt))
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1080,
            display: 'flex',
            position: 'relative',
            background: '#1e2218',
          }}
        >
          {/* Background photo — display:flex obrigatorio no Satori */}
          {bgDataUrl ? (
            <img
              src={bgDataUrl}
              style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: 1080, height: 1080 }}
            />
          ) : null}

          {/* Dark overlay */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(10,14,8,0.62)',
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
              }}
            >
              <div style={{ display: 'flex', fontSize: 24, fontFamily: fontSans, fontWeight: 800, color: '#a8b899', letterSpacing: 3 }}>
                MTB FORECASTER
              </div>
              <div style={{ display: 'flex', fontSize: 22, fontFamily: fontMono, color: 'rgba(168,184,153,0.5)' }}>
                {dateStr}
              </div>
            </div>

            {/* Trail label */}
            <div style={{ display: 'flex', fontSize: 22, fontFamily: fontSans, fontWeight: 700, letterSpacing: 4, color: '#a8b899', marginTop: 40 }}>
              TRILHA DE MOUNTAIN BIKE
            </div>

            {/* Trail name */}
            <div
              style={{
                display: 'flex',
                fontSize: nameSize,
                fontFamily: fontSans,
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.1,
                letterSpacing: 0,
                marginTop: 16,
              }}
            >
              {trilha.name ?? ''}
            </div>

            {/* Location */}
            <div style={{ display: 'flex', fontSize: 28, fontFamily: fontSans, fontWeight: 400, color: 'rgba(168,184,153,0.6)', marginTop: 16 }}>
              {location}
            </div>

            {/* Spacer */}
            <div style={{ display: 'flex', flex: 1 }} />

            {/* Verdict + aderencia */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 44 }}>
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
                    fontWeight: 400,
                    color: 'rgba(168,184,153,0.7)',
                  }}
                >
                  {aderenciaLabel}
                </div>
              ) : null}
            </div>

            {/* Metrics — 3 columns */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{tempLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 6 }}>MAXIMA</div>
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{rainLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 6 }}>CHUVA 24H</div>
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{windLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 6 }}>VENTO</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32 }}>
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
      { width: 1080, height: 1080, fonts: fontList }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message + '\n' + err.stack : String(err)
    return new Response('OG error: ' + msg, { status: 500 })
  }
}
