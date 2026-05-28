'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const HIDDEN_ON = ['/', '/login', '/cadastro']

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    async function fetchSession() {
      const { data: { user } } = await supabase.auth.getUser()
      setIsLoggedIn(!!user)
    }
    fetchSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => fetchSession())
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (!pathname) return null
  if (HIDDEN_ON.some(p => pathname === p || pathname.startsWith(p + '/'))) return null
  if (pathname.startsWith('/t/')) return null

  return (
    <>
      <style>{`
        body { padding-top: 56px; }

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
      `}</style>

      <nav style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
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

          {isLoggedIn && (
            <button className="nb-btn" onClick={handleLogout}>
              Sair
            </button>
          )}

          {!isLoggedIn && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Link href="/login" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#999', textDecoration: 'none' }}>
                Entrar
              </Link>
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
            </div>
          )}
        </div>
      </nav>
    </>
  )
}
