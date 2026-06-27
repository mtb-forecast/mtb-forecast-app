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
const NEG = 'full face, full body portrait, crowd, spectators, group of people, many people, logo, text, watermark'

// 7 variantes por categoria — trailSeed % 7 escolhe qual ângulo cada trilha usa
const PROMPTS: Record<string, string[]> = {
  sol: [
    'Uma fotografia de alta definição, em perspectiva de baixo (ao nível do solo), olhando diretamente para cima da trilha. O foco está nos pneus de uma mountain bike que se aproxima, com a lama sendo lançada. As rochas e a vegetação rasteira são nítidas em primeiro plano, as árvores se estendem acima e as montanhas suaves emolduram o fundo sob o céu azul intenso. Ultrarrealista.',
    'Uma macro-fotografia ultrarrealista com lente grande angular, focada em uma seção técnica do rock garden. A trilha de terra serpenteia entre rochas afiadas e irregulares. A vegetação baixa está seca e dourada. Apenas a perna de um ciclista e parte do quadro da bicicleta são visíveis, navegando pelas pedras, com o céu azul brilhante e as montanhas desfocadas no fundo. Ultrarrealista.',
    'Uma foto aérea de drone (em alta altitude, mas com lente grande angular) capturando a curva sinuosa da trilha. A trilha de terra corta a encosta da montanha árida, com o rock garden como uma mancha texturizada. As árvores espalhadas criam sombras nítidas no solo. O céu azul é vasto e as montanhas suaves se estendem até o horizonte. Ultrarrealista.',
    'Uma variação de iluminação: a mesma trilha e paisagem, mas capturada durante a hora dourada logo após o nascer do sol. A luz suave e quente ilumina as rochas e a vegetação. O céu azul ainda está presente, mas com tons de laranja e rosa no horizonte sobre as montanhas suaves. Ultrarrealista.',
    'Uma foto ao nível da trilha, focada na bifurcação da trilha. Uma opção mais suave e de terra à esquerda e a linha principal através do rock garden agressivo à direita. As árvores estão localizadas no meio, e as montanhas suaves e o céu azul brilhante preenchem o fundo. Ultrarrealista.',
    'A mesma paisagem árida, mas com a lente grande angular focada em detalhes de flores silvestres nativas e plantas suculentas crescendo entre as rochas do rock garden. A trilha de terra e as árvores estão ligeiramente desfocadas em segundo plano, com o céu azul intenso e as montanhas suaves ao longe. Ultrarrealista.',
    'Uma imagem POV ultrarrealista, como se estivesse usando uma câmera de capacete. O guidão da bicicleta e o pneu dianteiro estão em primeiro plano. A trilha com o rock garden está à frente, com a curva e as árvores espalhadas. O céu azul e as montanhas suaves preenchem a visão. Ultrarrealista.',
  ],
  nublado: [
    'Uma fotografia de alta definição, em perspectiva de baixo (ao nível do solo), olhando diretamente para cima da trilha. O foco está nos pneus de uma mountain bike que se aproxima, lançando pequenas gotas de lama úmida. As rochas e a vegetação rasteira aparecem nítidas em primeiro plano, enquanto as árvores se elevam acima da trilha. Montanhas suaves emolduram o horizonte sob um céu totalmente encoberto por nuvens cinzentas claras. Iluminação difusa, sem sombras marcadas, atmosfera fresca e natural, fotografia ultrarrealista.',
    'Uma macro-fotografia ultrarrealista com lente grande angular, focada em uma seção técnica do rock garden. A trilha úmida serpenteia entre rochas afiadas e irregulares. A vegetação baixa apresenta tons verdes e terrosos mais intensos devido à umidade. Apenas a perna de um ciclista e parte do quadro da bicicleta são visíveis navegando pelas pedras. O céu está completamente nublado, com luz suave e uniforme, enquanto as montanhas aparecem levemente desfocadas ao fundo. Ultrarrealista.',
    'Uma foto aérea de drone capturando a curva sinuosa da trilha em uma paisagem natural. A trilha corta a encosta da montanha e o rock garden aparece como uma faixa texturizada entre a vegetação. Árvores espalhadas pontuam o terreno. O céu está coberto por nuvens espessas, eliminando sombras fortes e criando uma iluminação homogênea. As montanhas suaves desaparecem gradualmente em uma leve névoa atmosférica. Ultrarrealista.',
    'A mesma trilha e paisagem capturadas logo após o nascer do sol em uma manhã nublada. A luz dourada é filtrada pelas nuvens, criando tons suaves de laranja e amarelo no horizonte. As rochas úmidas e a vegetação recebem uma iluminação delicada e difusa. As montanhas suaves aparecem parcialmente envoltas por névoa baixa, criando uma atmosfera tranquila e cinematográfica. Ultrarrealista.',
    'Uma fotografia ao nível da trilha mostrando a bifurcação. À esquerda, uma linha de terra mais suave e compacta; à direita, a linha principal atravessando o rock garden técnico. O terreno apresenta aspecto levemente úmido. Árvores dispersas aparecem ao fundo, enquanto montanhas suaves se destacam sob um céu cinzento uniforme. Iluminação suave e sem contrastes intensos. Ultrarrealista.',
    'Uma fotografia grande angular focada em flores silvestres, gramíneas e pequenas plantas nativas crescendo entre as rochas do rock garden. A umidade realça as cores naturais da vegetação. A trilha e as árvores aparecem desfocadas ao fundo. O céu totalmente nublado cria uma iluminação suave que destaca texturas e detalhes das plantas. Ultrarrealista.',
    'Uma imagem POV ultrarrealista capturada por uma câmera de capacete. O guidão e o pneu dianteiro aparecem em primeiro plano. A trilha segue à frente passando por um rock garden técnico e uma curva suave entre árvores dispersas. O céu está encoberto por nuvens densas, proporcionando iluminação uniforme e excelente definição das rochas e da vegetação. Ultrarrealista.',
  ],
  garoa: [
    'Uma fotografia de alta definição ao nível do solo, olhando diretamente para cima da trilha. Os pneus de uma mountain bike avançam em direção à câmera, lançando gotas de lama fina e respingos de água. Pequenas gotas de garoa são visíveis no ar. As rochas molhadas brilham discretamente. Árvores e montanhas suaves aparecem ao fundo sob um céu cinzento carregado. Atmosfera úmida e realista. Ultrarrealista.',
    'Uma macro-fotografia ultrarrealista focada em um rock garden molhado por uma garoa constante. As pedras apresentam reflexos suaves e superfícies escorregadias. Apenas parte da bicicleta e a perna do ciclista são visíveis superando o obstáculo. Pequenas gotas de chuva podem ser vistas cruzando a cena. O fundo apresenta montanhas parcialmente ocultas pela névoa fina. Ultrarrealista.',
    'Uma foto aérea de drone registrando a trilha sinuosa sob uma garoa leve. O terreno apresenta tons mais escuros devido à umidade. As árvores possuem aparência brilhante e saturada. Uma leve névoa reduz a visibilidade das montanhas mais distantes. O céu permanece totalmente coberto por nuvens baixas e cinzentas. Ultrarrealista.',
    'A mesma trilha capturada durante o amanhecer em condições de garoa. A luz dourada do sol atravessa parcialmente as nuvens, criando reflexos suaves sobre as pedras molhadas. Pequenas gotas permanecem suspensas no ar. As montanhas suaves aparecem parcialmente escondidas por névoa baixa, criando uma atmosfera cinematográfica e contemplativa. Ultrarrealista.',
    'Uma fotografia ao nível da trilha mostrando duas opções de passagem sob uma garoa leve. A linha fácil apresenta terra compactada e úmida, enquanto o rock garden da linha principal exibe pedras molhadas e brilhantes. Pequenas gotas são visíveis diante da lente. Árvores e montanhas surgem suavemente desfocadas ao fundo. Ultrarrealista.',
    'Uma fotografia focada em flores silvestres e vegetação nativa cobertas por gotas de água da garoa. As rochas do rock garden aparecem úmidas e detalhadas. A profundidade de campo reduzida destaca as gotas acumuladas nas folhas. A trilha e as árvores permanecem suavemente desfocadas sob um céu cinzento. Ultrarrealista.',
    'Imagem POV ultrarrealista de um ciclista pedalando durante uma garoa leve. Pequenas gotas estão visíveis na lente da câmera. O guidão e o pneu dianteiro aparecem em primeiro plano. A trilha úmida e o rock garden exigem atenção. O ambiente é envolvido por uma névoa fina que suaviza o contorno das montanhas ao fundo. Ultrarrealista.',
  ],
  chuva: [
    'Uma fotografia ultrarrealista de alta definição ao nível do solo, olhando diretamente para cima da trilha. Uma mountain bike avança em velocidade através da lama profunda, lançando grandes respingos em direção à câmera. A chuva cai intensamente por toda a cena. As rochas estão encharcadas e a vegetação balança sob o vento. Montanhas suaves aparecem parcialmente ocultas pela cortina de chuva. Ultrarrealista.',
    'Uma macro-fotografia ultrarrealista de um rock garden durante chuva moderada. As pedras escuras e molhadas refletem a luz ambiente. A roda da bicicleta passa entre os obstáculos lançando água para os lados. Gotas de chuva visíveis congeladas pelo obturador rápido. O fundo apresenta árvores e montanhas envoltas em névoa e chuva. Ultrarrealista.',
    'Uma fotografia aérea de drone capturando a trilha sinuosa durante uma chuva constante. A trilha apresenta trechos lamacentos e poças d\'água. As árvores aparecem escuras e saturadas pela umidade. A visibilidade reduzida cria camadas atmosféricas entre as montanhas. O céu é composto por nuvens densas e carregadas. Ultrarrealista.',
    'A mesma trilha fotografada ao amanhecer durante uma chuva leve a moderada. A luz dourada do sol atravessa pequenas aberturas entre as nuvens escuras, criando raios de luz dramáticos sobre o terreno molhado. As rochas refletem o brilho suave da manhã enquanto a chuva continua caindo. Atmosfera épica e cinematográfica. Ultrarrealista.',
    'Uma fotografia ao nível da trilha mostrando a bifurcação em condições de chuva. A linha fácil possui lama compactada e pequenas poças, enquanto o rock garden principal está completamente molhado e desafiador. Gotas de chuva atravessam a cena e a vegetação apresenta tons verdes intensos devido à água. Ultrarrealista.',
    'Uma fotografia grande angular destacando flores silvestres e plantas nativas cobertas por gotas de chuva. A água escorre pelas rochas do rock garden criando pequenos filetes. O fundo desfocado mostra a trilha molhada e árvores balançando sob a chuva. As cores naturais estão mais saturadas devido à umidade. Ultrarrealista.',
    'Uma imagem POV ultrarrealista de um ciclista pedalando sob chuva moderada. O guidão e o pneu dianteiro aparecem cobertos por gotas de água e respingos de lama. A trilha à frente está molhada, com pedras escorregadias e pequenas poças entre os obstáculos do rock garden. Gotas aderidas à lente aumentam a sensação de imersão e realismo. Ultrarrealista.',
  ],
  tempestade: [
    'Uma fotografia ultrarrealista ao nível do solo durante uma tempestade violenta. Os pneus de uma mountain bike avançam pela lama profunda encharcada, lançando imensos respingos. A chuva cai com força total, o vento dobra a vegetação. Relâmpagos iluminam dramaticamente as montanhas ao fundo. Atmosfera épica e cinematográfica. Ultrarrealista.',
    'Uma macro-fotografia de um rock garden completamente inundado durante tempestade. As pedras estão submersas em lama e água corrente. Apenas a roda da bicicleta e perna do ciclista são visíveis forçando a passagem. Gotas de chuva intensa congeladas. Trovões e raios ao fundo entre as montanhas. Ultrarrealista.',
    'Foto aérea de drone durante tempestade severa. A trilha se transforma em um canal de lama e água. Árvores curvadas pelo vento intenso. Nuvens escuras e dramáticas cobrindo as montanhas. Relâmpagos visíveis no horizonte. Atmosfera apocalíptica e cinematográfica. Ultrarrealista.',
    'A trilha durante tempestade ao entardecer. Raios de luz laranja e violeta dramáticos atravessam as nuvens carregadas. Água jorrando pelas rochas. A vegetação dobrada pelo vento. As montanhas quase invisíveis pela cortina de chuva intensa. Atmosfera épica. Ultrarrealista.',
    'Bifurcação da trilha durante tempestade. Ambas as linhas estão inundadas — a linha fácil virou riacho e o rock garden está perigoso. Água correndo por toda a cena. Trovões visíveis no céu escuro. Vegetação balançando violentamente. Ultrarrealista.',
    'Close em vegetação nativa durante tempestade. Flores e folhas dobradas pelo vento e chuva intensa. Água escorrendo pelas rochas do rock garden em filetes grossos. Raios iluminam a cena ao fundo. Atmosfera dramática e poderosa. Ultrarrealista.',
    'POV de ciclista na tempestade. Guidão e pneu dianteiro cobertos de lama e água. A trilha à frente está quase irreconhecível de tanta chuva. Relâmpago visível ao longe. Gotas e respingos bloqueando parcialmente a visão. Imersão total. Ultrarrealista.',
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
