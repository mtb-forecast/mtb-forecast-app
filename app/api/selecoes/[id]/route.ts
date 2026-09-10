export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

// GET /api/selecoes/[id] — detalhe: trilhas + membros
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: selecao, error } = await supabase
    .from('selecoes_trilhas')
    .select(`
      id, nome, owner_id, data, created_at,
      selecao_trilhas_itens ( trilha_id, trilhas ( id, name, solo_type, exposicao, regiao, bioma, trail_type ) ),
      selecao_membros ( id, profile_id, created_at, profile:profiles ( id, nome, apelido, email ) )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!selecao) return NextResponse.json({ error: 'Seleção não encontrada' }, { status: 404 })

  return NextResponse.json({
    selecao: {
      id: selecao.id,
      nome: selecao.nome,
      owner_id: selecao.owner_id,
      data: selecao.data,
      created_at: selecao.created_at,
      is_owner: selecao.owner_id === user.id,
      trilhas: (selecao as any).selecao_trilhas_itens?.map((it: any) => it.trilhas).filter(Boolean) ?? [],
      membros: (selecao as any).selecao_membros ?? [],
    },
  })
}

// PATCH /api/selecoes/[id] — renomear/mudar data (owner-only, RLS barra o resto)
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const updates: Record<string, string> = {}
  if (typeof body?.nome === 'string' && body.nome.trim()) updates.nome = body.nome.trim()
  if (typeof body?.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.data)) updates.data = body.data

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  const { data: selecao, error } = await supabase
    .from('selecoes_trilhas')
    .update(updates)
    .eq('id', id)
    .select('id, nome, owner_id, data, created_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!selecao) return NextResponse.json({ error: 'Seleção não encontrada ou sem permissão' }, { status: 404 })

  return NextResponse.json({ selecao })
}

// DELETE /api/selecoes/[id] — owner-only (RLS barra o resto)
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { error, count } = await supabase
    .from('selecoes_trilhas')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Seleção não encontrada ou sem permissão' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
