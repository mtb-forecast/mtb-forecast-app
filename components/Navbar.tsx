'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { supabase, getClientUser } from '@/lib/supabase'

const HIDDEN_ON = ['/', '/login', '/cadastro']

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [userInitial, setUserInitial] = useState<string>('')

  useEffect(() => {
    async function loadUser() {
      const user = await getClientUser()
      if (!user) { setIsLoggedIn(false); return }
      setIsLoggedIn(true)

      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, apelido, nome, email')
        .eq('id', user.id)
        .single()

      if (data) {
        setAvatarUrl(data.avatar_url || null)
        const label = data.apelido || data.nome || data.email || '?'
        setUserInitial(label[0].toUpperCase())
      }
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setIsLoggedIn(false)
        setAvatarUrl(null)
        setUserInitial('')
      } else {
        loadUser()
      }
    })
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
          color: #a8b899;
          cursor: pointer;
          padding: 0;
          transition: color 0.15s;
        }
        .nb-btn:hover { color: #f4f5f0; }
        @media (max-width: 480px) {
          .nb-inner { padding-left: 12px !important; padding-right: 12px !important; }
        }
      `}</style>

      <nav style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 50,
        background: '#2a2e25',
        height: 56,
        borderBottom: '1px solid #3a4035',
      }}>
        <div className="nb-inner" style={{
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Link href="/perfil" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: '#2a2a2a', border: '1.5px solid #444',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt="Perfil" width={30} height={30} style={{ objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    <span style={{ fontSize: 13, color: '#aaa', fontWeight: 600 }}>{userInitial}</span>
                  )}
                </div>
              </Link>
              <button className="nb-btn" onClick={handleLogout}>
                Sair
              </button>
            </div>
          )}

          {!isLoggedIn && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Link href="/login" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#a8b899', textDecoration: 'none' }}>
                Entrar
              </Link>
              <Link
                href="/cadastro"
                style={{
                  background: '#6d745f', color: '#fff',
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
