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
  const [pendingApprovals, setPendingApprovals] = useState(0)

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
        if (data?.is_admin) {
          const { count } = await supabase
            .from('admin_aprovacoes')
            .select('id', { count: 'exact', head: true })
            .eq('aprovador_id', user.id)
            .eq('status', 'pendente')
          setPendingApprovals(count ?? 0)
        }
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

  if (!pathname || pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/cadastro') || pathname.startsWith('/t/')) return null

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/trilhas', label: 'Trilhas' },
    { href: '/planos', label: 'Planos' },
    { href: '/perfil', label: 'Perfil' },
    ...(!loadingProfile && profile?.is_admin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <style>{`
        body { padding-top: 56px; }

        .nb-link {
          font-size: 0.875rem;
          font-weight: 500;
          color: #999;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 6px;
          padding-bottom: 2px;
          border-bottom: 2px solid transparent;
          transition: color 0.15s, border-color 0.15s;
        }
        .nb-link:hover { color: #fff; }
        .nb-link.active { color: #fff; border-bottom-color: #FFE000; }

        .nb-btn {
          background: none;
          border: none;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          color: #999;
          cursor: pointer;
          padding: 0;
          transition: color 0.15s;
        }
        .nb-btn:hover { color: #fff; }

        .nb-mobile-link {
          font-size: 0.9375rem;
          font-weight: 500;
          color: #999;
          text-decoration: none;
          padding: 14px 0;
          border-bottom: 1px solid #2A2A2A;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: color 0.15s;
        }
        .nb-mobile-link:hover { color: #fff; }
        .nb-mobile-link.active { color: #FFE000; }

        .nb-mobile-menu {
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transition: max-height 0.25s ease, opacity 0.2s ease;
        }
        .nb-mobile-menu.open {
          max-height: 480px;
          opacity: 1;
        }
      `}</style>

      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: '#1A1A1A',
        height: 56,
        borderBottom: '1px solid #2A2A2A',
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
            style={{
              fontWeight: 800,
              letterSpacing: '0.08em',
              fontSize: '0.9375rem',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            MTB FORECASTER
          </Link>

          {/* Desktop links */}
          <div className="hidden sm:flex" style={{ alignItems: 'center', gap: 32 }}>
            {isLoggedIn ? (
              <>
                {navLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`nb-link${isActive(link.href) ? ' active' : ''}`}
                  >
                    {link.label}
                    {link.href === '/admin' && pendingApprovals > 0 && (
                      <span style={{
                        background: '#ef4444', color: '#fff',
                        borderRadius: 10, fontSize: 10, fontWeight: 700,
                        padding: '1px 6px', lineHeight: 1.4,
                      }}>
                        {pendingApprovals}
                      </span>
                    )}
                  </Link>
                ))}
                <button className="nb-btn" onClick={handleLogout}>
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="nb-link">Entrar</Link>
                <Link
                  href="/cadastro"
                  style={{
                    background: '#FFE000', color: '#111',
                    borderRadius: 4, padding: '6px 16px',
                    fontSize: '0.875rem', fontWeight: 600,
                    textDecoration: 'none',
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              {isMenuOpen
                ? <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
                : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        <div
          className={`sm:hidden nb-mobile-menu${isMenuOpen ? ' open' : ''}`}
          style={{ background: '#1A1A1A', borderTop: '1px solid #2A2A2A' }}
        >
          <div style={{ padding: '0 24px 16px' }}>
            {isLoggedIn ? (
              <>
                {navLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`nb-mobile-link${isActive(link.href) ? ' active' : ''}`}
                  >
                    {link.label}
                    {link.href === '/admin' && pendingApprovals > 0 && (
                      <span style={{
                        background: '#ef4444', color: '#fff',
                        borderRadius: 10, fontSize: 10, fontWeight: 700,
                        padding: '1px 6px', lineHeight: 1.4,
                      }}>
                        {pendingApprovals}
                      </span>
                    )}
                  </Link>
                ))}
                <button
                  onClick={handleLogout}
                  style={{
                    background: 'none', border: 'none',
                    color: '#999', fontSize: '0.9375rem', fontWeight: 500,
                    fontFamily: 'inherit', textAlign: 'left',
                    padding: '14px 0', cursor: 'pointer', width: '100%',
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
                  className="nb-mobile-link"
                >
                  Entrar
                </Link>
                <Link
                  href="/cadastro"
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    background: '#FFE000', color: '#111',
                    fontSize: '0.9375rem', fontWeight: 600,
                    padding: '10px 16px', borderRadius: 4,
                    textAlign: 'center', marginTop: 12,
                    display: 'block', textDecoration: 'none',
                  }}
                >
                  Criar conta grátis
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}
