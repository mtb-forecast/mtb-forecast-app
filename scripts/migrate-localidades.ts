import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = val
    }
  } catch {
    // sem .env.local — usa env vars já definidas
  }
}

loadEnvLocal()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type GeoResult = {
  pais: string
  estado: string
  cidade: string
  localidade: string | null
}

async function geocodeLatLon(lat: number, lon: number): Promise<GeoResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'mtb-forecast-app' } }
    )
    if (!res.ok) return null
    const data = await res.json() as { address?: Record<string, string> }
    const addr = data.address
    if (!addr) return null
    const iso = addr['ISO3166-2-lvl4'] ?? addr.state_code ?? null
    const MAPA: Record<string, string> = {
      'Acre':'AC','Alagoas':'AL','Amapá':'AP','Amazonas':'AM','Bahia':'BA','Ceará':'CE',
      'Distrito Federal':'DF','Espírito Santo':'ES','Goiás':'GO','Maranhão':'MA',
      'Mato Grosso':'MT','Mato Grosso do Sul':'MS','Minas Gerais':'MG','Pará':'PA',
      'Paraíba':'PB','Paraná':'PR','Pernambuco':'PE','Piauí':'PI','Rio de Janeiro':'RJ',
      'Rio Grande do Norte':'RN','Rio Grande do Sul':'RS','Rondônia':'RO','Roraima':'RR',
      'Santa Catarina':'SC','São Paulo':'SP','Sergipe':'SE','Tocantins':'TO',
    }
    let estado = iso ? iso.replace('BR-', '').trim().toUpperCase() : ''
    if (!estado || estado.length > 2) estado = MAPA[addr.state ?? ''] ?? ''
    if (!estado) return null
    return {
      pais: addr.country ?? 'Brasil',
      estado,
      cidade: addr.city ?? addr.town ?? addr.municipality ?? '',
      localidade: addr.suburb ?? addr.neighbourhood ?? addr.village ?? addr.county ?? null,
    }
  } catch {
    return null
  }
}

async function getOrCreateLocalidade(geo: GeoResult): Promise<string | null> {
  // Busca por estado + cidade + localidade (null tratado explicitamente)
  let query = admin.from('localidades').select('id')
    .eq('estado', geo.estado)
    .eq('cidade', geo.cidade)
  if (geo.localidade) {
    query = query.eq('localidade', geo.localidade)
  } else {
    query = query.is('localidade', null)
  }
  const { data: existing } = await query.maybeSingle()
  if (existing) return (existing as { id: string }).id

  const { data: inserted, error } = await admin
    .from('localidades')
    .insert({
      pais: geo.pais,
      estado: geo.estado,
      cidade: geo.cidade,
      localidade: geo.localidade,
    })
    .select('id')
    .single()

  if (error) {
    // Pode ter inserido em paralelo — tenta buscar novamente
    const { data: retry } = await query.maybeSingle()
    return retry ? (retry as { id: string }).id : null
  }
  return (inserted as { id: string }).id
}

async function main() {
  console.log('🔍  Buscando trilhas com lat/lon...')

  const { data: trilhas, error } = await admin
    .from('trilhas')
    .select('id, name, lat, lon, localidade_id')
    .not('lat', 'is', null)
    .not('lon', 'is', null)

  if (error) {
    console.error('❌  Erro ao buscar trilhas:', error.message)
    process.exit(1)
  }

  if (!trilhas || trilhas.length === 0) {
    console.log('✅  Nenhuma trilha encontrada.')
    return
  }

  console.log(`   ${trilhas.length} trilha(s) encontrada(s)\n`)

  let ok = 0
  let skip = 0
  let fail = 0

  for (const trilha of trilhas as Array<{ id: string; name: string; lat: number; lon: number; localidade_id: string | null }>) {
    if (trilha.localidade_id) {
      console.log(`⏭  Trilha "${trilha.name}" — já tem localidade_id, pulando`)
      skip++
      continue
    }

    const geo = await geocodeLatLon(trilha.lat, trilha.lon)
    if (!geo) {
      console.log(`❌  Erro: "${trilha.name}" — geocoding falhou (lat=${trilha.lat}, lon=${trilha.lon})`)
      fail++
      await new Promise(r => setTimeout(r, 1100))
      continue
    }

    const localidadeId = await getOrCreateLocalidade(geo)
    if (!localidadeId) {
      console.log(`❌  Erro: "${trilha.name}" — falha ao criar localidade`)
      fail++
      await new Promise(r => setTimeout(r, 1100))
      continue
    }

    const { error: updateError } = await admin
      .from('trilhas')
      .update({ localidade_id: localidadeId })
      .eq('id', trilha.id)

    if (updateError) {
      console.log(`❌  Erro: "${trilha.name}" — ${updateError.message}`)
      fail++
    } else {
      const cidade = geo.cidade || geo.localidade || '?'
      console.log(`✅  "${trilha.name}" → ${cidade}, ${geo.estado}`)
      ok++
    }

    await new Promise(r => setTimeout(r, 1100))
  }

  console.log(`\n── Concluído ──`)
  console.log(`   Atualizadas: ${ok}`)
  console.log(`   Já tinham:   ${skip}`)
  console.log(`   Falhas:      ${fail}`)
}

main()
