// Previsão do tempo BRUTA (sem análise de solo/aderência — isso só existe pra
// D+1/D+2/D+3 via condicoes.fds_dN, calculado pelo pipeline Python) pra datas
// mais distantes, usada quando uma seleção de trilhas (feature isolada) tem
// data além do alcance do pipeline. Chamada direta e isolada ao Open-Meteo
// forecast diário — não toca em nenhuma lógica de chuva histórica/veredicto.
export type PrevisaoDiaExtendida = {
  data: string
  tmax: number | null
  tmin: number | null
  rain: number | null
  pop: number | null
  windKmh: number | null
}

export async function buscarPrevisaoEstendida(
  lat: number,
  lon: number,
  dataAlvo: string
): Promise<PrevisaoDiaExtendida | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max')
    url.searchParams.set('timezone', 'America/Sao_Paulo')
    url.searchParams.set('forecast_days', '16')

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = await res.json()

    const dias: string[] | undefined = json?.daily?.time
    const idx = dias?.indexOf(dataAlvo) ?? -1
    if (idx < 0) return null

    return {
      data: dataAlvo,
      tmax: json.daily.temperature_2m_max?.[idx] ?? null,
      tmin: json.daily.temperature_2m_min?.[idx] ?? null,
      rain: json.daily.precipitation_sum?.[idx] ?? null,
      pop: json.daily.precipitation_probability_max?.[idx] ?? null,
      windKmh: json.daily.wind_speed_10m_max?.[idx] ?? null,
    }
  } catch {
    return null
  }
}
