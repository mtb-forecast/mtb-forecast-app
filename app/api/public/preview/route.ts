import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [{ data: trilhas }, { data: avaliacoes }] = await Promise.all([
    sb
      .from('trilhas')
      .select('id, name, regiao, trail_type, bioma, condicoes(veredicto, aderencia_status, acumulo_48h, wind_ms)')
      .eq('aprovada', true)
      .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
      .limit(4),
    sb
      .from('observacoes_trilha')
      .select('id, texto, veredicto_sistema, created_at, trilhas(name), profiles(apelido, nome)')
      .not('trilha_id', 'is', null)
      .not('texto', 'is', null)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  return NextResponse.json({ trilhas: trilhas ?? [], avaliacoes: avaliacoes ?? [] })
}
