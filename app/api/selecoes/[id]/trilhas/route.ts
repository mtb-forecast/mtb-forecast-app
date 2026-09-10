export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

// POST /api/selecoes/[id]/trilhas — adiciona trilha(s) à seleção (owner ou membro)
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const trilhaIds: string[] = body?.trilha_id
    ? [body.trilha_id]
    : Array.isArray(body?.trilha_ids) ? body.trilha_ids : []

  if (trilhaIds.length === 0) return NextResponse.json({ error: 'trilha_id(s) obrigatório' }, { status: 400 })

  const itens = trilhaIds.map((trilha_id) => ({ selecao_id: id, trilha_id }))
  const { error } = await supabase.from('selecao_trilhas_itens').upsert(itens, { onConflict: 'selecao_id,trilha_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/selecoes/[id]/trilhas?trilha_id=... — remove trilha da seleção
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const trilhaId = new URL(request.url).searchParams.get('trilha_id')
  if (!trilhaId) return NextResponse.json({ error: 'trilha_id obrigatório' }, { status: 400 })

  const { error } = await supabase
    .from('selecao_trilhas_itens')
    .delete()
    .eq('selecao_id', id)
    .eq('trilha_id', trilhaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
