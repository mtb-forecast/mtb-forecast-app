import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
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

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authData, error: usersError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  if (usersError) return NextResponse.json({ error: 'Erro ao buscar usuários' }, { status: 500 })

  const { data: profiles } = await adminClient.from('profiles').select('id, plano')

  const planoMap = new Map<string, string>()
  for (const p of profiles ?? []) {
    planoMap.set(p.id, p.plano ?? 'gratuito')
  }

  const counts: Record<string, number> = {
    gratuito: 0,
    plano_a: 0,
    plano_b: 0,
    plano_c: 0,
  }

  for (const user of authData.users) {
    const plano = planoMap.get(user.id) ?? 'gratuito'
    const key = plano in counts ? plano : 'gratuito'
    counts[key]++
  }

  const stats = Object.entries(counts).map(([plano, total]) => ({ plano, total }))
  return NextResponse.json({ stats })
}
