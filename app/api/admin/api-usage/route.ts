import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const LABEL: Record<string, string> = {
  openweathermap: 'OpenWeatherMap',
  open_meteo:     'Open-Meteo',
  anthropic:      'Anthropic (Claude)',
  gemini:         'Google Gemini',
  groq:           'Groq',
  noaa:           'NOAA ONI',
  github_actions: 'GitHub Actions',
  weatherapi:     'WeatherAPI (fallback)',
  windy:          'Windy (fallback)',
  resend:         'Resend (e-mail)',
  telegram:       'Telegram Bot',
  pollinations:   'Pollinations.ai',
  stripe:         'Stripe (pagamentos)',
  strava:         'Strava',
  openlandmap:    'OpenLandMap',
  deepseek:       'DeepSeek',
  tavily:         'Tavily (busca web)',
  instagram:      'Instagram (Graph API)',
}

export async function GET(req: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { searchParams } = new URL(req.url)
  const dias = Math.min(parseInt(searchParams.get('dias') ?? '7'), 90)

  const desde = new Date()
  desde.setDate(desde.getDate() - dias)

  const { data, error } = await supabaseAdmin
    .from('api_usage_log')
    .select('execucao_id, api_name, endpoint, chamadas, tokens_input, tokens_output, custo_usd, sucesso, falhas, criado_em')
    .gte('criado_em', desde.toISOString())
    .order('criado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrega por api_name
  const agg: Record<string, {
    api_name: string
    label: string
    chamadas: number
    tokens_input: number
    tokens_output: number
    custo_usd: number
    sucesso: number
    falhas: number
    endpoints: Record<string, { chamadas: number; sucesso: number; falhas: number }>
  }> = {}

  for (const row of data ?? []) {
    const k = row.api_name
    if (!agg[k]) {
      agg[k] = {
        api_name: k,
        label: LABEL[k] ?? k,
        chamadas: 0, tokens_input: 0, tokens_output: 0,
        custo_usd: 0, sucesso: 0, falhas: 0,
        endpoints: {},
      }
    }
    agg[k].chamadas      += row.chamadas ?? 0
    agg[k].tokens_input  += row.tokens_input ?? 0
    agg[k].tokens_output += row.tokens_output ?? 0
    agg[k].custo_usd     += row.custo_usd ?? 0
    agg[k].sucesso       += row.sucesso ?? 0
    agg[k].falhas        += row.falhas ?? 0

    const ep = row.endpoint ?? ''
    if (!agg[k].endpoints[ep]) agg[k].endpoints[ep] = { chamadas: 0, sucesso: 0, falhas: 0 }
    agg[k].endpoints[ep].chamadas += row.chamadas ?? 0
    agg[k].endpoints[ep].sucesso  += row.sucesso ?? 0
    agg[k].endpoints[ep].falhas   += row.falhas ?? 0
  }

  // Execuções únicas no período
  const execucoes = new Set((data ?? []).map(r => (r as { execucao_id?: string }).execucao_id).filter(Boolean)).size

  // Limites cadastrados x consumo do período corrente (dia/mês em curso — independe do filtro `dias`)
  const { data: limitesRaw } = await supabaseAdmin
    .from('api_limits')
    .select('*')
    .eq('ativo', true)

  const agora = new Date()
  const inicioDia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1))

  const limites = []
  for (const lim of limitesRaw ?? []) {
    const inicio = lim.tipo === 'diario' ? inicioDia : inicioMes
    const { data: usoRows } = await supabaseAdmin
      .from('api_usage_log')
      .select('chamadas, tokens_input, tokens_output, custo_usd')
      .eq('api_name', lim.api_name)
      .gte('criado_em', inicio.toISOString())

    const consumido_chamadas = (usoRows ?? []).reduce((s, r) => s + (r.chamadas ?? 0), 0)
    const consumido_tokens   = (usoRows ?? []).reduce((s, r) => s + (r.tokens_input ?? 0) + (r.tokens_output ?? 0), 0)
    const consumido_custo_usd = (usoRows ?? []).reduce((s, r) => s + (r.custo_usd ?? 0), 0)

    let pct = 0
    if (lim.limite_chamadas) pct = Math.max(pct, consumido_chamadas / lim.limite_chamadas)
    if (lim.limite_tokens) pct = Math.max(pct, consumido_tokens / lim.limite_tokens)
    if (lim.limite_custo_usd) pct = Math.max(pct, consumido_custo_usd / lim.limite_custo_usd)

    limites.push({ ...lim, consumido_chamadas, consumido_tokens, consumido_custo_usd, pct })
  }

  // Série temporal diária de custo (últimos `dias` dias)
  const serie: Record<string, number> = {}
  for (const row of data ?? []) {
    const dia = (row.criado_em as string).slice(0, 10)
    serie[dia] = (serie[dia] ?? 0) + (row.custo_usd ?? 0)
  }

  return NextResponse.json({
    dias,
    execucoes,
    total_custo_usd: Object.values(agg).reduce((s, a) => s + a.custo_usd, 0),
    total_chamadas:  Object.values(agg).reduce((s, a) => s + a.chamadas, 0),
    apis: Object.values(agg).sort((a, b) => b.custo_usd - a.custo_usd),
    limites,
    serie_diaria: Object.entries(serie)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, custo]) => ({ dia, custo })),
  })
}
