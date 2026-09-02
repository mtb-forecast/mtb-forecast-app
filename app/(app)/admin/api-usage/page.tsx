'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'

interface EndpointStat { chamadas: number; sucesso: number; falhas: number }
interface ApiStat {
  api_name: string
  label: string
  chamadas: number
  tokens_input: number
  tokens_output: number
  custo_usd: number
  sucesso: number
  falhas: number
  endpoints: Record<string, EndpointStat>
}
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
  dias: number
  execucoes: number
  total_custo_usd: number
  total_chamadas: number
  apis: ApiStat[]
  limites: ApiLimit[]
  serie_diaria: { dia: string; custo: number }[]
}

const DIAS_OPTIONS = [1, 7, 30, 90]

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
}

function fmt(n: number, decimals = 4) {
  return n.toFixed(decimals)
}

function taxaSucesso(ok: number, fail: number) {
  const total = ok + fail
  if (!total) return 100
  return Math.round((ok / total) * 100)
}

function TokensBadge({ input, output }: { input: number; output: number }) {
  if (!input && !output) return null
  return (
    <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#9AA093', display: 'inline-flex', gap: 6, marginTop: 2 }}>
      <span>↑ {(input / 1000).toFixed(1)}k in</span>
      <span>↓ {(output / 1000).toFixed(1)}k out</span>
    </span>
  )
}

