import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ error: 'env missing', hasUrl: !!url, hasKey: !!key }, { status: 500 })
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const trilhasRes = await sb
    .from('trilhas')
    .select('id, name, regiao, trail_type, bioma')
    .eq('aprovada', true)
    .limit(4)

  const condRes = trilhasRes.data?.length
    ? await sb
        .from('condicoes')
        .select('trilha_id, veredicto, aderencia_status, acumulo_48h, wind_ms, gerado_em')
        .in('trilha_id', trilhasRes.data.map((t: { id: string }) => t.id))
        .order('gerado_em', { ascending: false })
    : { data: [], error: null }

  const avaliacoesRes = await sb
    .from('observacoes_trilha')
    .select('id, texto, veredicto_sistema, created_at, trilha_id, user_id')
    .not('trilha_id', 'is', null)
    .not('texto', 'is', null)
    .order('created_at', { ascending: false })
    .limit(6)

  return NextResponse.json({
    debug: {
      trilhasError: trilhasRes.error,
      condError: condRes.error,
      avaliacoesError: avaliacoesRes.error,
      trilhasCount: trilhasRes.data?.length ?? 0,
      condCount: condRes.data?.length ?? 0,
      avaliacoesCount: avaliacoesRes.data?.length ?? 0,
    },
    trilhas: trilhasRes.data ?? [],
    condicoes: condRes.data ?? [],
    avaliacoes: avaliacoesRes.data ?? [],
  })
}
