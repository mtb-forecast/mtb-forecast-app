export const dynamic = 'force-dynamic'

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { CODIGOS_PROMO } from '@/lib/stripe-config'

export async function POST(req: Request) {
  const { codigo } = await req.json()
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const planoId = CODIGOS_PROMO[codigo?.toUpperCase().trim()]
  if (!planoId) return NextResponse.json({ error: 'Código inválido ou inexistente.' }, { status: 400 })

  const { error } = await supabase
    .from('profiles')
    .update({ plano: planoId })
    .eq('id', session.user.id)

  if (error) return NextResponse.json({ error: 'Erro ao resgatar.' }, { status: 500 })
  return NextResponse.json({ plano: planoId })
}
