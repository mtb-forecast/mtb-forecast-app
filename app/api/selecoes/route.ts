export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-server'

// GET /api/selecoes — lista as seleções do usuário (owner ou membro), incluindo histórico
export async function GET() {
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('selecoes_trilhas')
    .select('id, nome, owner_id, data, created_at, selecao_trilhas_itens(trilha_id), selecao_membros(profile_id)')
    .order('data', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const selecoes = (data ?? []).map((s: any) => ({
    id: s.id,
    nome: s.nome,
    owner_id: s.owner_id,
    data: s.data,
    created_at: s.created_at,
    is_owner: s.owner_id === user.id,
    total_trilhas: s.selecao_trilhas_itens?.length ?? 0,
    total_membros: s.selecao_membros?.length ?? 0,
  }))

  return NextResponse.json({ selecoes })
}

// POST /api/selecoes — cria seleção (nome, data, trilhas iniciais opcionais)
export async function POST(request: Request) {
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const nome: string | undefined = body?.nome?.trim()
  const data: string | undefined = body?.data
  const trilhaIds: string[] = Array.isArray(body?.trilha_ids) ? body.trilha_ids : []

  if (!nome) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Data inválida (formato YYYY-MM-DD)' }, { status: 400 })
  }

  const { data: selecao, error } = await supabase
    .from('selecoes_trilhas')
    .insert({ nome, data, owner_id: user.id })
    .select('id, nome, owner_id, data, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (trilhaIds.length > 0) {
    const itens = trilhaIds.map((trilha_id) => ({ selecao_id: selecao.id, trilha_id }))
    const { error: itensError } = await supabase.from('selecao_trilhas_itens').insert(itens)
    if (itensError) return NextResponse.json({ error: itensError.message }, { status: 500 })
  }

  return NextResponse.json({ selecao }, { status: 201 })
}
