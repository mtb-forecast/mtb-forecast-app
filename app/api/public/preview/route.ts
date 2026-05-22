import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [trilhasRes, configRes, avaliacoesRes] = await Promise.all([
    sb.from('trilhas').select('id, name').eq('aprovada', true).limit(2),
    sb.from('configuracoes_sistema').select('chave').limit(2),
    sb.from('observacoes_trilha').select('id').limit(2),
  ])

  return NextResponse.json({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 40),
    anonKeyPresent: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    trilhas: { data: trilhasRes.data, error: trilhasRes.error },
    config: { data: configRes.data, error: configRes.error },
    avaliacoes: { data: avaliacoesRes.data, error: avaliacoesRes.error },
  })
}
