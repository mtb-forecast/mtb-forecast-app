export function formatLocalidade(
  localidades?: { cidade: string; estado: string; localidade: string | null } | null,
  fallback?: string,
): string {
  if (!localidades) return fallback ?? ''
  const parts = [localidades.localidade, localidades.cidade, localidades.estado].filter(Boolean)
  return parts.join(', ')
}

export type GeoResult = {
  pais: string
  estado: string
  cidade: string
  localidade: string | null
}

const ESTADO_NOME_PARA_SIGLA: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
  'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA',
  'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
  'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE',
  'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
}

function resolverEstado(addr: Record<string, string>): string | null {
  const iso = addr['ISO3166-2-lvl4'] ?? addr.state_code ?? null
  if (iso) {
    const sigla = iso.replace('BR-', '').trim().toUpperCase()
    if (sigla.length === 2) return sigla
  }
  // Fallback: mapear nome completo para sigla
  const nomeCompleto = addr.state ?? ''
  return ESTADO_NOME_PARA_SIGLA[nomeCompleto] ?? null
}

export async function geocodeLatLon(lat: number, lon: number): Promise<GeoResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'mtb-forecast-app' } }
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
  } catch {
    return null
  }
}
