'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

type StravaSegment = {
  id: number
  name: string
  distance: number
  total_elevation_gain: number | null
  elevation_high: number | null
  start_latlng: number[]
  end_latlng: number[]
  city: string | null
  state: string | null
  country: string | null
  map?: { summary_polyline?: string; polyline?: string }
  polyline: string | null
  elevation_profile: string | null
}

type SegmentForm = {
  nome: string
  solo_type: string
  exposicao: string
  trail_type: string
  bioma: string
  regiao: string
  altitude_m: number | null
}

type SoilStatus = 'idle' | 'loading' | 'ok' | 'error'

// ── Constants ─────────────────────────────────────────────────────────────────

const SOLO_TYPES = [
  { value: 'terra',    label: 'Terra (argila)' },
  { value: 'misto',   label: 'Misto (terra + pedra)' },
  { value: 'preto',   label: 'Preto (terra preta orgânica)' },
  { value: 'pedra',   label: 'Pedra (rock garden)' },
  { value: 'ferro',   label: 'Ferro (solo ferroso)' },
  { value: 'misto_mg', label: 'Misto MG (misto ferroso)' },
]

const BIOMAS = [
  { value: 'Mata Atlântica', label: 'Mata Atlântica' },
  { value: 'Cerrado',        label: 'Cerrado' },
  { value: 'Pampa',          label: 'Pampa' },
  { value: 'Outro',          label: 'Outro' },
]

const REGIOES = ['SP', 'MG', 'RJ', 'PR', 'SC', 'RS', 'outros']

const STATE_TO_REGIAO: Record<string, string> = {
  'São Paulo': 'SP', 'Minas Gerais': 'MG', 'Rio de Janeiro': 'RJ',
  'Paraná': 'PR', 'Santa Catarina': 'SC', 'Rio Grande do Sul': 'RS',
}

function guessRegiao(state: string | null): string {
  if (!state) return 'SP'
  return STATE_TO_REGIAO[state] ?? 'SP'
}

// ── Helper components ─────────────────────────────────────────────────────────

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 4 }}>
      {children} <span style={{ color: '#ef4444' }}>*</span>
    </label>
  )
}

