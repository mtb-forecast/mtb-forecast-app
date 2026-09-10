export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

// GET /api/selecoes/[id]/membros?q=... — busca usuário já cadastrado (nome/apelido/email)
// para adicionar como colaborador; exclui quem já é membro.
export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ perfis: [] })

  const { data: membrosAtuais } = await supabase
    .from('selecao_membros')
    .select('profile_id')
    .eq('selecao_id', id)
  const excluidos = new Set((membrosAtuais ?? []).map((m) => m.profile_id))

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, apelido, email')
    .or(`nome.ilike.%${q}%,apelido.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const perfis = (data ?? []).filter((p) => p.id !== user.id && !excluidos.has(p.id))
  return NextResponse.json({ perfis })
}

// POST /api/selecoes/[id]/membros — adiciona usuário já cadastrado como colaborador
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const profileId: string | undefined = body?.profile_id
  if (!profileId) return NextResponse.json({ error: 'profile_id obrigatório' }, { status: 400 })

  const { error } = await supabase
    .from('selecao_membros')
    .insert({ selecao_id: id, profile_id: profileId })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}
