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
    <label className="block text-xs font-medium text-[#64748b] mb-1">
      {children} <span className="text-red-500">*</span>
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
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="input-field text-sm py-2"
    >
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingCount, setExistingCount] = useState(0)

  const slotsLeft = 3 - existingCount

  // ── Load segments + check existing ──────────────────────────────────────────

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

  // ── Fetch soil from OpenLandMap ──────────────────────────────────────────────

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

  // ── Toggle segment selection ─────────────────────────────────────────────────

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

      // Initialize form if not yet done
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

      // Fetch soil suggestion
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

  // ── Validation ───────────────────────────────────────────────────────────────

  function isFormValid(id: number): boolean {
    const f = forms[id]
    return !!(f && f.solo_type && f.exposicao && f.trail_type && f.bioma)
  }

  const allValid = selected.size > 0 && Array.from(selected).every(isFormValid)
  const canSave = allValid && !saving

  // ── Save ─────────────────────────────────────────────────────────────────────

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
    const rows = Array.from(selected).map(id => {
      const seg = segments.find(s => s.id === id)!
      const form = forms[id]
      return {
        user_id: user.id,
        strava_segment_id: seg.id,
        name: form.nome || seg.name,
        lat: seg.start_latlng[0] ?? 0,
        lon: seg.start_latlng[1] ?? 0,
        extensao_km: parseFloat((seg.distance / 1000).toFixed(2)),
        desnivel_m: seg.total_elevation_gain != null ? Math.round(Number(seg.total_elevation_gain) * 10) / 10 : null,
        altitude_m: Math.round(Number(form.altitude_m) || 0),
        solo_type: form.solo_type,
        exposicao: form.exposicao,
        trail_type: form.trail_type,
        bioma: form.bioma,
        regiao: form.regiao,
        strava_url: `https://www.strava.com/segments/${seg.id}`,
        polyline: seg.polyline || null,
        strava_elevation_profile: seg.elevation_profile || null,
      }
    })

    const { error: dbErr } = await supabase.from('trilhas_pessoais').insert(rows)
    setSaving(false)
    if (dbErr) { setError(`Erro ao salvar: ${dbErr.message}`); return }
    router.replace('/perfil')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const cardBase = {
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-2">
        <h1 className="font-wheat text-3xl text-[#1e293b]">Conectar trilhas do Strava</h1>
        <p className="text-[#64748b] mt-1 text-sm">
          Selecione até <strong>{slotsLeft}</strong> segmento(s) para acompanhar as condições
        </p>
      </div>

      {/* Contador */}
      {selected.size > 0 && (
        <div className="mb-4 text-sm font-medium" style={{ color: '#FC4C02' }}>
          {selected.size} de {slotsLeft} selecionados
        </div>
      )}
      {selected.size === 0 && <div className="mb-4" />}

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200">
          {error}
        </div>
      )}

      {existingCount >= 3 && (
        <div className="mb-6 rounded-xl p-6 text-center" style={cardBase}>
          <p className="text-[#1e293b] font-semibold mb-1">Limite de trilhas atingido</p>
          <p className="text-[#64748b] text-sm">Você já tem 3 trilhas pessoais. Exclua uma no Perfil para adicionar nova.</p>
          <button onClick={() => router.replace('/perfil')} className="mt-4 text-sm text-green-600 hover:text-green-500 font-medium">
            Ir para o Perfil →
          </button>
        </div>
      )}

      {segments.length === 0 && !error && existingCount < 3 && (
        <div className="rounded-xl p-10 text-center text-[#64748b]" style={{ ...cardBase, border: '1px solid rgba(0,0,0,0.08)' }}>
          Nenhum segmento encontrado. Verifique se você tem segmentos favoritos no Strava.
        </div>
      )}

      {/* Segment list */}
      {segments.length > 0 && existingCount < 3 && (
        <div className="space-y-3 mb-6">
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
                className="rounded-xl overflow-hidden"
                style={{
                  ...cardBase,
                  border: `1px solid ${isSelected ? 'rgba(22,163,74,0.4)' : 'rgba(0,0,0,0.08)'}`,
                  borderLeft: `4px solid ${isSelected ? '#16a34a' : 'rgba(0,0,0,0.12)'}`,
                  opacity: isDisabled ? 0.45 : 1,
                  transition: 'border-color 0.15s, opacity 0.15s',
                }}
              >
                {/* Card header — clickable row */}
                <div
                  className="p-4 cursor-pointer select-none"
                  onClick={() => !isDisabled && toggleSegment(seg)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggleSegment(seg)}
                      onClick={e => e.stopPropagation()}
                      className="mt-0.5 w-4 h-4 flex-shrink-0"
                      style={{ accentColor: '#16a34a' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-[#1e293b] text-sm leading-snug">{seg.name}</p>
                        <a
                          href={`https://www.strava.com/segments/${seg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium flex-shrink-0 hover:underline"
                          style={{ color: '#FC4C02' }}
                          onClick={e => e.stopPropagation()}
                        >
                          Ver no Strava ↗
                        </a>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-[#64748b]">
                        <span>📏 <b>{distKm} km</b></span>
                        <span>⛰ <b>{seg.total_elevation_gain != null ? `${Math.round(seg.total_elevation_gain)}m` : '—'}</b> desnível</span>
                        {seg.elevation_high != null && (
                          <span>🏔 <b>{Math.round(seg.elevation_high)}m</b> alt. máx.</span>
                        )}
                        {location && <span>📍 {location}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded form */}
                {isSelected && form && (
                  <div
                    className="px-4 pb-4 pt-3 space-y-4"
                    style={{ borderTop: '1px solid rgba(0,0,0,0.06)', background: '#f8fafc', borderLeft: '3px solid #16a34a' }}
                  >
                    {/* Nome */}
                    <div>
                      <label className="block text-xs font-medium text-[#64748b] mb-1">Nome</label>
                      <input
                        type="text"
                        value={form.nome}
                        onChange={e => updateForm(seg.id, 'nome', e.target.value)}
                        className="input-field text-sm py-2"
                      />
                    </div>

                    {/* Somente leitura: distância + desnível + altitude */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-[#64748b] mb-1">Distância</label>
                        <input readOnly value={`${distKm} km`} className="input-field text-sm py-2 opacity-60 cursor-not-allowed" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748b] mb-1">Desnível</label>
                        <input readOnly value={seg.total_elevation_gain != null ? `${Math.round(seg.total_elevation_gain)}m` : '—'} className="input-field text-sm py-2 opacity-60 cursor-not-allowed" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748b] mb-1">Altitude máx.</label>
                        <input
                          type="number"
                          value={form.altitude_m ?? ''}
                          onChange={e => updateForm(seg.id, 'altitude_m', e.target.value)}
                          className="input-field text-sm py-2"
                          placeholder="m"
                        />
                      </div>
                    </div>

                    {/* Tipo de Solo com badge de sugestão */}
                    <div>
                      <RequiredLabel>Tipo de solo</RequiredLabel>
                      {soil === 'loading' && (
                        <div className="flex items-center gap-2 text-xs text-[#64748b] mb-1.5">
                          <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                          Buscando tipo de solo via OpenLandMap...
                        </div>
                      )}
                      {soil === 'ok' && (
                        <div className="mb-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                            🤖 Sugerido pela API
                          </span>
                        </div>
                      )}
                      {soil === 'error' && (
                        <div className="mb-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
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

                    {/* Grid: exposição + tipo de trilha + bioma + região */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <RequiredLabel>Exposição</RequiredLabel>
                        <SelectField
                          value={form.exposicao}
                          onChange={v => updateForm(seg.id, 'exposicao', v)}
                          options={[
                            { value: 'aberta',  label: 'Aberta — Sol direto, cristas, campos' },
                            { value: 'fechada', label: 'Fechada — Mata densa, sombra constante' },
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
                        <label className="block text-xs font-medium text-[#64748b] mb-1">Região</label>
                        <SelectField
                          value={form.regiao}
                          onChange={v => updateForm(seg.id, 'regiao', v)}
                          options={REGIOES.map(r => ({ value: r, label: r }))}
                          placeholder="Selecione"
                        />
                      </div>
                    </div>

                    {/* Indicador de completude do form */}
                    {!isFormValid(seg.id) && (
                      <p className="text-xs text-amber-600">
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
        <div className="flex gap-3 sticky bottom-4">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 font-semibold text-white py-3 rounded-xl transition-all"
            style={{
              background: canSave ? '#FC4C02' : '#94a3b8',
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving
              ? 'Salvando...'
              : canSave
              ? `Salvar ${selected.size} trilha(s) pessoal(is)`
              : 'Preencha todos os campos obrigatórios'}
          </button>
          <button
            onClick={() => router.replace('/perfil')}
            className="px-5 py-3 rounded-xl text-[#64748b] text-sm font-medium transition-colors hover:bg-white"
            style={{ border: '1px solid rgba(0,0,0,0.12)' }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

export default function StravaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#FC4C02] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <StravaPageInner />
    </Suspense>
  )
}
