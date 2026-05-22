import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const publicRoutes = ['/login', '/cadastro', '/auth/callback', '/t/', '/api/telegram/', '/planos']
  const isPublic = publicRoutes.some(route => req.nextUrl.pathname.startsWith(route))
  const isProtected = !isPublic && req.nextUrl.pathname !== '/'

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|icons).*)'],
}
