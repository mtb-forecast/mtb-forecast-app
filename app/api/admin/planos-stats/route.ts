import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const VALID_PLANOS = new Set(['plano_a', 'plano_b', 'plano_c'])

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: meProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!meProfile?.is_admin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profileRows, error: profilesError } = await adminClient
    .from('profiles')
    .select('plano')

  if (profilesError) return NextResponse.json({ error: 'Erro ao buscar profiles' }, { status: 500 })

  const counts: Record<string, number> = {
    plano_a: 0,
    plano_b: 0,
    plano_c: 0,
  }

  for (const row of profileRows ?? []) {
    const plano = row.plano
    const key = (typeof plano === 'string' && plano !== '' && VALID_PLANOS.has(plano))
      ? plano
      : 'plano_a'
    counts[key]++
  }

  const stats = Object.entries(counts).map(([plano, total]) => ({ plano, total }))
  return NextResponse.json({ stats })
}
