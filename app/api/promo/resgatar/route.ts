export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { CODIGOS_PROMO } from '@/lib/stripe-config'

export async function POST(req: Request) {
  const { codigo } = await req.json()
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

  const planoId = CODIGOS_PROMO[codigo?.toUpperCase().trim()]
  if (!planoId) return NextResponse.json({ error: 'Código inválido ou inexistente.' }, { status: 400 })

  const { error } = await supabase
    .from('profiles')
    .update({ plano: planoId })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: 'Erro ao resgatar.' }, { status: 500 })
  return NextResponse.json({ plano: planoId })
}

