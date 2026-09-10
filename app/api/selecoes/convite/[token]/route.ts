export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ token: string }> }

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/selecoes/convite/[token] — preview público (usuário pode nem estar logado ainda)
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params
  const supabase = serviceClient()

  const { data: convite, error } = await supabase
    .from('selecao_convites')
    .select('id, selecao_id, expira_em, usado_por, criado_por, selecoes_trilhas ( nome, data )')
    .eq('token', token)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!convite) return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  if (convite.usado_por) return NextResponse.json({ error: 'Convite já foi usado' }, { status: 410 })
  if (new Date(convite.expira_em) < new Date()) {
    return NextResponse.json({ error: 'Convite expirado' }, { status: 410 })
  }

  const selecao = Array.isArray(convite.selecoes_trilhas) ? convite.selecoes_trilhas[0] : convite.selecoes_trilhas

  return NextResponse.json({
    selecao_id: convite.selecao_id,
    nome: selecao?.nome ?? null,
    data: selecao?.data ?? null,
  })
}
