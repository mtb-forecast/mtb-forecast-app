export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ token: string }> }

// POST /api/selecoes/convite/[token]/aceitar — exige sessão autenticada.
// Usa service role porque quem aceita ainda não é membro (RLS não deixaria
// nem ler o convite nem se auto-inserir em selecao_membros).
export async function POST(_request: Request, { params }: Params) {
  const { token } = await params

  const userClient = await createSupabaseRouteClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: convite, error } = await admin
    .from('selecao_convites')
    .select('id, selecao_id, expira_em, usado_por')
    .eq('token', token)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!convite) return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  if (convite.usado_por) return NextResponse.json({ error: 'Convite já foi usado' }, { status: 410 })
  if (new Date(convite.expira_em) < new Date()) {
    return NextResponse.json({ error: 'Convite expirado' }, { status: 410 })
  }

  const { error: membroError } = await admin
    .from('selecao_membros')
    .upsert({ selecao_id: convite.selecao_id, profile_id: user.id }, { onConflict: 'selecao_id,profile_id', ignoreDuplicates: true })

  if (membroError) return NextResponse.json({ error: membroError.message }, { status: 500 })

  await admin
    .from('selecao_convites')
    .update({ usado_por: user.id })
    .eq('id', convite.id)

  return NextResponse.json({ ok: true, selecao_id: convite.selecao_id })
}
