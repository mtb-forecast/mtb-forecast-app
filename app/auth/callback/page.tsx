'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    // createClientComponentClient detectSessionInUrl=true faz o exchange automaticamente.
    // Escutamos o evento resultante em vez de chamar exchangeCodeForSession manualmente.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Garante que o perfil existe
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle()

        if (!existing) {
          await supabase.from('profiles').upsert({
            id: session.user.id,
            email: session.user.email ?? '',
            plano: 'gratuito',
            is_admin: false,
          })
        }

        router.replace('/dashboard')
      }
    })

    // Caso o exchange já tenha ocorrido antes do listener ser registrado
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.replace('/dashboard')
      }
    })

    // Timeout de segurança: se nada acontecer em 10s, volta ao login
    const timeout = setTimeout(() => {
      router.replace('/login?error=auth_failed')
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
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
