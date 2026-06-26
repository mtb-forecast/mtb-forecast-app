'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, getClientUser } from '@/lib/supabase'

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) {
        router.replace('/dashboard')
        return
      }

      setIsAdmin(true)
      setLoading(false)
    }
    load()
  }, [router])

  async function corrigirLocalidades() {
    setBackfilling(true)
    setBackfillMsg(null)
    try {
      const res = await fetch('/api/admin/backfill-localidades', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido')
      setBackfillMsg(`✓ ${data.atualizadas} trilha(s) corrigida(s) de ${data.total} — sem geo: ${data.sem_geo}, erros: ${data.erros}`)
    } catch (e: unknown) {
      setBackfillMsg(`Erro: ${e instanceof Error ? e.message : 'falha na requisição'}`)
    } finally {
      setBackfilling(false)
      setTimeout(() => setBackfillMsg(null), 8000)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Admin</h1>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '1px',
              background: '#6d745f', color: '#fff',
              borderRadius: 2, padding: '3px 8px',
            }}>
              ADMIN
            </span>
          </div>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <Link
            href="/admin/trilhas"
            style={{
              background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8,
              padding: '16px 24px', flex: 1, minWidth: 140,
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
            }}
          >
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Trilhas</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 'auto' }}>Editar trilhas do catálogo</p>
            <p style={{ fontSize: 12, color: '#6d745f', fontWeight: 500, marginTop: 12 }}>Gerenciar →</p>
          </Link>
          <Link
            href="/admin/mantenedores"
            style={{
              background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8,
              padding: '16px 24px', flex: 1, minWidth: 140,
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
            }}
          >
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Mantenedores</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 'auto' }}>Parques e clubes mantendo trilhas</p>
            <p style={{ fontSize: 12, color: '#6d745f', fontWeight: 500, marginTop: 12 }}>Gerenciar →</p>
          </Link>
          <Link
            href="/admin/importar-strava"
            style={{
              background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8,
              padding: '16px 24px', flex: 1, minWidth: 140,
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
            }}
          >
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Importar Strava</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 'auto' }}>Segmentos favoritos → trilhas</p>
            <p style={{ fontSize: 12, color: '#FC4C02', fontWeight: 500, marginTop: 12 }}>Importar →</p>
          </Link>
          <Link
            href="/admin/api-usage"
            style={{
              background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8,
              padding: '16px 24px', flex: 1, minWidth: 140,
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
            }}
          >
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Consumo de APIs</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 'auto' }}>Chamadas, tokens e custos estimados</p>
            <p style={{ fontSize: 12, color: '#6d745f', fontWeight: 500, marginTop: 12 }}>Ver relatório →</p>
          </Link>
          <button
            onClick={corrigirLocalidades}
            disabled={backfilling}
            style={{
              background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8,
              padding: '16px 24px', flex: 1, minWidth: 140,
              textAlign: 'left', cursor: backfilling ? 'wait' : 'pointer',
              display: 'flex', flexDirection: 'column', opacity: backfilling ? 0.6 : 1,
            }}
          >
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Corrigir Localidades</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 'auto' }}>Geocodifica trilhas sem cidade/estado</p>
            <p style={{ fontSize: 12, color: '#6d745f', fontWeight: 500, marginTop: 12 }}>
              {backfilling ? 'Processando…' : 'Executar →'}
            </p>
          </button>
        </div>

        {backfillMsg && (
          <div style={{
            background: backfillMsg.startsWith('Erro') ? '#fee2e2' : '#dcfce7',
            border: `1px solid ${backfillMsg.startsWith('Erro') ? '#fca5a5' : '#86efac'}`,
            color: backfillMsg.startsWith('Erro') ? '#991b1b' : '#166534',
            borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13,
          }}>
            {backfillMsg}
          </div>
        )}
      </div>
    </div>
  )
}
