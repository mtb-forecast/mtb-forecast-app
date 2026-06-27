import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

function bgCategoria(rain: number | null, pop12h: number | null): string {
  const r = rain ?? 0
  const p = pop12h ?? 0
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

function formatLocation(cidade: string | null, estado: string | null, regiao: string | null): string {
  if (cidade && estado) return `${cidade} — ${estado}`
  if (cidade) return cidade
  if (estado) return estado
  return regiao ?? ''
}

function trailNameFontSize(name: string): number {
  if (name.length <= 6) return 160
  if (name.length <= 12) return 120
  if (name.length <= 20) return 90
  return 68
}

type Paisagem = 'mata' | 'cerrado' | 'montanha'

function landscapeType(bioma: string | null): Paisagem {
  if (!bioma) return 'cerrado'
  const b = bioma.toLowerCase()
  if (b.includes('atlântica') || b.includes('atlantica') || b.includes('amazônia') || b.includes('amazonia')) return 'mata'
  if (b.includes('serra') || b.includes('campo') || b.includes('rupestre') || b.includes('araucária') || b.includes('araucaria')) return 'montanha'
  return 'cerrado'
}

const NEG = 'people, person, human, cyclist, bicycle, bike, rider, athlete, man, woman, child'

const PROMPTS: Record<string, Record<Paisagem, string>> = {
  sol: {
    mata:     'Low-angle drone shot of a narrow mountain bike singletrack cutting through dense Brazilian Atlantic forest, exposed roots and berms visible on the dirt trail, golden sunlight breaking through tropical tree canopy, vivid green lush vegetation, warm afternoon light rays, cinematic depth of field, ultra-realistic, no people, no bikes.',
    cerrado:  'Low-angle drone shot of a mountain bike singletrack winding through Brazilian cerrado savanna, red laterite dirt trail with rocky sections and natural berms, twisted cerrado trees and shrubs on both sides, bright sunny blue sky, warm golden light on red earth, cinematic ultra-realistic, no people, no bikes.',
    montanha: 'Low-angle drone shot of a technical mountain bike trail along a dramatic Brazilian mountain escarpment, rocky singletrack with exposed granite and natural drops, alpine meadows and cliff faces in background, bright sunny sky, spectacular highland panorama, cinematic ultra-realistic, no people, no bikes.',
  },
  nublado: {
    mata:     'Low-angle drone shot of a narrow mountain bike singletrack through dense Brazilian Atlantic forest, exposed roots and berms on damp dirt trail, overcast grey sky filtering soft diffuse light through green canopy, cool misty forest atmosphere, cinematic ultra-realistic, no people, no bikes.',
    cerrado:  'Low-angle drone shot of a mountain bike singletrack through Brazilian cerrado savanna, red dirt trail with rocky features, twisted cerrado trees under an overcast grey sky, cool desaturated light, calm cloudy atmosphere, cinematic ultra-realistic, no people, no bikes.',
    montanha: 'Low-angle drone shot of a rocky mountain bike trail along Brazilian highland escarpments, technical singletrack with exposed stones, alpine meadows with low grey clouds clinging to mountain tops, cool misty highland atmosphere, cinematic ultra-realistic, no people, no bikes.',
  },
  garoa: {
    mata:     'Low-angle drone shot of a mountain bike singletrack through Brazilian Atlantic forest in fine drizzle, wet exposed roots and glistening berms on muddy trail, misty humid atmosphere between the trees, fine rain visible in the air, dark green wet canopy, cinematic ultra-realistic, no people, no bikes.',
    cerrado:  'Low-angle drone shot of a mountain bike trail through Brazilian cerrado in drizzle, wet red dirt singletrack with damp rocky features, fine mist and light rain, cerrado trees with wet foliage, humid grey-green atmosphere, cinematic ultra-realistic, no people, no bikes.',
    montanha: 'Low-angle drone shot of a technical mountain bike trail on Brazilian mountain escarpment in drizzle, wet rocky singletrack with mist rolling across highland meadows, low clouds around peaks, rain-slicked stones glistening, dramatic foggy atmosphere, cinematic ultra-realistic, no people, no bikes.',
  },
  chuva: {
    mata:     'Low-angle drone shot of a mountain bike singletrack in Brazilian Atlantic forest during heavy rain, muddy trail with puddles and waterlogged roots visible, rain drops hitting wet leaves and dark soil, streams forming on the trail, dark stormy canopy, cinematic ultra-realistic, no people, no bikes.',
    cerrado:  'Low-angle drone shot of a mountain bike trail through Brazilian cerrado in heavy rain, muddy red singletrack with large puddles, wet cerrado shrubs bending in the rain, dark grey stormy sky, dramatic rainy day atmosphere, cinematic ultra-realistic, no people, no bikes.',
    montanha: 'Low-angle drone shot of a rocky mountain bike trail on Brazilian highland in heavy rain, waterlogged singletrack with water running over exposed rocks, dark storm clouds over mountain peaks, waterfalls visible on cliffs, dramatic wet mountain atmosphere, cinematic ultra-realistic, no people, no bikes.',
  },
  tempestade: {
    mata:     'Low-angle drone shot of a mountain bike singletrack through Brazilian Atlantic forest in violent storm, flooded muddy trail with debris and standing water, trees bending in strong wind, dramatic dark storm sky with distant lightning above the canopy, intense cinematic atmosphere, ultra-realistic, no people, no bikes.',
    cerrado:  'Low-angle drone shot of a mountain bike trail through Brazilian cerrado in violent storm, eroded muddy singletrack with running water, cerrado trees bending in strong wind, dramatic lightning in dark stormy sky, powerful cinematic storm atmosphere, ultra-realistic, no people, no bikes.',
    montanha: 'Low-angle drone shot of a rocky mountain bike trail on Brazilian highland in violent storm, water cascading over trail rocks, powerful dark storm clouds with lightning striking mountain peaks, dramatic high-contrast storm light on escarpments, cinematic ultra-realistic, no people, no bikes.',
  },
}

// Seed determinístico por trilha — mesmo algoritmo do Feed
function trailSeed(trilhaId: string): number {
  let h = 5381
  for (let i = 0; i < trilhaId.length; i++) {
    h = ((h << 5) + h + trilhaId.charCodeAt(i)) & 0x7FFFFFFF
  }
  return (h % 9000) + 1000
}

// Mesma chave do Feed — Feed e Stories compartilham o mesmo background por trilha
function bgStorageUrl(trilhaId: string, categoria: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/instagram-bg/trail_${trilhaId}_${categoria}.jpg`
}

async function fetchAndUploadPollinations(trilhaId: string, categoria: string, paisagem: Paisagem): Promise<void> {
  const prompt = (PROMPTS[categoria] ?? PROMPTS['sol'])[paisagem]
  const seed = trailSeed(trilhaId)
  const encoded = encodeURIComponent(prompt)
  const negativePrompt = encodeURIComponent(NEG)
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&nologo=true&model=flux&seed=${seed}&negative_prompt=${negativePrompt}`

  console.log(`[OG Stories] Pollinations fetch: trail_${trilhaId}_${categoria} (${paisagem}) seed=${seed}`)
  try {
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(90_000) })
    if (!imgRes.ok) { console.error(`[OG Stories] Pollinations HTTP ${imgRes.status}`); return }
    const imgBuf = await imgRes.arrayBuffer()
    if (!imgBuf.byteLength) { console.error('[OG Stories] Buffer vazio'); return }
    console.log(`[OG Stories] Pollinations OK — ${Math.round(imgBuf.byteLength / 1024)}KB`)

    const uploadUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/instagram-bg/trail_${trilhaId}_${categoria}.jpg`
    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: imgBuf,
    })
    if (upRes.ok) console.log(`[OG Stories] Upload OK → instagram-bg/trail_${trilhaId}_${categoria}.jpg`)
    else console.error(`[OG Stories] Upload falhou: ${upRes.status} ${await upRes.text()}`)
  } catch (e) {
    console.error(`[OG Stories] Pollinations erro: ${e}`)
  }
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

    if (!trilhaId) return new Response('trilha_id required', { status: 400 })

    const notoSans = loadFont('noto-sans-regular.ttf')
    const dmSansBold = loadFont('dm-sans-800.ttf')
    const dmMono = loadFont('dm-mono-400.ttf')
    const fontList: { name: string; data: ArrayBuffer; weight: 400 | 800 }[] = []
    if (notoSans) fontList.push({ name: 'Noto Sans', data: notoSans, weight: 400 })
    if (dmSansBold) fontList.push({ name: 'DM Sans', data: dmSansBold, weight: 800 })
    if (dmMono) fontList.push({ name: 'DM Mono', data: dmMono, weight: 400 })

    const fontSans = dmSansBold ? 'DM Sans' : (notoSans ? 'Noto Sans' : 'sans-serif')
    const fontMono = dmMono ? 'DM Mono' : (notoSans ? 'Noto Sans' : 'monospace')

    const [trilha, condicao] = await Promise.all([
      fetchSupabase<{
        name: string
        regiao: string
        bioma: string | null
        localidades: { cidade: string; estado: string } | { cidade: string; estado: string }[] | null
      }>(
        'trilhas',
        'name,regiao,bioma,localidades(cidade,estado)',
        `id=eq.${trilhaId}`
      ),
      fetchSupabase<{
        veredicto: string | null
        aderencia_status: string | null
        rain_mm: number | null
        wind_ms: number | null
        temp_max: number | null
        pop_12h: number | null
        alerta_vento_nivel: number | null
        alerta_vento_kmh: number | null
        alerta_rajada_kmh: number | null
        gerado_em: string | null
      }>(
        'condicoes',
        'veredicto,aderencia_status,rain_mm,wind_ms,temp_max,pop_12h,alerta_vento_nivel,alerta_vento_kmh,alerta_rajada_kmh,gerado_em',
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

    const reportStr = (() => {
      const raw = condicao.gerado_em
      if (!raw) return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      const dt = new Date(raw)
      const brt = new Date(dt.getTime() - 3 * 60 * 60 * 1000)
      const d = String(brt.getUTCDate()).padStart(2, '0')
      const m = String(brt.getUTCMonth() + 1).padStart(2, '0')
      const h = String(brt.getUTCHours()).padStart(2, '0')
      return `${d}/${m} • ${h}h BRT`
    })()

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

    const alertaVentoNivel = condicao.alerta_vento_nivel ?? 0
    const alertaVentoKmh = condicao.alerta_vento_kmh ?? 0
    const alertaRajadaKmh = condicao.alerta_rajada_kmh ?? 0
    const alertaLabel = alertaVentoNivel >= 1
      ? `VENTO FORTE ${Math.round(alertaVentoKmh)} km/h${alertaRajadaKmh > 0 ? ` · RAJADAS ${Math.round(alertaRajadaKmh)} km/h` : ''}`
      : null

    const categoria = bgCategoria(condicao.rain_mm, condicao.pop_12h)
    const paisagem  = landscapeType(trilha.bioma ?? null)
    const bgUrl = bgStorageUrl(trilhaId, categoria)

    const toDataUrl = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        const buf = await res.arrayBuffer()
        const bytes = new Uint8Array(buf.slice(0, 4))
        const isPng  = bytes[0] === 0x89 && bytes[1] === 0x50
        const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8
        const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49
        const mime = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isWebp ? 'image/webp' : 'image/jpeg'
        return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
      } catch { return null }
    }

    let bgDataUrl: string | null = await toDataUrl(bgUrl)
    if (!bgDataUrl) {
      await fetchAndUploadPollinations(trilhaId, categoria, paisagem)
      bgDataUrl = await toDataUrl(bgUrl)
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1920,
            display: 'flex',
            position: 'relative',
            background: '#1e2218',
          }}
        >
          {/* Background photo — cobre o topo (1080x1080) */}
          {bgDataUrl ? (
            <img
              src={bgDataUrl}
              style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: 1080, height: 1080 }}
            />
          ) : null}

          {/* Gradiente: foto visível no topo, escurece progressivamente */}
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'linear-gradient(to bottom, rgba(10,14,8,0.30) 0%, rgba(10,14,8,0.55) 38%, rgba(10,14,8,0.90) 54%, rgba(10,14,8,1.00) 62%)',
              display: 'flex',
            }}
          />

          {/* Faixa verde no topo */}
          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 5,
              background: '#a8b899', display: 'flex',
            }}
          />

          {/* Conteúdo principal */}
          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex', flexDirection: 'column',
              paddingTop: 60, paddingLeft: 80, paddingRight: 80, paddingBottom: 64,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontSize: 26, fontFamily: fontSans, fontWeight: 800, color: '#a8b899', letterSpacing: 3 }}>
                MTB FORECASTER
              </div>
            </div>

            {/* Trilha — posicionada na área da foto */}
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 200 }}>
              <div style={{ display: 'flex', fontSize: 22, fontFamily: fontSans, fontWeight: 700, letterSpacing: 4, color: '#a8b899' }}>
                TRILHA DE MOUNTAIN BIKE
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: nameSize,
                  fontFamily: fontSans,
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 1.1,
                  marginTop: 12,
                }}
              >
                {trilha.name ?? ''}
              </div>
              <div style={{ display: 'flex', fontSize: 30, fontFamily: fontSans, color: 'rgba(168,184,153,0.6)', marginTop: 12 }}>
                {location}
              </div>

              {/* Data/hora do report — separador visual antes da área escura */}
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 32, gap: 0 }}>
                <div style={{ display: 'flex', height: 1, background: 'rgba(168,184,153,0.20)' }} />
                <div style={{ display: 'flex', fontSize: 32, fontFamily: fontMono, color: 'rgba(168,184,153,0.65)', marginTop: 18 }}>
                  {reportStr}
                </div>
              </div>
            </div>

            {/* Spacer */}
            <div style={{ display: 'flex', flex: 1 }} />

            {/* Seção de condições — área escura */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>

              {/* Label */}
              <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 800, color: 'rgba(168,184,153,0.35)', letterSpacing: 3, marginBottom: 24 }}>
                CONDICOES AGORA
              </div>

              {/* Veredicto + aderencia */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    paddingTop: 18, paddingBottom: 18, paddingLeft: 40, paddingRight: 40,
                    background: verdict.bg,
                    fontSize: 30, fontFamily: fontSans, fontWeight: 700, color: verdict.color, letterSpacing: 1,
                  }}
                >
                  {verdict.label}
                </div>
                {aderenciaLabel ? (
                  <div
                    style={{
                      display: 'flex',
                      paddingTop: 18, paddingBottom: 18, paddingLeft: 28, paddingRight: 28,
                      background: 'rgba(168,184,153,0.08)',
                      fontSize: 26, fontFamily: fontSans, color: 'rgba(168,184,153,0.7)',
                    }}
                  >
                    {aderenciaLabel}
                  </div>
                ) : null}
              </div>

              {/* Alerta vento */}
              {alertaLabel ? (
                <div
                  style={{
                    display: 'flex', marginBottom: 24,
                    paddingTop: 16, paddingBottom: 16, paddingLeft: 24, paddingRight: 24,
                    background: 'rgba(251,191,36,0.08)',
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 22, fontFamily: fontSans, fontWeight: 700, color: '#FBBF24', letterSpacing: 1 }}>
                    {alertaLabel}
                  </div>
                </div>
              ) : null}

              {/* Métricas — 3 colunas */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, background: 'rgba(42,46,37,0.7)' }}>
                  <div style={{ display: 'flex', fontSize: 44, fontFamily: fontMono, color: '#ffffff' }}>{tempLabel}</div>
                  <div style={{ display: 'flex', fontSize: 17, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 8 }}>MAXIMA</div>
                </div>
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, background: 'rgba(42,46,37,0.7)' }}>
                  <div style={{ display: 'flex', fontSize: 44, fontFamily: fontMono, color: '#ffffff' }}>{rainLabel}</div>
                  <div style={{ display: 'flex', fontSize: 17, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 8 }}>CHUVA 24H</div>
                </div>
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 28, paddingBottom: 28, background: 'rgba(42,46,37,0.7)' }}>
                  <div style={{ display: 'flex', fontSize: 44, fontFamily: fontMono, color: '#ffffff' }}>{windLabel}</div>
                  <div style={{ display: 'flex', fontSize: 17, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 8 }}>VENTO</div>
                </div>
              </div>

              {/* Rodapé */}
              <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
                <div style={{ display: 'flex', fontSize: 22, fontFamily: fontMono, color: 'rgba(168,184,153,0.35)' }}>
                  mtbforecaster.com.br
                </div>
                <div style={{ display: 'flex', fontSize: 18, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.2)', letterSpacing: 2 }}>
                  PROXIMAS 24H
                </div>
              </div>

            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1920, fonts: fontList }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message + '\n' + err.stack : String(err)
    return new Response('OG Stories error: ' + msg, { status: 500 })
  }
}