export default function ApiUsagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(7)
  const [report, setReport] = useState<Report | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
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

  const load = useCallback(async (d: number) => {
    setFetching(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/admin/api-usage?dias=${d}`)
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

  useEffect(() => { if (!loading) load(dias) }, [loading, dias, load])

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
        load(dias)
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
    if (res.ok) load(dias)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.08)', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const maxCusto = Math.max(...(report?.apis.map(a => a.custo_usd) ?? [1]))
  const maxDiario = Math.max(...(report?.serie_diaria.map(s => s.custo) ?? [0.0001]))

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                fontSize: 'clamp(28px, 4vw, 38px)', textTransform: 'uppercase',
                color: '#F4F3EF', lineHeight: 0.95, margin: 0,
              }}>
                Consumo de APIs
              </h1>
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', marginTop: 8 }}>
                Chamadas, tokens e custos estimados
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {DIAS_OPTIONS.map(d => (
                <button key={d} onClick={() => setDias(d)} style={{
                  padding: '7px 14px', borderRadius: 999,
                  border: dias === d ? 'none' : '1px solid rgba(0,0,0,.1)',
                  cursor: 'pointer', fontFamily: 'var(--font-dm-mono)', fontSize: 12,
                  background: dias === d ? '#1A1D18' : '#FFFFFF',
                  color: dias === d ? '#F4F3EF' : '#9AA093',
                }}>
                  {d === 1 ? 'Hoje' : `${d}d`}
                </button>
              ))}
            </div>
          </div>
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
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Custo estimado', value: `US$ ${fmt(report.total_custo_usd)}`, sub: `últimos ${report.dias}d` },
                { label: 'Chamadas HTTP', value: report.total_chamadas.toLocaleString('pt-BR'), sub: 'APIs externas' },
                { label: 'Execuções do pipeline', value: report.execucoes.toString(), sub: `últimos ${report.dias}d` },
                { label: 'Custo/execução', value: report.execucoes ? `US$ ${fmt(report.total_custo_usd / report.execucoes)}` : '—', sub: 'média' },
              ].map(k => (
                <div key={k.label} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, padding: '16px 18px' }}>
                  <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#9AA093', marginBottom: 6 }}>{k.label}</p>
                  <p style={{ fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 28, color: '#1A1D18' }}>{k.value}</p>
                  <p style={{ fontSize: 12, color: '#9AA093', marginTop: 2 }}>{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Limites de consumo */}
            <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#9AA093' }}>
                  Limites de consumo (dia/mês em curso)
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

            {/* Série diária de custo */}
            {report.serie_diaria.length > 1 && (
              <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
                <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#9AA093', marginBottom: 12 }}>Custo diário (USD)</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                  {report.serie_diaria.map(s => {
                    const h = maxDiario > 0 ? Math.max(4, (s.custo / maxDiario) * 72) : 4
                    return (
                      <div key={s.dia} title={`${s.dia}: US$ ${fmt(s.custo)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: '100%', height: h, background: '#6d745f', borderRadius: '3px 3px 0 0', minHeight: 4 }} />
                        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#9AA093', whiteSpace: 'nowrap' }}>
                          {s.dia.slice(5)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Cards de API */}
            {report.apis.length === 0 ? (
              <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9AA093', fontSize: 14, marginBottom: 16 }}>
                Nenhum dado no período. O pipeline ainda não gravou registros nessa tabela.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {report.apis.map(api => {
                  const barW = maxCusto > 0 ? (api.custo_usd / maxCusto) * 100 : 0
                  const taxa  = taxaSucesso(api.sucesso, api.falhas)
                  const isExp = expanded === api.api_name
                  const color = API_COLOR[api.api_name] ?? '#6d745f'

                  return (
                    <div key={api.api_name} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, overflow: 'hidden' }}>
                      <div
                        onClick={() => setExpanded(isExp ? null : api.api_name)}
                        style={{ padding: '16px 20px', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 18,
                            textTransform: 'uppercase', color, minWidth: 160,
                          }}>
                            {api.label}
                          </span>

                          <div style={{ flex: 1, minWidth: 100 }}>
                            <div style={{ height: 4, background: 'rgba(0,0,0,.06)', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${barW}%`, background: color, opacity: 0.7, borderRadius: 999 }} />
                            </div>
                          </div>

                          <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 15, fontWeight: 500, color: api.custo_usd > 0 ? '#1A1D18' : '#9AA093', minWidth: 100, textAlign: 'right' }}>
                            {api.custo_usd > 0 ? `US$ ${fmt(api.custo_usd)}` : 'grátis'}
                          </span>

                          <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#9AA093', minWidth: 160 }}>
                            <span>{api.chamadas} chamadas</span>
                            <span style={{ color: taxa < 90 ? '#EF4444' : '#22C55E', fontWeight: 500 }}>{taxa}% OK</span>
                          </div>

                          <span style={{ fontSize: 14, color: '#9AA093' }}>{isExp ? '▲' : '▼'}</span>
                        </div>

                        {(api.tokens_input > 0 || api.tokens_output > 0) && (
                          <div style={{ marginTop: 6 }}>
                            <TokensBadge input={api.tokens_input} output={api.tokens_output} />
                          </div>
                        )}
                      </div>

                      {isExp && (
                        <div style={{ borderTop: '1px solid rgba(0,0,0,.07)', padding: '12px 20px 16px' }}>
                          <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#9AA093', marginBottom: 10 }}>Endpoints</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {Object.entries(api.endpoints).map(([ep, stat]) => (
                              <div key={ep} style={{
                                display: 'flex', gap: 16, alignItems: 'center',
                                fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#6B7280',
                                background: 'rgba(0,0,0,.02)', borderRadius: 6, padding: '5px 10px',
                              }}>
                                <code style={{ minWidth: 180 }}>{ep}</code>
                                <span>{stat.chamadas} ch.</span>
                                <span style={{ color: stat.falhas > 0 ? '#EF4444' : '#22C55E' }}>
                                  {stat.sucesso} ok{stat.falhas > 0 ? ` / ${stat.falhas} falhas` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Nota de preços */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#92400e' }}>
              <strong>Preços de referência:</strong> Claude Haiku 4.5 — US$0,80/MTok in · US$4,00/MTok out &nbsp;|&nbsp;
              Gemini 2.0 Flash — US$0,10/MTok in · US$0,40/MTok out &nbsp;|&nbsp;
              Groq Llama-3.3-70b — US$0,59/MTok &nbsp;|&nbsp;
              Resend — US$0,001/e-mail acima de 3.000/mês &nbsp;|&nbsp;
              OWM, Open-Meteo, NOAA, Strava, OpenLandMap, Pollinations, Telegram — gratuitos.
              DeepSeek Chat — US$0,27/MTok in · US$1,10/MTok out &nbsp;|&nbsp;
              Tavily — free tier 1.000 créditos/mês (1 crédito/busca "basic") &nbsp;|&nbsp;
              Stripe não cobra por chamada de API (cobra % por transação).
              Custos são estimativas calculadas na hora da execução.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
