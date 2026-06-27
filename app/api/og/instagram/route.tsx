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

// NEG relaxado — os prompts incluem intencionalmente pneus, guidão e perna do ciclista
const NEG = 'people, person, human, cyclist, bicycle, bike, rider, athlete, man, woman, child, figure, silhouette, body, face, hand, foot, helmet, glove, shoe, clothing, tire, wheel, handlebar, frame, saddle, crowd, group, vehicle, animal'

// 7 variantes por categoria — trailSeed % 7 escolhe qual ângulo cada trilha usa
const PROMPTS: Record<string, string[]> = {
  sol: [
    'Fotografia ultrarrealista ao nível do solo olhando para cima da trilha vazia. As rochas e a vegetação rasteira são nítidas em primeiro plano, as árvores se estendem acima e as montanhas suaves emolduram o fundo sob o céu azul intenso. Trilha completamente deserta, sem ninguém. Luz natural brilhante.',
    'Macro-fotografia ultrarrealista com lente grande angular focada em uma seção técnica do rock garden vazio. A trilha de terra serpenteia entre rochas afiadas e irregulares. A vegetação baixa está seca e dourada. Céu azul brilhante e montanhas desfocadas no fundo. Sem pessoas, sem bicicletas.',
    'Foto aérea de drone capturando a curva sinuosa da trilha deserta. A trilha de terra corta a encosta da montanha, com o rock garden como uma mancha texturizada. Árvores espalhadas criam sombras nítidas no solo. Céu azul vasto e montanhas suaves se estendem ao horizonte. Completamente vazia.',
    'A trilha durante a hora dourada logo após o nascer do sol. Luz suave e quente ilumina as rochas e a vegetação. Céu azul com tons de laranja e rosa no horizonte sobre as montanhas suaves. Trilha deserta, silenciosa, cinematográfica.',
    'Foto ao nível da trilha focada na bifurcação vazia. Uma opção mais suave de terra à esquerda e a linha principal através do rock garden à direita. Árvores ao centro, montanhas suaves e céu azul ao fundo. Nenhuma pessoa ou veículo.',
    'Lente grande angular focada em flores silvestres nativas e plantas suculentas crescendo entre as rochas do rock garden. A trilha de terra e as árvores estão desfocadas ao fundo. Céu azul intenso e montanhas suaves ao longe. Completamente deserto.',
    'Vista da trilha à frente a partir do solo, olhando para o caminho que desce pelo rock garden entre as árvores. Perspectiva de quem está na trilha mas sem mostrar ninguém. Céu azul e montanhas suaves ao fundo. Trilha vazia e convidativa.',
  ],
  nublado: [
    'Fotografia ultrarrealista ao nível do solo olhando para cima da trilha vazia. As rochas e a vegetação rasteira aparecem nítidas em primeiro plano. Montanhas suaves emolduram o horizonte sob céu totalmente encoberto por nuvens cinzentas claras. Iluminação difusa, sem sombras, trilha completamente deserta.',
    'Macro-fotografia ultrarrealista com lente grande angular focada em seção técnica do rock garden vazio e úmido. Trilha serpenteia entre rochas afiadas. Vegetação com tons verdes intensos pela umidade. Céu nublado com luz suave e uniforme, montanhas desfocadas ao fundo. Sem pessoas ou bicicletas.',
    'Foto aérea de drone capturando a curva sinuosa da trilha deserta. O rock garden aparece como faixa texturizada entre a vegetação. Árvores pontuam o terreno. Céu coberto por nuvens espessas criando iluminação homogênea. Montanhas desaparecem em névoa atmosférica. Trilha vazia.',
    'A trilha capturada ao nascer do sol em manhã nublada. Luz dourada filtrada pelas nuvens cria tons suaves de laranja e amarelo. Rochas úmidas e vegetação com iluminação delicada. Montanhas parcialmente envoltas por névoa baixa. Atmosfera tranquila, trilha deserta.',
    'Foto ao nível da trilha mostrando a bifurcação vazia. À esquerda linha suave de terra, à direita o rock garden técnico. Terreno levemente úmido. Árvores ao fundo, montanhas sob céu cinzento uniforme. Nenhuma pessoa ou veículo.',
    'Fotografia grande angular focada em flores silvestres e plantas nativas crescendo entre as rochas do rock garden. Umidade realça as cores da vegetação. Trilha e árvores desfocadas ao fundo. Céu nublado criando luz suave. Completamente deserto.',
    'Vista da trilha à frente a partir do solo, olhando para o caminho que serpenteia pelo rock garden entre árvores dispersas. Céu nublado proporcionando luz uniforme sobre as rochas e vegetação. Trilha vazia e silenciosa, sem ninguém.',
  ],
  garoa: [
    'Fotografia ultrarrealista ao nível do solo olhando para cima da trilha vazia na garoa. Pequenas gotas de chuva são visíveis no ar. Rochas molhadas brilham discretamente. Árvores e montanhas suaves ao fundo sob céu cinzento carregado. Trilha completamente deserta, atmosfera úmida.',
    'Macro-fotografia ultrarrealista focada em rock garden molhado por garoa constante. Pedras com reflexos suaves e superfícies escorregadias. Gotas cruzam a cena. Montanhas parcialmente ocultas por névoa fina ao fundo. Sem pessoas ou bicicletas.',
    'Foto aérea de drone registrando trilha sinuosa deserta sob garoa leve. Terreno com tons mais escuros pela umidade. Árvores com aparência brilhante e saturada. Névoa reduz visibilidade das montanhas distantes. Céu coberto por nuvens baixas e cinzentas. Trilha vazia.',
    'A trilha ao amanhecer com garoa. Luz dourada atravessa parcialmente as nuvens criando reflexos suaves sobre pedras molhadas. Pequenas gotas suspensas no ar. Montanhas parcialmente ocultas por névoa baixa. Atmosfera cinematográfica, trilha deserta.',
    'Foto ao nível da trilha mostrando bifurcação vazia sob garoa leve. Linha fácil com terra úmida, rock garden com pedras molhadas e brilhantes. Gotas visíveis na cena. Árvores e montanhas desfocadas ao fundo. Nenhuma pessoa ou veículo.',
    'Fotografia focada em flores silvestres e vegetação nativa cobertas por gotas de água da garoa. Rochas do rock garden úmidas e detalhadas. Gotas acumuladas nas folhas em destaque. Trilha e árvores desfocadas sob céu cinzento. Completamente deserto.',
    'Vista da trilha úmida à frente a partir do solo, olhando para o caminho molhado pelo rock garden entre árvores com névoa ao redor. Atmosfera envolvente de garoa, montanhas suavizadas pela neblina. Trilha vazia e silenciosa.',
  ],
  chuva: [
    'Fotografia ultrarrealista ao nível do solo olhando para cima da trilha vazia durante chuva intensa. Lama e respingos de água na cena. Chuva caindo intensamente. Rochas encharcadas e vegetação balançando. Montanhas parcialmente ocultas pela cortina de chuva. Trilha completamente deserta.',
    'Macro-fotografia ultrarrealista de rock garden vazio durante chuva moderada. Pedras escuras e molhadas refletem a luz ambiente. Água respingando entre as pedras. Gotas de chuva congeladas pelo obturador rápido. Árvores e montanhas envoltas em névoa ao fundo. Sem pessoas ou bicicletas.',
    'Foto aérea de drone da trilha deserta durante chuva constante. Trechos lamacentos e poças d\'água visíveis. Árvores escuras e saturadas pela umidade. Camadas atmosféricas entre as montanhas com visibilidade reduzida. Céu com nuvens densas e carregadas. Trilha vazia.',
    'A trilha ao amanhecer durante chuva leve. Luz dourada atravessa aberturas nas nuvens escuras criando raios dramáticos sobre terreno molhado. Rochas com reflexo suave da manhã enquanto a chuva continua. Atmosfera épica e cinematográfica. Trilha deserta.',
    'Foto ao nível da trilha mostrando bifurcação vazia em condições de chuva. Linha fácil com lama e pequenas poças, rock garden completamente molhado e desafiador. Gotas atravessam a cena, vegetação verde intensa. Nenhuma pessoa ou veículo.',
    'Fotografia grande angular de flores silvestres e plantas nativas cobertas por gotas de chuva. Água escorre pelas rochas do rock garden em pequenos filetes. Trilha molhada e árvores balançando ao fundo desfocado. Cores naturais mais saturadas. Completamente deserto.',
    'Vista da trilha encharcada à frente a partir do solo, olhando para o caminho lamacento que desce pelo rock garden com chuva caindo. Poças refletem o céu nublado. Vegetação brilhante de umidade. Trilha completamente vazia.',
  ],
  tempestade: [
    'Fotografia ultrarrealista ao nível do solo olhando para cima da trilha inundada durante tempestade violenta. Lama profunda e respingos de água por toda a cena. Chuva com força total, vento dobrando a vegetação. Relâmpagos iluminam as montanhas ao fundo. Trilha completamente deserta.',
    'Macro-fotografia de rock garden completamente inundado durante tempestade. Pedras submersas em lama e água corrente. Água respingando violentamente entre as pedras. Gotas de chuva intensa congeladas. Raios e trovões ao fundo entre as montanhas. Sem pessoas ou bicicletas.',
    'Foto aérea de drone durante tempestade severa. Trilha vazia transformada em canal de lama e água. Árvores curvadas pelo vento intenso. Nuvens escuras e dramáticas cobrindo as montanhas. Relâmpagos no horizonte. Atmosfera apocalíptica. Trilha deserta.',
    'A trilha durante tempestade ao entardecer. Raios de luz laranja e violeta dramáticos atravessam nuvens carregadas. Água jorrando pelas rochas. Vegetação dobrada pelo vento. Montanhas quase invisíveis pela cortina de chuva. Trilha completamente vazia.',
    'Bifurcação da trilha durante tempestade, ambas as linhas inundadas. A linha fácil virou riacho e o rock garden está perigoso. Água correndo por toda a cena. Trovões no céu escuro. Vegetação balançando violentamente. Nenhuma pessoa ou veículo.',
    'Close em vegetação nativa durante tempestade. Flores e folhas dobradas pelo vento e chuva intensa. Água escorrendo pelas rochas do rock garden em filetes grossos. Raios iluminam a cena ao fundo. Trilha deserta em atmosfera dramática.',
    'Vista da trilha inundada à frente a partir do solo durante tempestade violenta. Relâmpago visível ao longe iluminando o caminho entre as pedras e árvores curvadas. Chuva intensa, lama e água por todo o rock garden. Trilha completamente vazia e hostil.',
  ],
}

