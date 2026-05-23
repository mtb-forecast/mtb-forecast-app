'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    // Diagnóstico — ver o que chega na URL
    console.log('[Callback] href:', window.location.href)
    console.log('[Callback] hash:', window.location.hash)
    console.log('[Callback] search:', window.location.search)

    const hash = window.location.hash.substring(1)
    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    console.log('[Callback] access_token no hash:', accessToken ? '✅ presente' : '❌ ausente')

    // Se implicit flow funcionou, o token está no hash
    if (accessToken) {
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken ?? '',
      }).then(async ({ data, error }) => {
        console.log('[Callback] setSession result:', data?.user?.email, 'error:', error?.message)
        if (!error && data.user) {
          const { data: existing } = await supabase
            .from('profiles').select('id').eq('id', data.user.id).maybeSingle()
          if (!existing) {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email: data.user.email ?? '',
              plano: 'gratuito',
              is_admin: false,
            })
          }
          router.replace('/dashboard')
        } else {
          router.replace('/login?error=auth_failed')
        }
      })
      return
    }

    // Fallback: tenta getSession (caso detectSessionInUrl já processou)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[Callback] getSession:', session?.user?.email ?? 'null', 'error:', error?.message)
      if (session?.user) {
        router.replace('/dashboard')
      } else {
        // Aguarda até 8s pelo onAuthStateChange
        const unsub = supabase.auth.onAuthStateChange((event, session) => {
          console.log('[Callback] authStateChange:', event, session?.user?.email)
          if (event === 'SIGNED_IN' && session?.user) {
            clearTimeout(timeout)
            unsub.data.subscription.unsubscribe()
            router.replace('/dashboard')
          }
        })
        const timeout = setTimeout(() => {
          unsub.data.subscription.unsubscribe()
          router.replace('/login?error=auth_failed')
        }, 8000)
      }
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
