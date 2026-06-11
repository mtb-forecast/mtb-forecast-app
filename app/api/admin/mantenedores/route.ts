import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function getAdminUser() {
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
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/admin/mantenedores — criar
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const body = await req.json()
  const { nome, logo_url, site_url, ativo } = body
  if (!nome?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })

  const { data, error } = await serviceClient()
    .from('mantenedores')
    .insert({ nome: nome.trim(), logo_url: logo_url || null, site_url: site_url || null, ativo: ativo ?? true })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/mantenedores — atualizar
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const body = await req.json()
  const { id, nome, logo_url, site_url, ativo } = body
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  if (!nome?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })

  const { error } = await serviceClient()
    .from('mantenedores')
    .update({ nome: nome.trim(), logo_url: logo_url || null, site_url: site_url || null, ativo: ativo ?? true })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