// ─── Polyline da trilha ───────────────────────────────────────────────────────

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    coords.push([lat / 1e5, lng / 1e5])
  }
  return coords
}

function polylineToSvgPath(coords: [number, number][], w: number, h: number, pad = 80): string {
  if (coords.length < 2) return ''
  const lats = coords.map(c => c[0])
  const lngs = coords.map(c => c[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const latRange = maxLat - minLat || 1e-5
  const lngRange = maxLng - minLng || 1e-5
  const scaleX = (w - pad * 2) / lngRange
  const scaleY = (h - pad * 2) / latRange
  const scale = Math.min(scaleX, scaleY)
  const offsetX = (w - lngRange * scale) / 2
  const offsetY = (h - latRange * scale) / 2
  return coords.map((c, i) => {
    const x = (offsetX + (c[1] - minLng) * scale).toFixed(1)
    const y = (offsetY + (maxLat - c[0]) * scale).toFixed(1)
    return `${i === 0 ? 'M' : 'L'}${x},${y}`
  }).join(' ')
}

// ─── Seed determinístico por trilha — cada trilha tem composição única, mesma trilha = mesmo seed
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

async function fetchAndUploadPollinations(trilhaId: string, categoria: string): Promise<void> {
  const variants = PROMPTS[categoria] ?? PROMPTS['sol']
  const seed = trailSeed(trilhaId)
  const variantIndex = seed % variants.length
  const prompt = variants[variantIndex]
  const encoded = encodeURIComponent(prompt)
  const negativePrompt = encodeURIComponent(NEG)
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&nologo=true&model=flux&seed=${seed}&negative_prompt=${negativePrompt}`

  console.log(`[OG] Pollinations fetch: trail_${trilhaId}_${categoria} variant=${variantIndex} seed=${seed}`)
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
        polyline: string | null
        localidades: { cidade: string; estado: string } | { cidade: string; estado: string }[] | null
      }>(
        'trilhas',
        'name,regiao,bioma,exposicao,solo_type,altitude_m,polyline,localidades(cidade,estado)',
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
      await fetchAndUploadPollinations(trilhaId, categoria)
      bgDataUrl = await toDataUrl(bgUrl)
    }

    const svgPath = trilha.polyline ? polylineToSvgPath(decodePolyline(trilha.polyline), 1080, 1080) : ''

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

          {/* Polyline da trilha — overlay sutil sobre o fundo */}
          {svgPath ? (
            <svg
              width="1080"
              height="1080"
              viewBox="0 0 1080 1080"
              style={{ display: 'flex', position: 'absolute', top: 0, left: 0 }}
            >
              {/* Glow suave */}
              <path d={svgPath} fill="none" stroke="#D4601A" strokeWidth="10" strokeOpacity="0.18" strokeLinecap="round" strokeLinejoin="round" />
              {/* Linha principal */}
              <path d={svgPath} fill="none" stroke="#E07830" strokeWidth="3" strokeOpacity="0.65" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}

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
