export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

// POST /api/selecoes/[id]/convite — gera link de convite (owner ou membro) para
// compartilhar com quem ainda não tem conta (ex: via WhatsApp)
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createSupabaseRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: convite, error } = await supabase
    .from('selecao_convites')
    .insert({ selecao_id: id, criado_por: user.id })
    .select('token, expira_em')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(_request.url).origin
  const link = `${baseUrl}/selecoes/convite/${convite.token}`

  return NextResponse.json({ token: convite.token, link, expira_em: convite.expira_em }, { status: 201 })
}
