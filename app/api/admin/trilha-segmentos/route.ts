import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function getAdminUser() {
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

// Lista os trechos (trilhas componentes) de uma trilha composta.
export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const trilhaCompostaId = req.nextUrl.searchParams.get('trilha_composta_id')
  if (!trilhaCompostaId) return NextResponse.json({ error: 'trilha_composta_id obrigatório' }, { status: 400 })

  const { data, error } = await serviceClient()
    .from('trilha_segmentos')
    .select('id, ordem, trilha:trilhas!trilha_componente_id(id, name)')
    .eq('trilha_composta_id', trilhaCompostaId)
    .order('ordem')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segmentos: data })
}

// Adiciona um trecho (trilha componente já existente no catálogo).
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { trilha_composta_id, trilha_componente_id, ordem } = await req.json()
  if (!trilha_composta_id || !trilha_componente_id) {
    return NextResponse.json({ error: 'trilha_composta_id e trilha_componente_id obrigatórios' }, { status: 400 })
  }
  if (trilha_composta_id === trilha_componente_id) {
    return NextResponse.json({ error: 'Uma trilha não pode ser trecho de si mesma' }, { status: 400 })
  }

  const { error } = await serviceClient()
    .from('trilha_segmentos')
    .insert({ trilha_composta_id, trilha_componente_id, ordem: ordem ?? 0 })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Remove um trecho.
export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const { error } = await serviceClient()
    .from('trilha_segmentos')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
