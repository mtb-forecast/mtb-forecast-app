import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Kind = 'mtb_catalogo' | 'pumptrack'

export async function POST(req: NextRequest) {
  const cookieStore = cookies()
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  const isAdmin = !!profile?.is_admin

  const body = await req.json() as { kind: Kind; id: string }
  const { kind, id } = body
  if (!kind || !id) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify ownership if not admin
  if (!isAdmin) {
    if (kind === 'mtb_catalogo') {
      const { data } = await admin.from('trilhas').select('created_by').eq('id', id).maybeSingle()
      if (!data || data.created_by !== user.id)
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    } else if (kind === 'pumptrack') {
      const { data } = await admin.from('trilhas_pumptrack').select('user_id').eq('id', id).maybeSingle()
      if (!data || data.user_id !== user.id)
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }
  }

  // Execute delete
  let error: unknown = null
  if (kind === 'mtb_catalogo') {
    const res = await admin.from('trilhas').delete().eq('id', id)
    error = res.error
  } else if (kind === 'pumptrack') {
    const res = await admin.from('trilhas_pumptrack').delete().eq('id', id)
    error = res.error
  }

  if (error) {
    console.error('delete-item error:', error)
    return NextResponse.json({ error: 'Erro ao excluir' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