function SelectField({
  value, onChange, options, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input-field" style={{ fontSize: 13 }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function StravaPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [segments, setSegments] = useState<StravaSegment[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [forms, setForms] = useState<Record<number, SegmentForm>>({})
  const [soilStatus, setSoilStatus] = useState<Record<number, SoilStatus>>({})
  const [configWarnings, setConfigWarnings] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingCount, setExistingCount] = useState(0)

  const slotsLeft = 3 - existingCount

  useEffect(() => {
    const raw = searchParams.get('segments')
    if (raw) {
      try { setSegments(JSON.parse(raw)) }
      catch { setError('Erro ao carregar segmentos. Tente reconectar o Strava.') }
    }
    async function checkExisting() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { count } = await supabase
        .from('trilhas_pessoais').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      setExistingCount(count ?? 0)
    }
    checkExisting()
  }, [router, searchParams])

  const fetchSoil = useCallback(async (id: number, lat: number, lon: number) => {
    setSoilStatus(prev => ({ ...prev, [id]: 'loading' }))
    try {
      const res = await fetch(`/api/openlandmap?lat=${lat}&lon=${lon}`)
      if (!res.ok) throw new Error('api error')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setForms(prev => ({ ...prev, [id]: { ...prev[id], solo_type: data.solo_type_sugerido } }))
      setSoilStatus(prev => ({ ...prev, [id]: 'ok' }))
    } catch {
      setSoilStatus(prev => ({ ...prev, [id]: 'error' }))
    }
  }, [])

  function toggleSegment(seg: StravaSegment) {
    const id = seg.id
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      if (next.size >= slotsLeft) return prev
      next.add(id)

      setForms(f => {
        if (f[id]) return f
        const newForm: SegmentForm = {
          nome: seg.name,
          solo_type: '',
          exposicao: '',
          trail_type: '',
          bioma: '',
          regiao: guessRegiao(seg.state),
          altitude_m: Math.round(seg.elevation_high || 0),
        }
        return { ...f, [id]: newForm }
      })

      const lat = seg.start_latlng[0]
      const lon = seg.start_latlng[1]
      if (lat != null && lon != null) {
        fetchSoil(id, lat, lon)
      } else {
        setSoilStatus(p => ({ ...p, [id]: 'error' }))
      }

      return next
    })
  }

  function updateForm(id: number, field: keyof SegmentForm, value: string) {
    setForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function isFormValid(id: number): boolean {
    const f = forms[id]
    return !!(f && f.solo_type && f.exposicao && f.trail_type && f.bioma)
  }

  const allValid = selected.size > 0 && Array.from(selected).every(isFormValid)
  const canSave = allValid && !saving

  async function handleSave() {
    setError(null)
    if (!allValid) { setError('Preencha todos os campos obrigatórios.'); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    if (existingCount + selected.size > 3) {
      setError('Você já atingiu o limite de 3 trilhas pessoais.')
      return
    }

    setSaving(true)
    const newWarnings: Record<number, string> = {}

    for (const segId of Array.from(selected)) {
      const seg = segments.find(s => s.id === segId)!
      const form = forms[segId]

      const { data: configExistente } = await supabase
        .from('strava_segmentos_config')
        .select('strava_segment_id, owner_user_id, solo_type, exposicao, trail_type')
        .eq('strava_segment_id', seg.id)
        .maybeSingle()

      if (!configExistente) {
        const { error: configErr } = await supabase.from('strava_segmentos_config').insert({
          strava_segment_id: seg.id,
          owner_user_id: user.id,
          name: form.nome || seg.name,
          lat: seg.start_latlng[0],
          lon: seg.start_latlng[1],
          extensao_km: parseFloat((seg.distance / 1000).toFixed(2)),
          desnivel_m: seg.total_elevation_gain || null,
          altitude_m: Math.round(seg.elevation_high || 0),
          solo_type: form.solo_type,
          exposicao: form.exposicao,
          trail_type: form.trail_type,
          bioma: form.bioma,
          regiao: form.regiao,
        })
        if (configErr) {
          setSaving(false)
          setError(`Erro ao salvar configuração: ${configErr.message}`)
          return
        }
      } else {
        newWarnings[segId] = `Segmento já cadastrado por outro rider. Usando config existente: solo=${configExistente.solo_type}, exposição=${configExistente.exposicao}, tipo=${configExistente.trail_type}. Você pode sugerir alterações após o cadastro.`
      }

      const soloType = configExistente?.solo_type || form.solo_type
      const exposicao = configExistente?.exposicao || form.exposicao
      const trailType = configExistente?.trail_type || form.trail_type

      const { error: trilhaErr } = await supabase.from('trilhas_pessoais').insert({
        user_id: user.id,
        strava_segment_id: seg.id,
        name: form.nome || seg.name,
        lat: seg.start_latlng[0] ?? 0,
        lon: seg.start_latlng[1] ?? 0,
        extensao_km: parseFloat((seg.distance / 1000).toFixed(2)),
        desnivel_m: seg.total_elevation_gain != null ? Math.round(Number(seg.total_elevation_gain) * 10) / 10 : null,
        altitude_m: Math.round(Number(form.altitude_m) || 0),
        solo_type: soloType,
        exposicao: exposicao,
        trail_type: trailType,
        bioma: form.bioma,
        regiao: form.regiao,
        strava_url: `https://www.strava.com/segments/${seg.id}`,
        polyline: seg.polyline || seg.map?.summary_polyline || null,
        strava_elevation_profile: seg.elevation_profile || null,
      })

      if (trilhaErr) {
        setSaving(false)
        setError(`Erro ao salvar trilha: ${trilhaErr.message}`)
        return
      }
    }

    setSaving(false)

    if (Object.keys(newWarnings).length > 0) {
      setConfigWarnings(newWarnings)
      setTimeout(() => router.replace('/perfil'), 4000)
    } else {
      router.replace('/perfil')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header preto ─────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 28 }}>Conectar trilhas do Strava</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            Selecione até <b style={{ color: '#ccc' }}>{slotsLeft}</b> segmento{slotsLeft !== 1 ? 's' : ''} para acompanhar as condições
          </p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 32px 48px', maxWidth: 680, margin: '0 auto' }}>

        {selected.size > 0 && (
          <p style={{ fontSize: 13, fontWeight: 500, color: '#FC4C02', marginBottom: 16 }}>
            {selected.size} de {slotsLeft} selecionados
          </p>
        )}

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {Object.keys(configWarnings).length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(configWarnings).map(([segId, msg]) => {
              const seg = segments.find(s => s.id === Number(segId))
              return (
                <div key={segId} style={{ background: '#fef9c3', border: '1px solid #fde047', color: '#854d0e', borderRadius: 4, padding: '10px 14px', fontSize: 13 }}>
                  <b>{seg?.name}:</b> {msg}
                </div>
              )
            })}
            <p style={{ fontSize: 12, color: '#888' }}>Redirecionando para o perfil em instantes...</p>
          </div>
        )}

        {existingCount >= 3 && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#111', marginBottom: 8 }}>Limite de trilhas atingido</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Você já tem 3 trilhas pessoais. Exclua uma no Perfil para adicionar nova.</p>
            <button
              onClick={() => router.replace('/perfil')}
              style={{ fontSize: 13, color: '#111', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #111' }}
            >
              Ir para o Perfil →
            </button>
          </div>
        )}

        {segments.length === 0 && !error && existingCount < 3 && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#888' }}>Nenhum segmento encontrado. Verifique se você tem segmentos favoritos no Strava.</p>
          </div>
        )}

        {segments.length > 0 && existingCount < 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {segments.map(seg => {
              const isSelected = selected.has(seg.id)
              const isDisabled = !isSelected && selected.size >= slotsLeft
              const distKm = (seg.distance / 1000).toFixed(1)
              const location = [seg.city, seg.state].filter(Boolean).join(', ')
              const soil = soilStatus[seg.id] ?? 'idle'
              const form = forms[seg.id]

              return (
                <div
                  key={seg.id}
                  style={{
                    background: '#fff',
                    border: isSelected ? '1.5px solid #111' : '0.5px solid #e5e5e5',
                    borderLeft: isSelected ? '3px solid #111' : '3px solid #e5e5e5',
                    borderRadius: 8,
                    overflow: 'hidden',
                    opacity: isDisabled ? 0.45 : 1,
                    transition: 'border-color 0.15s, opacity 0.15s',
                  }}
                >
                  {/* Card header */}
                  <div
                    style={{ padding: 16, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    onClick={() => !isDisabled && toggleSegment(seg)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => toggleSegment(seg)}
                        onClick={e => e.stopPropagation()}
                        style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0, accentColor: '#111' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#111', lineHeight: 1.3 }}>{seg.name}</p>
                          <a
                            href={`https://www.strava.com/segments/${seg.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, color: '#FC4C02', flexShrink: 0 }}
                            onClick={e => e.stopPropagation()}
                          >
                            Ver no Strava ↗
                          </a>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, fontSize: 12, color: '#888' }}>
                          <span>📏 <b>{distKm} km</b></span>
                          <span>⛰ <b>{seg.total_elevation_gain != null ? `${Math.round(seg.total_elevation_gain)}m` : '—'}</b></span>
                          {seg.elevation_high != null && <span>🏔 <b>{Math.round(seg.elevation_high)}m</b></span>}
                          {location && <span>📍 {location}</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded form */}
                  {isSelected && form && (
                    <div style={{ padding: '16px 16px 20px', borderTop: '0.5px solid #e5e5e5', background: '#f7f7f5', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* Nome */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 4 }}>Nome</label>
                        <input
                          type="text"
                          value={form.nome}
                          onChange={e => updateForm(seg.id, 'nome', e.target.value)}
                          className="input-field"
                          style={{ fontSize: 13 }}
                        />
                      </div>

                      {/* Medidas */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 4 }}>Distância</label>
                          <input readOnly value={`${distKm} km`} className="input-field" style={{ fontSize: 13, opacity: 0.6, cursor: 'not-allowed' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 4 }}>Desnível</label>
                          <input readOnly value={seg.total_elevation_gain != null ? `${Math.round(seg.total_elevation_gain)}m` : '—'} className="input-field" style={{ fontSize: 13, opacity: 0.6, cursor: 'not-allowed' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 4 }}>Altitude máx.</label>
                          <input
                            type="number"
                            value={form.altitude_m ?? ''}
                            onChange={e => updateForm(seg.id, 'altitude_m', e.target.value)}
                            className="input-field"
                            style={{ fontSize: 13 }}
                            placeholder="m"
                          />
                        </div>
                      </div>

                      {/* Tipo de Solo */}
                      <div>
                        <RequiredLabel>Tipo de solo</RequiredLabel>
                        {soil === 'loading' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888', marginBottom: 6 }}>
                            <div style={{ width: 12, height: 12, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            Buscando tipo de solo via OpenLandMap...
                          </div>
                        )}
                        {soil === 'ok' && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, background: '#FFE000', color: '#111', borderRadius: 2, padding: '2px 8px' }}>
                              🤖 Sugerido pela API
                            </span>
                          </div>
                        )}
                        {soil === 'error' && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 500, background: '#fef9c3', color: '#854d0e', borderRadius: 2, padding: '2px 8px' }}>
                              ✏️ Preencha manualmente
                            </span>
                          </div>
                        )}
                        <SelectField
                          value={form.solo_type}
                          onChange={v => updateForm(seg.id, 'solo_type', v)}
                          options={SOLO_TYPES}
                          placeholder="Selecione o tipo de solo"
                        />
                      </div>

                      {/* Grid: exposição + tipo + bioma + região */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <RequiredLabel>Exposição</RequiredLabel>
                          <SelectField
                            value={form.exposicao}
                            onChange={v => updateForm(seg.id, 'exposicao', v)}
                            options={[
                              { value: 'aberta',  label: 'Aberta — Sol direto, cristas' },
                              { value: 'fechada', label: 'Fechada — Mata densa, sombra' },
                            ]}
                            placeholder="Selecione"
                          />
                        </div>
                        <div>
                          <RequiredLabel>Tipo de trilha</RequiredLabel>
                          <SelectField
                            value={form.trail_type}
                            onChange={v => updateForm(seg.id, 'trail_type', v)}
                            options={[
                              { value: 'natural',  label: 'Natural — Sem drenagem' },
                              { value: 'bikepark', label: 'Bike Park — Com drenagem' },
                            ]}
                            placeholder="Selecione"
                          />
                        </div>
                        <div>
                          <RequiredLabel>Bioma</RequiredLabel>
                          <SelectField
                            value={form.bioma}
                            onChange={v => updateForm(seg.id, 'bioma', v)}
                            options={BIOMAS}
                            placeholder="Selecione"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 4 }}>Região</label>
                          <SelectField
                            value={form.regiao}
                            onChange={v => updateForm(seg.id, 'regiao', v)}
                            options={REGIOES.map(r => ({ value: r, label: r }))}
                            placeholder="Selecione"
                          />
                        </div>
                      </div>

                      {!isFormValid(seg.id) && (
                        <p style={{ fontSize: 12, color: '#f97316' }}>
                          ⚠ Preencha todos os campos marcados com * para habilitar o botão salvar.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Actions */}
        {segments.length > 0 && existingCount < 3 && (
          <div style={{ display: 'flex', gap: 10, position: 'sticky', bottom: 16 }}>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                flex: 1,
                background: canSave ? '#FC4C02' : '#e5e5e5',
                color: canSave ? '#fff' : '#888',
                border: 'none', borderRadius: 4,
                padding: '12px 0', fontSize: 14, fontWeight: 500,
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}
            >
              {saving
                ? 'Salvando...'
                : canSave
                ? `Salvar ${selected.size} trilha${selected.size !== 1 ? 's' : ''}`
                : 'Preencha todos os campos obrigatórios'}
            </button>
            <button
              onClick={() => router.replace('/perfil')}
              style={{
                padding: '12px 20px', borderRadius: 4,
                background: '#fff', color: '#888',
                border: '0.5px solid #e5e5e5',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function StravaPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#FC4C02', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <StravaPageInner />
    </Suspense>
  )
}
