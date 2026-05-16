import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const VALID_PLANOS = new Set(['gratuito', 'plano_a', 'plano_b', 'plano_c'])

function resolvePlano(raw: string | null | undefined): string {
  if (!raw || !VALID_PLANOS.has(raw)) return 'gratuito'
  return raw
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: meProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .single()

  if (!meProfile?.is_admin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Fetch all auth users (paginated)
  const allUsers: { id: string }[] = []
  let page = 1
  while (true) {
    const { data: authData, error: usersError } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (usersError) return NextResponse.json({ error: 'Erro ao buscar usuários' }, { status: 500 })
    allUsers.push(...authData.users)
    if (authData.users.length < 1000) break
    page++
  }

  // 2. Fetch all profiles (id + plano only)
  const { data: profileRows, error: profilesError } = await adminClient
    .from('profiles')
    .select('id, plano')

  if (profilesError) return NextResponse.json({ error: 'Erro ao buscar profiles' }, { status: 500 })

  // 3. Build map: user_id → resolved plano (null/absent → 'gratuito')
  const planoByUserId = new Map<string, string>()
  for (const row of profileRows ?? []) {
    planoByUserId.set(row.id, resolvePlano(row.plano))
  }

  // 4. Count every auth user — absent from profiles → 'gratuito'
  const counts: Record<string, number> = {
    gratuito: 0,
    plano_a: 0,
    plano_b: 0,
    plano_c: 0,
  }

  for (const user of allUsers) {
    const plano = resolvePlano(planoByUserId.get(user.id))
    counts[plano]++
  }

  const stats = Object.entries(counts).map(([plano, total]) => ({ plano, total }))
  return NextResponse.json({ stats })
}
