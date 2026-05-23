'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code')

      if (!code) {
        router.replace('/login?error=no_code')
        return
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error || !data.user) {
        router.replace('/login?error=auth_failed')
        return
      }

      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!existing) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email ?? '',
          plano: 'gratuito',
          is_admin: false,
        })
      }

      router.replace('/dashboard')
    }

    handleCallback()
  }, [searchParams, router])

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

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  )
}
