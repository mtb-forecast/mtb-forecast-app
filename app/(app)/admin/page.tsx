'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, getClientUser } from '@/lib/supabase'

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12,
  padding: '18px 20px', flex: 1, minWidth: 160,
  textDecoration: 'none', display: 'flex', flexDirection: 'column',
  boxShadow: '0 2px 6px rgba(0,0,0,.04)', transition: 'border-color 0.15s',
}

function onHoverEnter(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'rgba(109,116,95,.35)'
}
function onHoverLeave(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'rgba(0,0,0,.07)'
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase',
      letterSpacing: '1.5px', color: '#9AA093', marginBottom: 6,
    }}>
      {children}
    </p>
  )
}

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
      <div style={{ minHeight: '100vh', background: '#F5F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.08)', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      <div style={{ background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '28px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{
              fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
              fontSize: 'clamp(28px, 4vw, 38px)', textTransform: 'uppercase',
              color: '#F4F3EF', lineHeight: 0.95, margin: 0,
            }}>
              Admin
            </h1>
            <span style={{
              fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase',
              background: 'rgba(109,116,95,.15)', color: '#6d745f',
              borderRadius: 4, padding: '3px 8px',
            }}>
              ADMIN
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <Link href="/admin/trilhas" style={cardStyle} onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave}>
            <CardLabel>Trilhas</CardLabel>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 'auto' }}>Editar trilhas do catálogo</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6d745f', marginTop: 14 }}>Gerenciar →</p>
          </Link>
          <Link href="/admin/mantenedores" style={cardStyle} onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave}>
            <CardLabel>Mantenedores</CardLabel>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 'auto' }}>Parques e clubes mantendo trilhas</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6d745f', marginTop: 14 }}>Gerenciar →</p>
          </Link>
          <Link href="/admin/importar-strava" style={cardStyle} onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave}>
            <CardLabel>Importar Strava</CardLabel>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 'auto' }}>Segmentos favoritos → trilhas</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#FC4C02', marginTop: 14 }}>Importar →</p>
          </Link>
          <Link href="/admin/api-usage" style={cardStyle} onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave}>
            <CardLabel>Consumo de APIs</CardLabel>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 'auto' }}>Chamadas, tokens e custos estimados</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6d745f', marginTop: 14 }}>Ver relatório →</p>
          </Link>
          <button
            onClick={corrigirLocalidades}
            disabled={backfilling}
            style={{
              ...cardStyle,
              textAlign: 'left', cursor: backfilling ? 'wait' : 'pointer',
              opacity: backfilling ? 0.6 : 1, border: '1px solid rgba(0,0,0,.07)',
            }}
            onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave}
          >
            <CardLabel>Corrigir Localidades</CardLabel>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 'auto' }}>Geocodifica trilhas sem cidade/estado</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6d745f', marginTop: 14 }}>
              {backfilling ? 'Processando…' : 'Executar →'}
            </p>
          </button>
        </div>

        {backfillMsg && (
          <div style={{
            background: backfillMsg.startsWith('Erro') ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)',
            border: `1px solid ${backfillMsg.startsWith('Erro') ? 'rgba(239,68,68,.25)' : 'rgba(34,197,94,.25)'}`,
            color: backfillMsg.startsWith('Erro') ? '#DC2626' : '#166534',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13,
          }}>
            {backfillMsg}
          </div>
        )}
      </div>
    </div>
  )
}
