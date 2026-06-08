'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { getSoloTypes, getBiomas, getExposicoes, getTrailTypes, getRegioes } from '@/lib/domain'
import { geocodeLatLon } from '@/lib/geocoding'

const StravaMap = dynamic(() => import('@/components/StravaMap'), { ssr: false })

export type TrilhaPendente = {
  id: string
  name: string
  regiao?: string | null
  lat: number
  lon: number
  altitude_m?: number | null
  solo_type?: string | null
  exposicao?: string | null
  trail_type?: string | null
  bioma?: string | null
  desnivel_m?: number | null
  extensao_km?: number | null
  link_referencia?: string | null
  observacoes?: string | null
  polyline?: string | null
  localidade_id?: string | null
  user_id: string
  status: string
  motivo_rejeicao?: string | null
  created_at: string
}

type Props = {
  trilhas: TrilhaPendente[]
  onAprovar: (p: TrilhaPendente) => Promise<void>
  onRejeitar: (id: string, motivo: string) => Promise<void>
}

export default function AdminPanel({ trilhas, onAprovar, onRejeitar }: Props) {
  const [rejeicao, setRejeicao] = useState<{ id: string; motivo: string } | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<TrilhaPendente>>>({})
  const [aprovarErrors, setAprovarErrors] = useState<Record<string, string>>({})

  const [soloTypes, setSoloTypes] = useState<string[]>([])
  const [biomas, setBiomas] = useState<string[]>([])
  const [exposicoes, setExposicoes] = useState<{ valor: string; label: string }[]>([])
  const [trailTypes, setTrailTypes] = useState<{ valor: string; label: string }[]>([])
  const [regioes, setRegioes] = useState<{ valor: string; label: string }[]>([])
  const [geoPreview, setGeoPreview] = useState<Record<string, string>>({})
  const fetchedGeoRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([getSoloTypes(), getBiomas(), getExposicoes(), getTrailTypes(), getRegioes()])
      .then(([s, b, e, t, r]) => {
        setSoloTypes(s)
        setBiomas(b)
        setExposicoes(e)
        setTrailTypes(t)
        setRegioes(r)
      })
  }, [])

  // Geocoding lazy — busca cidade+estado para cada card sequencialmente
  useEffect(() => {
    let cancelled = false
    async function fetchGeo() {
      for (const t of trilhas) {
        if (cancelled || fetchedGeoRef.current.has(t.id)) continue
        if (t.lat == null || t.lon == null) continue
        fetchedGeoRef.current.add(t.id)
        try {
          const geo = await geocodeLatLon(t.lat, t.lon)
          if (!cancelled && geo) {
            const city = geo.cidade || geo.localidade || ''
            const preview = city ? `📍 ${city}, ${geo.estado}` : `📍 ${geo.estado}`
            setGeoPreview(prev => ({ ...prev, [t.id]: preview }))
          }
        } catch { /* silencioso */ }
        await new Promise(r => setTimeout(r, 1100))
      }
    }
    fetchGeo()
    return () => { cancelled = true }
  }, [trilhas])

  function setField(id: string, field: keyof TrilhaPendente, value: unknown) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function merged(trilha: TrilhaPendente): TrilhaPendente {
    return { ...trilha, ...edits[trilha.id] }
  }

  function canAprovar(trilha: TrilhaPendente): boolean {
    const m = merged(trilha)
    return !!(m.solo_type && m.exposicao && m.trail_type && m.regiao &&
      m.altitude_m != null && isFinite(Number(m.altitude_m)))
  }

  async function handleAprovar(trilha: TrilhaPendente) {
    const m = merged(trilha)
    console.log('[AdminPanel] handleAprovar — merged:', {
      solo_type: m.solo_type,
      exposicao: m.exposicao,
      trail_type: m.trail_type,
      regiao: m.regiao,
      altitude_m: m.altitude_m,
      edits: edits[trilha.id],
    })
    if (!m.solo_type || !m.exposicao || !m.trail_type || !m.regiao || m.altitude_m == null) {
      setAprovarErrors(prev => ({ ...prev, [trilha.id]: 'Preencha todos os campos obrigatórios antes de aprovar.' }))
      return
    }
    setSavingId(trilha.id)
    setAprovarErrors(prev => ({ ...prev, [trilha.id]: '' }))
    try {
      await onAprovar(m)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao aprovar — verifique se todos os campos obrigatórios estão preenchidos.'
      setAprovarErrors(prev => ({ ...prev, [trilha.id]: msg }))
    } finally {
      setSavingId(null)
    }
  }

  async function confirmarRejeicao() {
    if (!rejeicao) return
    setSavingId(rejeicao.id)
    await onRejeitar(rejeicao.id, rejeicao.motivo)
    setSavingId(null)
    setRejeicao(null)
  }

  const inputSm: React.CSSProperties = {
    border: '1px solid #e5e5e5', borderRadius: 4,
    padding: '5px 8px', fontSize: 12, width: '100%',
    outline: 'none', background: '#fff',
  }

  const labelSm: React.CSSProperties = {
    fontSize: 10, color: '#888', fontWeight: 600,
    letterSpacing: '1px', textTransform: 'uppercase',
    display: 'block', marginBottom: 4,
  }

  if (trilhas.length === 0) {
    return (
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#888' }}>Nenhuma trilha pendente de aprovação.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: '#2a2e25' }}>Trilhas pendentes de cadastro</h2>
        <span style={{ fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e', borderRadius: 2, padding: '2px 8px' }}>
          {trilhas.length} pendente{trilhas.length > 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {trilhas.map(trilha => {
          const m = merged(trilha)
          const ok = canAprovar(trilha)
          const isSaving = savingId === trilha.id

          return (
            <div key={trilha.id} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>

              {trilha.polyline && <StravaMap polyline={trilha.polyline} />}

              {/* Header */}
              <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#2a2e25' }}>{trilha.name}</p>
                  <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {new Date(trilha.created_at).toLocaleDateString('pt-BR')}
                    {trilha.polyline && <span style={{ marginLeft: 8, color: '#FC4C02', fontWeight: 500 }}>· via Strava</span>}
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e', borderRadius: 2, padding: '2px 8px', flexShrink: 0 }}>
                  PENDENTE
                </span>
              </div>

              <div style={{ padding: 20 }}>

                {/* Campos editáveis */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>

                  <div>
                    <label style={labelSm}>Solo <span style={{ color: '#ef4444' }}>*</span></label>
                    <select value={m.solo_type || ''} onChange={e => setField(trilha.id, 'solo_type', e.target.value || null)} style={inputSm}>
                      <option value="">—</option>
                      {soloTypes.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={labelSm}>Exposição <span style={{ color: '#ef4444' }}>*</span></label>
                    <select value={m.exposicao || ''} onChange={e => setField(trilha.id, 'exposicao', e.target.value || null)} style={inputSm}>
                      <option value="">—</option>
                      {exposicoes.map(e => <option key={e.valor} value={e.valor}>{e.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={labelSm}>Tipo <span style={{ color: '#ef4444' }}>*</span></label>
                    <select value={m.trail_type || ''} onChange={e => setField(trilha.id, 'trail_type', e.target.value || null)} style={inputSm}>
                      <option value="">—</option>
                      {trailTypes.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={labelSm}>Região (Estado) <span style={{ color: '#ef4444' }}>*</span></label>
                    <select value={m.regiao || ''} onChange={e => setField(trilha.id, 'regiao', e.target.value || null)} style={inputSm}>
                      <option value="">—</option>
                      {regioes.map(r => <option key={r.valor} value={r.valor}>{r.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={labelSm}>Altitude (m) <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                      type="number"
                      placeholder="Ex: 850"
                      value={m.altitude_m ?? ''}
                      onChange={e => {
                        const num = parseFloat(e.target.value)
                        setField(trilha.id, 'altitude_m', e.target.value === '' ? null : (isFinite(num) ? num : null))
                      }}
                      style={inputSm}
                    />
                  </div>

                  <div>
                    <label style={labelSm}>Bioma</label>
                    <select value={m.bioma || ''} onChange={e => setField(trilha.id, 'bioma', e.target.value || null)} style={inputSm}>
                      <option value="">—</option>
                      {biomas.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>

                  {/* Campos somente leitura */}
                  <div style={{ background: '#f4f5f0', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '8px 12px' }}>
                    <p style={{ ...labelSm, marginBottom: 3 }}>Desnível</p>
                    <p style={{ fontSize: 13, color: trilha.desnivel_m != null ? '#2a2e25' : '#bbb', fontWeight: 500 }}>
                      {trilha.desnivel_m != null ? `${trilha.desnivel_m}m` : '—'}
                    </p>
                  </div>

                  <div style={{ background: '#f4f5f0', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '8px 12px' }}>
                    <p style={{ ...labelSm, marginBottom: 3 }}>Extensão</p>
                    <p style={{ fontSize: 13, color: trilha.extensao_km != null ? '#2a2e25' : '#bbb', fontWeight: 500 }}>
                      {trilha.extensao_km != null ? `${trilha.extensao_km}km` : '—'}
                    </p>
                  </div>

                  <div style={{ background: '#f4f5f0', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '8px 12px' }}>
                    <p style={{ ...labelSm, marginBottom: 3 }}>Coordenadas</p>
                    <p style={{ fontSize: 12, color: '#2a2e25', fontWeight: 500 }}>
                      {trilha.lat?.toFixed(4)}, {trilha.lon?.toFixed(4)}
                    </p>
                    {geoPreview[trilha.id] && (
                      <p style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{geoPreview[trilha.id]}</p>
                    )}
                  </div>
                </div>

                {/* Mapa Google (fallback sem polyline) */}
                {!trilha.polyline && (
                  <div style={{ marginBottom: 16 }}>
                    <a
                      href={`https://www.google.com/maps?q=${trilha.lat},${trilha.lon}&z=15`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: '#f4f5f0', border: '0.5px solid #e5e5e5',
                        borderRadius: 4, padding: '8px 14px',
                        fontSize: 13, color: '#2a2e25', textDecoration: 'none',
                      }}
                    >
                      📍 Ver localização no Google Maps ↗
                    </a>
                  </div>
                )}

                {trilha.link_referencia && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ ...labelSm, marginBottom: 4 }}>Link de referência</p>
                    <a href={trilha.link_referencia} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 13, color: '#2563eb', wordBreak: 'break-all' }}>
                      {trilha.link_referencia}
                    </a>
                  </div>
                )}

                {trilha.observacoes && (
                  <div style={{ background: '#f4f5f0', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
                    <p style={{ ...labelSm, marginBottom: 6 }}>Observações</p>
                    <p style={{ fontSize: 13, color: '#2a2e25' }}>{trilha.observacoes}</p>
                  </div>
                )}

                {/* Aviso campos obrigatórios */}
                {!ok && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#9a3412' }}>
                    ⚠️ Preencha solo, exposição, tipo, região e altitude antes de aprovar.
                  </div>
                )}

                {/* Erro ao aprovar (falha no Supabase) */}
                {aprovarErrors[trilha.id] && (
                  <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '8px 12px', marginBottom: 16, fontSize: 12 }}>
                    ⚠️ {aprovarErrors[trilha.id]}
                  </div>
                )}

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '0.5px solid #e5e5e5' }}>
                  <button
                    onClick={() => handleAprovar(trilha)}
                    disabled={!ok || isSaving}
                    style={{
                      flex: 1,
                      background: ok ? '#6d745f' : '#f4f5f0',
                      color: ok ? '#fff' : '#bbb',
                      border: ok ? 'none' : '1.5px solid #e5e5e5',
                      borderRadius: 4, padding: '9px 0',
                      fontSize: 13, fontWeight: 500,
                      cursor: ok && !isSaving ? 'pointer' : 'not-allowed',
                      opacity: isSaving ? 0.7 : 1,
                    }}
                  >
                    {isSaving ? 'Aprovando...' : '✓ Aprovar'}
                  </button>
                  <button
                    onClick={() => setRejeicao({ id: trilha.id, motivo: '' })}
                    disabled={isSaving}
                    style={{
                      flex: 1, background: '#fff', color: '#ef4444',
                      border: '1px solid #ef4444', borderRadius: 4,
                      padding: '9px 0', fontSize: 13, fontWeight: 500,
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ✕ Rejeitar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal de rejeição */}
      {rejeicao && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 24,
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 440, width: '100%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#2a2e25', marginBottom: 8 }}>Rejeitar trilha</h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Informe o motivo para o usuário saber como corrigir.</p>
            <textarea
              value={rejeicao.motivo}
              onChange={e => setRejeicao(r => r ? { ...r, motivo: e.target.value } : null)}
              placeholder="Ex: coordenadas incorretas, trilha duplicada, informações insuficientes..."
              rows={4}
              className="input-field"
              style={{ width: '100%', resize: 'vertical', marginBottom: 16, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setRejeicao(null)}
                style={{ flex: 1, background: '#fff', color: '#888', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '10px 0', fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRejeicao}
                disabled={savingId === rejeicao.id || !rejeicao.motivo.trim()}
                style={{
                  flex: 1, background: '#ef4444', color: '#fff',
                  border: 'none', borderRadius: 4, padding: '10px 0',
                  fontSize: 13, fontWeight: 500,
                  cursor: savingId === rejeicao.id || !rejeicao.motivo.trim() ? 'not-allowed' : 'pointer',
                  opacity: savingId === rejeicao.id || !rejeicao.motivo.trim() ? 0.6 : 1,
                }}
              >
                {savingId === rejeicao.id ? 'Rejeitando...' : 'Confirmar rejeição'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
