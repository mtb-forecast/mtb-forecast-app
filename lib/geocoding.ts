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
    const estado = addr.state_code?.replace('BR-', '') ?? addr.state ?? ''
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
