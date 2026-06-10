import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function resolverEstado(addr: Record<string, string>): string | null {
  const SIGLAS: Record<string, string> = {
    'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
    'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
    'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA',
    'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
    'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE',
    'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
    'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR',
    'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
  }
  const iso = addr['ISO3166-2-lvl4'] ?? addr.state_code ?? null
  if (iso) {
    const sigla = iso.replace('BR-', '').trim().toUpperCase()
    if (sigla.length === 2) return sigla
  }
  return SIGLAS[addr.state ?? ''] ?? null
}

async function geocode(lat: number, lon: number) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'mtb-forecast-app/backfill' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const addr = data.address
    if (!addr) return null
    const estado = resolverEstado(addr)
    if (!estado) return null
    return {
      pais: addr.country ?? 'Brasil',
      estado,
      cidade: addr.city ?? addr.town ?? addr.municipality ?? '',
      localidade: addr.suburb ?? addr.neighbourhood ?? addr.village ?? addr.county ?? null,
    }
  } catch { return null }
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

type LocalidadeInsert = { pais: string; estado: string; cidade: string; localidade: string | null }

async function getOrCreateLocalidade(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  geo: LocalidadeInsert
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = sb.from('localidades').select('id')
    .eq('estado', geo.estado).eq('cidade', geo.cidade)
  if (geo.localidade) query = query.eq('localidade', geo.localidade)
  else query = query.is('localidade', null)
  const { data: existing } = await query.maybeSingle()
  if (existing) return (existing as { id: string }).id
  const { data: inserted } = await sb
    .from('localidades')
    .insert(geo as Record<string, unknown>)
    .select('id').single()
  return inserted ? (inserted as { id: string }).id : null
}

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Configuração incompleta' }, { status: 500 })
  }

  const sb = createClient(supabaseUrl, serviceKey)

  // IDs de localidades incompletas (cidade vazia = fallback estado-only)
  const { data: localidadesVazias } = await sb
    .from('localidades')
    .select('id')
    .or('cidade.eq.,cidade.is.null')
  const idsVazios = (localidadesVazias || []).map((l: { id: string }) => l.id)

  // Trilhas aprovadas: sem localidade_id OU com localidade só de estado
  const semLocal = await sb
    .from('trilhas')
    .select('id, name, lat, lon, regiao')
    .eq('aprovada', true)
    .is('localidade_id', null)

  const comLocalVazia = idsVazios.length > 0
    ? await sb.from('trilhas').select('id, name, lat, lon, regiao').eq('aprovada', true).in('localidade_id', idsVazios)
    : { data: [] }

  // Trilhas pendentes: sem localidade_id OU com localidade só de estado
  const semLocalPend = await sb
    .from('trilhas_pendentes')
    .select('id, name, lat, lon, regiao')
    .is('localidade_id', null)

  const comLocalVaziaPend = idsVazios.length > 0
    ? await sb.from('trilhas_pendentes').select('id, name, lat, lon, regiao').in('localidade_id', idsVazios)
    : { data: [] }

  // Deduplica por id (evita processar mesma trilha duas vezes)
  const seen = new Set<string>()
  const toProcess = [
    ...(semLocal.data        || []).map(t => ({ ...t, tabela: 'trilhas'           as const })),
    ...(comLocalVazia.data   || []).map(t => ({ ...t, tabela: 'trilhas'           as const })),
    ...(semLocalPend.data    || []).map(t => ({ ...t, tabela: 'trilhas_pendentes' as const })),
    ...(comLocalVaziaPend.data || []).map(t => ({ ...t, tabela: 'trilhas_pendentes' as const })),
  ].filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })

  let atualizadas = 0, sem_geo = 0, erros = 0

  for (const trail of toProcess) {
    const geo = await geocode(trail.lat, trail.lon)
    await sleep(1100) // respeita rate limit Nominatim (1 req/s)

    if (!geo) {
      // Fallback: cria localidade com só o estado (regiao)
      if (trail.regiao) {
        const localidadeId = await getOrCreateLocalidade(sb, {
          pais: 'Brasil', estado: trail.regiao, cidade: '', localidade: null,
        })
        if (localidadeId) {
          await sb.from(trail.tabela).update({ localidade_id: localidadeId }).eq('id', trail.id)
          atualizadas++
        } else { erros++ }
      } else { sem_geo++ }
      continue
    }

    const localidadeId = await getOrCreateLocalidade(sb, geo)
    if (!localidadeId) { erros++; continue }

    const { error } = await sb.from(trail.tabela).update({ localidade_id: localidadeId }).eq('id', trail.id)
    if (error) erros++
    else atualizadas++
  }

  return NextResponse.json({
    total:       toProcess.length,
    atualizadas,
    sem_geo,
    erros,
  })
}
