import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { logApiUsage } from '@/lib/api-usage-log'

// Node.js runtime — WASM do Satori é mais estável fora do Edge Runtime
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

// ─── Backgrounds via Pollinations.ai (Flux) ─────────────────────────────────
// 5 climas × 3 paisagens = 15 imagens no Feed + 15 no Stories (seeds +100).
// Chave bucket: {categoria}_{paisagem}.jpg  (ex: sol_mata.jpg, chuva_cerrado.jpg)

type Paisagem = 'mata' | 'cerrado' | 'montanha'

// Mapeia bioma da trilha para tipo de paisagem
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
    mata:     'Aerial drone photograph, lush Brazilian Atlantic forest, dense green jungle canopy, narrow dirt trail winding through tropical trees, bright sunny blue sky visible in clearings, vibrant golden light filtering through leaves. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    cerrado:  'Aerial drone photograph, Brazilian cerrado savanna, twisted trees and shrubs on red laterite earth, winding dirt trail through open landscape, bright sunny blue sky, vibrant golden light, no clouds, expansive view. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    montanha: 'Aerial drone photograph, Brazilian mountain highland, rocky terrain with alpine meadows and cliff faces, winding trail along dramatic escarpments, bright sunny blue sky, vibrant golden light, spectacular mountain views. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
  },
  nublado: {
    mata:     'Aerial drone photograph, lush Brazilian Atlantic forest, dense green jungle canopy, narrow dirt trail winding through tropical trees, completely overcast grey sky above the treetops, soft diffuse light filtering through canopy, cool misty atmosphere. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    cerrado:  'Aerial drone photograph, Brazilian cerrado savanna, twisted trees and shrubs on red earth, winding dirt trail through open landscape, completely overcast sky with grey clouds, diffuse soft light, cool desaturated colors. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    montanha: 'Aerial drone photograph, Brazilian mountain highland, rocky terrain with alpine meadows, winding trail along dramatic escarpments, completely overcast grey sky with low clouds clinging to mountain tops, cool misty highland atmosphere. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
  },
  garoa: {
    mata:     'Aerial drone photograph, lush Brazilian Atlantic forest, dense green jungle canopy glistening with fine rain, narrow dirt trail winding through tropical trees, cloudy misty sky, fine drizzle visible, wet leaves and ground, humid foggy atmosphere. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    cerrado:  'Aerial drone photograph, Brazilian cerrado savanna, twisted trees and shrubs on wet red earth, winding dirt trail through open landscape, cloudy sky with fine drizzle and mist, wet red soil with subtle puddles, humid fresh atmosphere. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    montanha: 'Aerial drone photograph, Brazilian mountain highland, rocky terrain with wet alpine meadows, winding trail along dramatic escarpments with mist and fine drizzle, low clouds around mountain peaks, foggy humid highland atmosphere, wet rocks glistening. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
  },
  chuva: {
    mata:     'Aerial drone photograph, lush Brazilian Atlantic forest, dense green jungle canopy with heavy rain falling, narrow dirt trail with puddles winding through tropical trees, dark grey stormy sky, wet shiny vegetation, streams of water forming on path. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    cerrado:  'Aerial drone photograph, Brazilian cerrado savanna, twisted trees and shrubs with rain falling, winding muddy trail through open landscape, dark grey sky with heavy rain, puddles on red earth, wet vegetation, realistic rainy day atmosphere. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    montanha: 'Aerial drone photograph, Brazilian mountain highland, rocky terrain with rain-soaked alpine meadows, winding muddy trail along dramatic escarpments, dark grey sky with heavy rain falling on mountain peaks, waterfalls visible on cliffs, dramatic wet atmosphere. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
  },
  tempestade: {
    mata:     'Aerial drone photograph, lush Brazilian Atlantic forest, dense jungle canopy battered by storm, narrow trail flooding through tropical trees, dramatic dark storm sky with lightning above the forest, heavy rain and strong wind bending trees, dramatic high contrast light. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    cerrado:  'Aerial drone photograph, Brazilian cerrado savanna, twisted trees and shrubs in storm, winding muddy trail through open landscape, dramatic dark storm sky with lightning, heavy rain and strong wind bending the sparse cerrado vegetation, powerful cinematic atmosphere. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
    montanha: 'Aerial drone photograph, Brazilian mountain highland, rocky terrain in dramatic storm, winding trail along escarpments with lightning striking nearby peaks, powerful dark storm clouds swirling around mountains, heavy rain and wind, spectacular mountain storm atmosphere. Cinematic nature photography, ultra-realistic, wide angle, high detail. No people, no animals, no vehicles, no objects.',
  },
}

// Seed determinístico por trilha — cada trilha tem composição única, mesma trilha = mesmo seed
function trailSeed(trilhaId: string): number {
  let h = 5381
  for (let i = 0; i < trilhaId.length; i++) {
    h = ((h << 5) + h + trilhaId.charCodeAt(i)) & 0x7FFFFFFF
  }
  return (h % 9000) + 1000 // range 1000–9999
}

