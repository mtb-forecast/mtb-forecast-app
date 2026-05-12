'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setIsLoggedIn(!!user)
        if (!user) { setLoadingProfile(false); return }
        const { data } = await supabase
          .from('profiles')
          .select('is_admin, nome, apelido')
          .eq('id', user.id)
          .single()
        setProfile(data as Profile | null)
      } catch (err) {
        console.error('Erro ao carregar perfil:', err)
      } finally {
        setLoadingProfile(false)
      }
    }

    fetchProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setLoadingProfile(true)
      fetchProfile()
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  // Hide on landing and auth pages (they have their own headers)
  if (!pathname || pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/cadastro') || pathname.startsWith('/t/')) return null

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/trilhas', label: 'Trilhas' },
    { href: '/perfil', label: 'Perfil' },
    ...(!loadingProfile && profile?.is_admin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: '#fff',
      borderBottom: '1px solid #e5e5e5',
      height: 56,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 32px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <Link
          href={isLoggedIn ? '/dashboard' : '/'}
          className="font-wheat"
          style={{ fontSize: 18, letterSpacing: '1.5px', color: '#111' }}
        >
          MTB FORECAST
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex" style={{ alignItems: 'center', gap: 24 }}>
          {isLoggedIn ? (
            <>
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    fontSize: 13,
                    color: isActive(link.href) ? '#111' : '#888',
                    fontWeight: isActive(link.href) ? 500 : 400,
                    borderBottom: isActive(link.href) ? '2px solid #FFE000' : 'none',
                    paddingBottom: isActive(link.href) ? 2 : 0,
                    transition: 'color 0.15s',
                  }}
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                style={{
                  background: 'none', border: 'none',
                  color: '#888', fontSize: 13, cursor: 'pointer',
                }}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <Link href="/login" style={{ fontSize: 13, color: '#888' }}>Entrar</Link>
              <Link
                href="/cadastro"
                style={{
                  background: '#FFE000', color: '#111',
                  border: '1.5px solid #111', borderRadius: 4,
                  padding: '7px 16px', fontSize: 13, fontWeight: 500,
                }}
              >
                Criar conta
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}
          aria-label="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2">
            {isMenuOpen
              ? <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
              : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="sm:hidden" style={{ background: '#111', borderTop: '1px solid #222' }}>
          <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {isLoggedIn ? (
              <>
                {navLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    style={{
                      color: isActive(link.href) ? '#FFE000' : '#fff',
                      fontSize: 14,
                      fontWeight: isActive(link.href) ? 500 : 400,
                      padding: '10px 0',
                      borderBottom: '1px solid #222',
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
                <button
                  onClick={handleLogout}
                  style={{
                    background: 'none', border: 'none',
                    color: '#888', fontSize: 14,
                    textAlign: 'left', padding: '10px 0', cursor: 'pointer',
                  }}
                >
                  Sair da conta
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setIsMenuOpen(false)}
                  style={{ color: '#888', fontSize: 14, padding: '10px 0', borderBottom: '1px solid #222' }}
                >
                  Entrar
                </Link>
                <Link
                  href="/cadastro"
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    background: '#FFE000', color: '#111',
                    fontSize: 14, fontWeight: 500,
                    padding: '10px 16px', borderRadius: 4,
                    textAlign: 'center', marginTop: 10,
                  }}
                >
                  Criar conta grátis
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
