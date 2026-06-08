'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function NovaSenhaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError('Não foi possível atualizar a senha. O link pode ter expirado.')
    } else {
      setSuccess(true)
      setTimeout(() => router.replace('/dashboard'), 2500)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 40, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>

        <Link href="/" className="font-wheat" style={{ color: '#2a2e25', fontSize: 16, letterSpacing: '1.5px', display: 'block', marginBottom: 32 }}>
          MTB FORECASTER
        </Link>

        <h2 className="font-wheat" style={{ fontSize: 26, color: '#2a2e25', marginBottom: 8 }}>Nova senha</h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 28, lineHeight: 1.6 }}>
          Escolha uma nova senha para sua conta.
        </p>

        {success ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
            <p style={{ fontSize: 14, color: '#166534', fontWeight: 500 }}>Senha atualizada com sucesso!</p>
            <p style={{ fontSize: 13, color: '#15803d', marginTop: 4 }}>Redirecionando...</p>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Nova senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="mínimo 6 caracteres"
                  className="input-field"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Confirmar senha</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="repita a nova senha"
                  className="input-field"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: '#6d745f', color: '#fff',
                  border: 'none', borderRadius: 4,
                  padding: '10px 20px', fontSize: 14, fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  width: '100%', marginTop: 8,
                }}
              >
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