// Chave de cache por trilha+categoria — Feed e Stories compartilham o mesmo arquivo
function bgStorageUrl(trilhaId: string, categoria: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/instagram-bg/trail_${trilhaId}_${categoria}.jpg`
}

async function fetchAndUploadPollinations(trilhaId: string, categoria: string, paisagem: Paisagem): Promise<void> {
  const prompt = (PROMPTS[categoria] ?? PROMPTS['sol'])[paisagem]
  const seed = trailSeed(trilhaId)
  const encoded = encodeURIComponent(prompt)
  const negativePrompt = encodeURIComponent(NEG)
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&nologo=true&model=flux&seed=${seed}&negative_prompt=${negativePrompt}`

  console.log(`[OG] Pollinations fetch: trail_${trilhaId}_${categoria} (${paisagem}) seed=${seed}`)
  try {
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(90_000) })
    if (!imgRes.ok) {
      console.error(`[OG] Pollinations HTTP ${imgRes.status}`)
      void logApiUsage('pollinations', 'flux_image', { sucesso: 0, falhas: 1 })
      return
    }

    const imgBuf = await imgRes.arrayBuffer()
    if (!imgBuf.byteLength) {
      console.error('[OG] Pollinations retornou buffer vazio')
      void logApiUsage('pollinations', 'flux_image', { sucesso: 0, falhas: 1 })
      return
    }
    void logApiUsage('pollinations', 'flux_image')
    console.log(`[OG] Pollinations OK — ${Math.round(imgBuf.byteLength / 1024)}KB`)

    const uploadUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/instagram-bg/trail_${trilhaId}_${categoria}.jpg`
    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: imgBuf,
    })
    if (!upRes.ok) {
      const body = await upRes.text()
      console.error(`[OG] Upload Supabase falhou: ${upRes.status} ${body}`)
    } else {
      console.log(`[OG] Upload OK → instagram-bg/trail_${trilhaId}_${categoria}.jpg`)
    }
  } catch (e) {
    console.error(`[OG] Pollinations erro: ${e}`)
  }
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

    // Converte gerado_em para BRT (UTC-3) e formata como "25/06 • 07h"
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
    const paisagem  = landscapeType(trilha.bioma)
    const bgUrl = bgStorageUrl(trilhaId, categoria)

    let bgDataUrl: string | null = null

    const toDataUrl = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        const buf = await res.arrayBuffer()
        const bytes = new Uint8Array(buf.slice(0, 4))
        const isPng  = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
        const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
        const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        const mime   = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isWebp ? 'image/webp' : 'image/jpeg'
        return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
      } catch { return null }
    }

    bgDataUrl = await toDataUrl(bgUrl)
    if (!bgDataUrl) {
      await fetchAndUploadPollinations(trilhaId, categoria, paisagem)
      bgDataUrl = await toDataUrl(bgUrl)
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
              paddingTop: 36,
              paddingLeft: 72,
              paddingRight: 72,
              paddingBottom: 44,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontSize: 24, fontFamily: fontSans, fontWeight: 800, color: '#a8b899', letterSpacing: 3 }}>
                MTB FORECASTER
              </div>
            </div>

            {/* Trail label */}
            <div style={{ display: 'flex', fontSize: 22, fontFamily: fontSans, fontWeight: 700, letterSpacing: 4, color: '#a8b899', marginTop: 22 }}>
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
                marginTop: 8,
              }}
            >
              {trilha.name ?? ''}
            </div>

            {/* Location */}
            <div style={{ display: 'flex', fontSize: 28, fontFamily: fontSans, fontWeight: 400, color: 'rgba(168,184,153,0.6)', marginTop: 8 }}>
              {location}
            </div>

            {/* Data/hora do report — separador entre trilha e área de condições */}
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, gap: 0 }}>
              <div style={{ display: 'flex', height: 1, background: 'rgba(168,184,153,0.20)' }} />
              <div style={{ display: 'flex', fontSize: 28, fontFamily: fontMono, color: 'rgba(168,184,153,0.65)', marginTop: 16 }}>
                {reportStr}
              </div>
            </div>

            {/* Spacer */}
            <div style={{ display: 'flex', flex: 1 }} />

            {/* Verdict + aderencia */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
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

            {/* Alertas */}
            {alertaLabel ? (
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingTop: 12, paddingBottom: 12, paddingLeft: 20, paddingRight: 20, background: 'rgba(251,191,36,0.08)' }}>
                <div style={{ display: 'flex', fontSize: 18, fontFamily: fontSans, fontWeight: 700, color: '#FBBF24', letterSpacing: 1 }}>
                  {alertaLabel}
                </div>
              </div>
            ) : null}

            {/* Metrics — 3 columns */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 22, paddingBottom: 22, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{tempLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 6 }}>MAXIMA</div>
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 22, paddingBottom: 22, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{rainLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 6 }}>CHUVA 24H</div>
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', paddingTop: 22, paddingBottom: 22, background: 'rgba(42,46,37,0.7)' }}>
                <div style={{ display: 'flex', fontSize: 40, fontFamily: fontMono, color: '#ffffff', fontWeight: 400 }}>{windLabel}</div>
                <div style={{ display: 'flex', fontSize: 16, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.4)', marginTop: 6 }}>VENTO</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
              <div style={{ display: 'flex', fontSize: 22, fontFamily: fontMono, color: 'rgba(168,184,153,0.35)' }}>
                mtbforecaster.com.br
              </div>
              <div style={{ display: 'flex', fontSize: 18, fontFamily: fontSans, fontWeight: 700, color: 'rgba(168,184,153,0.2)', letterSpacing: 2 }}>
                PROXIMAS 24H
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
