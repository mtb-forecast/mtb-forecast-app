import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Limites cadastrados x consumo do período corrente (dia/mês em curso)
  const { data: limitesRaw, error } = await supabaseAdmin
    .from('api_limits')
    .select('*')
    .eq('ativo', true)
    .order('api_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  return NextResponse.json({ limites })
}
