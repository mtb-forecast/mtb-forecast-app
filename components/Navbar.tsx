'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setIsLoggedIn(!!session)
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', session.user.id)
          .single()
        setIsAdmin(!!data?.is_admin)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/cadastro')
  if (isAuthPage) return null

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/trilhas', label: 'Trilhas' },
    { href: '/perfil', label: 'Perfil' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{ background: '#ffffff', borderBottom: '1px solid #E0E0E0' }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href={isLoggedIn ? '/dashboard' : '/'} className="flex items-center gap-2">
          <span className="text-xl">🚵</span>
          <span className="font-wheat text-[#111111] text-xl">MTB Forecast</span>
        </Link>

        {/* Desktop nav */}
        {isLoggedIn ? (
          <div className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm font-medium transition-colors text-[#111111] hover:text-[#555555]"
                style={pathname === link.href ? {
                  borderBottom: '2px solid #FFE000',
                  paddingBottom: '6px',
                } : {}}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="ml-2 text-[#555555] hover:text-[#111111] text-sm font-medium transition-colors px-3 py-2"
            >
              Sair
            </button>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/login" className="text-[#111111] hover:text-[#555555] text-sm font-medium transition-colors">
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="text-[#111111] text-sm font-semibold px-4 py-2 rounded-lg transition-all"
              style={{ background: '#FFE000' }}
            >
              Criar conta
            </Link>
          </div>
        )}

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 text-[#111111]"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Menu"
        >
          {isMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div
          className="sm:hidden px-4 py-3 space-y-1"
          style={{ borderTop: '1px solid #E0E0E0', background: '#ffffff' }}
        >
          {isLoggedIn ? (
            <>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-[#111111] hover:bg-[#F5F5F5]"
                  style={pathname === link.href ? { background: '#FFE000' } : {}}
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-[#555555] hover:bg-[#F5F5F5] transition-colors"
              >
                Sair da conta
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => setIsMenuOpen(false)} className="block px-4 py-2.5 text-[#111111] text-sm font-medium">
                Entrar
              </Link>
              <Link
                href="/cadastro"
                onClick={() => setIsMenuOpen(false)}
                className="block px-4 py-2.5 text-[#111111] font-semibold text-sm rounded-lg"
                style={{ background: '#FFE000' }}
              >
                Criar conta grátis
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
