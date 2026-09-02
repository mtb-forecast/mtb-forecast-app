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

// GET /api/admin/api-limits — listar
export async function GET() {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { data, error } = await serviceClient()
    .from('api_limits')
    .select('*')
    .order('api_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/api-limits — criar ou atualizar (upsert por api_name + tipo)
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const body = await req.json()
  const { api_name, tipo, limite_chamadas, limite_tokens, limite_custo_usd, ativo } = body

  if (!api_name?.trim()) return NextResponse.json({ error: 'api_name obrigatório' }, { status: 400 })
  if (tipo !== 'diario' && tipo !== 'mensal') return NextResponse.json({ error: 'tipo deve ser "diario" ou "mensal"' }, { status: 400 })
  if (!limite_chamadas && !limite_tokens && !limite_custo_usd) {
    return NextResponse.json({ error: 'Informe ao menos um limite (chamadas, tokens ou custo)' }, { status: 400 })
  }

  const { data, error } = await serviceClient()
    .from('api_limits')
    .upsert({
      api_name: api_name.trim(),
      tipo,
      limite_chamadas: limite_chamadas || null,
      limite_tokens: limite_tokens || null,
      limite_custo_usd: limite_custo_usd || null,
      ativo: ativo ?? true,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'api_name,tipo' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/admin/api-limits?id=... — remover
export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const { error } = await serviceClient().from('api_limits').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
