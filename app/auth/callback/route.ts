import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url))
  }

  const supabase = createRouteHandlerClient({ cookies })
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error?.message)
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', data.user.id)
    .single()

  if (!existing) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email ?? '',
      plano: 'gratuito',
      is_admin: false,
    })
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
