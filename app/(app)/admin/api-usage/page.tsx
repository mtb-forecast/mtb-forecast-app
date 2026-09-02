'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'

interface ApiLimit {
  id: string
  api_name: string
  tipo: 'diario' | 'mensal'
  limite_chamadas: number | null
  limite_tokens: number | null
  limite_custo_usd: number | null
  ativo: boolean
  consumido_chamadas: number
  consumido_tokens: number
  consumido_custo_usd: number
  pct: number
}
interface Report {
  limites: ApiLimit[]
}

const API_COLOR: Record<string, string> = {
  anthropic:      '#d97706',
  gemini:         '#3b82f6',
  groq:           '#8b5cf6',
  openweathermap: '#0ea5e9',
  open_meteo:     '#10b981',
  noaa:           '#6b7280',
  github_actions: '#1f2937',
  weatherapi:     '#f59e0b',
  windy:          '#06b6d4',
  resend:         '#000000',
  telegram:       '#2563eb',
  pollinations:   '#7c3aed',
  stripe:         '#635bff',
  strava:         '#fc4c02',
  openlandmap:    '#15803d',
  deepseek:       '#4d6bfe',
  tavily:         '#0f766e',
  instagram:      '#e1306c',
}

function fmt(n: number, decimals = 4) {
  return n.toFixed(decimals)
}

export default function ApiUsagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<Report | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showLimitForm, setShowLimitForm] = useState(false)
  const [limitForm, setLimitForm] = useState({ api_name: 'openweathermap', tipo: 'diario', limite_chamadas: '', limite_tokens: '', limite_custo_usd: '' })
  const [savingLimit, setSavingLimit] = useState(false)

  useEffect(() => {
    async function auth() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.replace('/dashboard'); return }
      setLoading(false)
    }
    auth()
  }, [router])

  const load = useCallback(async () => {
    setFetching(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/admin/api-usage')
      if (res.ok) {
        setReport(await res.json())
      } else {
        const body = await res.json().catch(() => ({}))
        setFetchError(body.error ?? `HTTP ${res.status}`)
      }
    } catch (e) {
      setFetchError(String(e))
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => { if (!loading) load() }, [loading, load])

  async function salvarLimite() {
    setSavingLimit(true)
    try {
      const res = await fetch('/api/admin/api-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_name: limitForm.api_name,
          tipo: limitForm.tipo,
          limite_chamadas: limitForm.limite_chamadas ? Number(limitForm.limite_chamadas) : null,
          limite_tokens: limitForm.limite_tokens ? Number(limitForm.limite_tokens) : null,
          limite_custo_usd: limitForm.limite_custo_usd ? Number(limitForm.limite_custo_usd) : null,
        }),
      })
      if (res.ok) {
        setShowLimitForm(false)
        setLimitForm({ api_name: 'openweathermap', tipo: 'diario', limite_chamadas: '', limite_tokens: '', limite_custo_usd: '' })
        load()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error ?? `HTTP ${res.status}`)
      }
    } finally {
      setSavingLimit(false)
    }
  }

  async function removerLimite(id: string) {
    if (!confirm('Remover este limite?')) return
    const res = await fetch(`/api/admin/api-limits?id=${id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.08)', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* Header */}
      <div style={{ background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '28px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/admin" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: 'rgba(154,160,147,.7)',
            marginBottom: 16, textDecoration: 'none',
          }}>
            ← Admin
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 38px)', textTransform: 'uppercase',
            color: '#F4F3EF', lineHeight: 0.95, margin: 0,
          }}>
            Limites de consumo
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', marginTop: 8 }}>
            Dia/mês em curso — alerta via Telegram ao estourar
          </p>
        </div>
      </div>

      <div style={{ padding: '24px 32px 48px', maxWidth: 900, margin: '0 auto' }}>

        {fetching && !report && (
          <div style={{ textAlign: 'center', padding: 64, color: '#9AA093' }}>Carregando...</div>
        )}

        {fetchError && (
          <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 32, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>
            <strong>Erro ao carregar dados:</strong> {fetchError}
          </div>
        )}

        {report && (
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#9AA093' }}>
                Limites cadastrados
              </p>
              <button onClick={() => setShowLimitForm(v => !v)} style={{
                fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#6d745f',
                background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}>
                {showLimitForm ? 'cancelar' : '+ cadastrar limite'}
              </button>
            </div>

            {showLimitForm && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, padding: '12px', background: 'rgba(0,0,0,.02)', borderRadius: 8 }}>
                <select value={limitForm.api_name} onChange={e => setLimitForm(f => ({ ...f, api_name: e.target.value }))}
                  style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.15)' }}>
                  {Object.keys(API_COLOR).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select value={limitForm.tipo} onChange={e => setLimitForm(f => ({ ...f, tipo: e.target.value }))}
                  style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.15)' }}>
                  <option value="diario">diário</option>
                  <option value="mensal">mensal</option>
                </select>
                <input placeholder="limite chamadas" value={limitForm.limite_chamadas}
                  onChange={e => setLimitForm(f => ({ ...f, limite_chamadas: e.target.value }))}
                  style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.15)', width: 120 }} />
                <input placeholder="limite tokens" value={limitForm.limite_tokens}
                  onChange={e => setLimitForm(f => ({ ...f, limite_tokens: e.target.value }))}
                  style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.15)', width: 120 }} />
                <input placeholder="limite US$" value={limitForm.limite_custo_usd}
                  onChange={e => setLimitForm(f => ({ ...f, limite_custo_usd: e.target.value }))}
                  style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.15)', width: 100 }} />
                <button onClick={salvarLimite} disabled={savingLimit} style={{
                  fontFamily: 'var(--font-dm-mono)', fontSize: 12, padding: '7px 14px', borderRadius: 999,
                  border: 'none', background: '#1A1D18', color: '#F4F3EF', cursor: 'pointer',
                }}>
                  {savingLimit ? 'salvando...' : 'salvar'}
                </button>
              </div>
            )}

            {report.limites.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9AA093' }}>Nenhum limite cadastrado. Um alerta via Telegram é disparado ao admin quando um limite cadastrado for estourado.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {report.limites.map(lim => {
                  const pct = Math.min(100, Math.round(lim.pct * 100))
                  const barColor = lim.pct >= 1 ? '#EF4444' : lim.pct >= 0.8 ? '#F59E0B' : '#22C55E'
                  const label = lim.limite_chamadas
                    ? `${lim.consumido_chamadas}/${lim.limite_chamadas} chamadas`
                    : lim.limite_tokens
                      ? `${lim.consumido_tokens}/${lim.limite_tokens} tokens`
                      : `US$ ${fmt(lim.consumido_custo_usd)}/US$ ${fmt(lim.limite_custo_usd ?? 0)}`
                  return (
                    <div key={lim.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 15, textTransform: 'uppercase', color: '#1A1D18', minWidth: 150 }}>
                        {lim.api_name} <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#9AA093', textTransform: 'lowercase' }}>({lim.tipo})</span>
                      </span>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <div style={{ height: 6, background: 'rgba(0,0,0,.06)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 999 }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: barColor, minWidth: 150, textAlign: 'right' }}>
                        {label} ({pct}%)
                      </span>
                      <button onClick={() => removerLimite(lim.id)} style={{
                        fontFamily: 'var(--font-dm-mono)', fontSize: 14, color: '#9AA093',
                        background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
                      }} title="Remover limite">×</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
