export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string; profileId: string }> }

// DELETE /api/selecoes/[id]/membros/[profileId] — owner remove alguém, ou o próprio sai
export async function DELETE(_request: Request, { params }: Params) {
  const { id, profileId } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { error, count } = await supabase
    .from('selecao_membros')
    .delete({ count: 'exact' })
    .eq('selecao_id', id)
    .eq('profile_id', profileId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Membro não encontrado ou sem permissão' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
