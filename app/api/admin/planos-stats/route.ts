import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { data: rows } = await supabase
    .from('profiles')
    .select('plano')

  const counts: Record<string, number> = {
    gratuito: 0,
    plano_a: 0,
    plano_b: 0,
    plano_c: 0,
  }

  for (const row of rows ?? []) {
    const key = row.plano ?? 'gratuito'
    if (key in counts) counts[key]++
    else counts['gratuito']++
  }

  const stats = Object.entries(counts).map(([plano, total]) => ({ plano, total }))

  return NextResponse.json({ stats })
}
