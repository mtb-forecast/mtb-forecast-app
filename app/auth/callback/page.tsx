'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    // Recovery flow: fragment contains type=recovery
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          subscription.unsubscribe()
          router.replace('/auth/nova-senha')
        }
      })
      return () => subscription.unsubscribe()
    }

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          const { data: existing } = await supabase
            .from('profiles').select('id').eq('id', session.user.id).maybeSingle()
          if (!existing) {
            await supabase.from('profiles').upsert({
              id: session.user.id,
              email: session.user.email ?? '',
              plano: 'gratuito',
              is_admin: false,
            })
          }
          router.replace('/dashboard')
          return
        }

        // Aguarda o exchange automático do @supabase/ssr
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            subscription.unsubscribe()
            clearTimeout(timeout)
            router.replace('/dashboard')
          }
        })

        const timeout = setTimeout(() => {
          subscription.unsubscribe()
          router.replace('/login?error=auth_failed')
        }, 10000)
      })
      .catch(() => {
        router.replace('/login?error=auth_failed')
      })
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, border: '2px solid #e5e5e5',
          borderTopColor: '#111', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: '#888', fontSize: 14 }}>Autenticando...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
