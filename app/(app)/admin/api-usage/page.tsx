'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
interface Report {
  dias: number
  execucoes: number
  total_custo_usd: number
  total_chamadas: number
  apis: ApiStat[]
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
    <span style={{ fontSize: 11, color: '#6b7280', display: 'inline-flex', gap: 6, marginTop: 2 }}>
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
  const [expanded, setExpanded] = useState<string | null>(null)

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
    try {
      const res = await fetch(`/api/admin/api-usage?dias=${d}`)
      if (res.ok) setReport(await res.json())
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => { if (!loading) load(dias) }, [loading, dias, load])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const maxCusto = Math.max(...(report?.apis.map(a => a.custo_usd) ?? [1]))
  const maxDiario = Math.max(...(report?.serie_diaria.map(s => s.custo) ?? [0.0001]))

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#a8b899', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0, marginRight: 4 }}>←</button>
              <h1 className="font-wheat" style={{ color: '#fff', fontSize: 28 }}>Consumo de APIs</h1>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', background: '#6d745f', color: '#fff', borderRadius: 2, padding: '3px 8px' }}>ADMIN</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {DIAS_OPTIONS.map(d => (
                <button key={d} onClick={() => setDias(d)} style={{
                  padding: '6px 14px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: dias === d ? '#a8b899' : 'rgba(255,255,255,0.1)',
                  color: dias === d ? '#1e2018' : '#ccc',
                }}>
                  {d === 1 ? 'Hoje' : `${d}d`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      <div style={{ padding: '32px 32px', maxWidth: 960, margin: '0 auto' }}>

        {fetching && !report && (
          <div style={{ textAlign: 'center', padding: 64, color: '#888' }}>Carregando...</div>
        )}

        {report && (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
              {[
                { label: 'Custo estimado', value: `US$ ${fmt(report.total_custo_usd)}`, sub: `últimos ${report.dias}d` },
                { label: 'Chamadas HTTP', value: report.total_chamadas.toLocaleString('pt-BR'), sub: 'APIs externas' },
                { label: 'Execuções do pipeline', value: report.execucoes.toString(), sub: `últimos ${report.dias}d` },
                { label: 'Custo/execução', value: report.execucoes ? `US$ ${fmt(report.total_custo_usd / report.execucoes)}` : '—', sub: 'média' },
              ].map(k => (
                <div key={k.label} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: '16px 20px' }}>
                  <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</p>
                  <p style={{ fontSize: 24, fontWeight: 700, color: '#1e2018' }}>{k.value}</p>
                  <p style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Série diária de custo */}
            {report.serie_diaria.length > 1 && (
              <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: '20px 24px', marginBottom: 24 }}>
                <p style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 16 }}>Custo diário (USD)</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                  {report.serie_diaria.map(s => {
                    const h = maxDiario > 0 ? Math.max(4, (s.custo / maxDiario) * 72) : 4
                    return (
                      <div key={s.dia} title={`${s.dia}: US$ ${fmt(s.custo)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: '100%', height: h, background: '#a8b899', borderRadius: '2px 2px 0 0', minHeight: 4 }} />
                        <span style={{ fontSize: 9, color: '#aaa', whiteSpace: 'nowrap' }}>
                          {s.dia.slice(5)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tabela de APIs */}
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
                <p style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Por API</p>
              </div>

              {report.apis.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                  Nenhum dado no período. O pipeline ainda não gravou registros nessa tabela.
                </div>
              )}

              {report.apis.map(api => {
                const barW = maxCusto > 0 ? (api.custo_usd / maxCusto) * 100 : 0
                const taxa  = taxaSucesso(api.sucesso, api.falhas)
                const isExp = expanded === api.api_name
                const color = API_COLOR[api.api_name] ?? '#6d745f'

                return (
                  <div key={api.api_name}>
                    <div
                      onClick={() => setExpanded(isExp ? null : api.api_name)}
                      style={{ padding: '16px 20px', borderBottom: '1px solid #f8f8f8', cursor: 'pointer', background: isExp ? '#fafafa' : '#fff' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e2018', minWidth: 160 }}>{api.label}</span>

                        <div style={{ flex: 1, minWidth: 100 }}>
                          <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barW}%`, background: color, borderRadius: 3 }} />
                          </div>
                        </div>

                        <span style={{ fontSize: 15, fontWeight: 700, color: api.custo_usd > 0 ? '#1e2018' : '#aaa', minWidth: 100, textAlign: 'right' }}>
                          {api.custo_usd > 0 ? `US$ ${fmt(api.custo_usd)}` : 'grátis'}
                        </span>

                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#666', minWidth: 160 }}>
                          <span>{api.chamadas} chamadas</span>
                          <span style={{ color: taxa < 90 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{taxa}% OK</span>
                        </div>

                        <span style={{ fontSize: 14, color: '#aaa' }}>{isExp ? '▲' : '▼'}</span>
                      </div>

                      {(api.tokens_input > 0 || api.tokens_output > 0) && (
                        <div style={{ marginTop: 6, paddingLeft: 22 }}>
                          <TokensBadge input={api.tokens_input} output={api.tokens_output} />
                        </div>
                      )}
                    </div>

                    {isExp && (
                      <div style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0', padding: '12px 20px 12px 42px' }}>
                        <p style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>Endpoints</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {Object.entries(api.endpoints).map(([ep, stat]) => (
                            <div key={ep} style={{ display: 'flex', gap: 16, fontSize: 12, color: '#555', alignItems: 'center' }}>
                              <code style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#333', minWidth: 180 }}>{ep}</code>
                              <span>{stat.chamadas} ch.</span>
                              <span style={{ color: stat.falhas > 0 ? '#dc2626' : '#16a34a' }}>
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

            {/* Nota de preços */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '12px 16px', fontSize: 12, color: '#92400e' }}>
              <strong>Preços de referência:</strong> Claude Haiku 4.5 — US$0,80/MTok in · US$4,00/MTok out &nbsp;|&nbsp;
              Gemini 2.0 Flash — US$0,10/MTok in · US$0,40/MTok out &nbsp;|&nbsp;
              Groq Llama-3.3-70b — US$0,59/MTok &nbsp;|&nbsp;
              OWM, Open-Meteo, NOAA — planos gratuitos.
              Custos são estimativas calculadas na hora da execução.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
