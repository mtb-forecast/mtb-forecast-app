'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type StravaSegment = {
  id: number
  name: string
  distance: number
  total_elevation_gain: number
  start_latlng: number[]
  end_latlng: number[]
  city: string | null
  state: string | null
  country: string | null
}

type SegmentForm = {
  solo_type: string
  exposicao: string
  trail_type: string
  regiao: string
}

const SOLO_TYPES = [
  { value: 'terra', label: 'Terra' },
  { value: 'misto', label: 'Misto' },
  { value: 'preto', label: 'Preto (barro)' },
  { value: 'pedra', label: 'Pedra' },
  { value: 'ferro', label: 'Ferro (Ferrífero)' },
  { value: 'misto_mg', label: 'Misto MG' },
]

const REGIOES_OPT = ['SP', 'MG', 'RJ', 'PR', 'SC', 'RS', 'outros']

function StravaPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [segments, setSegments] = useState<StravaSegment[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [forms, setForms] = useState<Record<number, SegmentForm>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingCount, setExistingCount] = useState(0)

  useEffect(() => {
    const raw = searchParams.get('segments')
    if (raw) {
      try {
        setSegments(JSON.parse(raw))
      } catch {
        setError('Erro ao carregar segmentos. Tente reconectar o Strava.')
      }
    }

    async function checkExisting() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { count } = await supabase
        .from('trilhas_pessoais')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
      setExistingCount(count ?? 0)
    }
    checkExisting()
  }, [router, searchParams])

  function toggleSegment(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= 3) return prev
        next.add(id)
        if (!forms[id]) {
          setForms(f => ({ ...f, [id]: { solo_type: 'terra', exposicao: 'fechada', trail_type: 'natural', regiao: 'SP' } }))
        }
      }
      return next
    })
  }

  function updateForm(id: number, field: keyof SegmentForm, value: string) {
    setForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function handleSave() {
    setError(null)
    if (selected.size === 0) { setError('Selecione ao menos um segmento.'); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const slots = 3 - existingCount
    if (selected.size > slots) {
      setError(`Você já tem ${existingCount} trilha(s) pessoal(is). Pode adicionar no máximo ${slots} mais.`)
      return
    }

    setSaving(true)
    const rows = Array.from(selected).map(id => {
      const seg = segments.find(s => s.id === id)!
      const form = forms[id] ?? { solo_type: 'terra', exposicao: 'fechada', trail_type: 'natural', regiao: 'SP' }
      return {
        user_id: user.id,
        strava_segment_id: seg.id,
        name: seg.name,
        lat: seg.start_latlng[0] ?? 0,
        lon: seg.start_latlng[1] ?? 0,
        extensao_km: parseFloat((seg.distance / 1000).toFixed(2)),
        desnivel_m: Math.round(seg.total_elevation_gain),
        solo_type: form.solo_type,
        exposicao: form.exposicao,
        trail_type: form.trail_type,
        regiao: form.regiao,
        strava_url: `https://www.strava.com/segments/${seg.id}`,
      }
    })

    const { error: dbErr } = await supabase.from('trilhas_pessoais').insert(rows)
    setSaving(false)

    if (dbErr) {
      setError(`Erro ao salvar: ${dbErr.message}`)
      return
    }

    router.replace('/perfil')
  }

  const cardStyle = {
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-wheat text-3xl text-[#1e293b]">Conectar trilhas do Strava</h1>
        <p className="text-[#64748b] mt-1 text-sm">
          Selecione até {3 - existingCount} segmento(s) para acompanhar as condições
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200">
          {error}
        </div>
      )}

      {segments.length === 0 && !error && (
        <div className="rounded-xl p-10 text-center text-[#64748b]" style={cardStyle}>
          Nenhum segmento encontrado. Verifique se você tem segmentos favoritos no Strava.
        </div>
      )}

      {segments.length > 0 && (
        <div className="space-y-3 mb-6">
          {segments.map(seg => {
            const isSelected = selected.has(seg.id)
            const isDisabled = !isSelected && selected.size >= 3
            const distKm = (seg.distance / 1000).toFixed(1)
            const location = [seg.city, seg.state].filter(Boolean).join(', ')

            return (
              <div
                key={seg.id}
                className="rounded-xl overflow-hidden"
                style={{
                  ...cardStyle,
                  borderLeft: `4px solid ${isSelected ? '#FC4C02' : 'rgba(0,0,0,0.08)'}`,
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <div className="p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggleSegment(seg.id)}
                      className="mt-1 w-4 h-4 accent-[#FC4C02] flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-[#1e293b] text-sm leading-tight">{seg.name}</p>
                        <a
                          href={`https://www.strava.com/segments/${seg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#FC4C02] text-xs font-medium flex-shrink-0 hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          Ver no Strava ↗
                        </a>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-[#64748b]">
                        <span>📏 {distKm} km</span>
                        <span>⛰ {Math.round(seg.total_elevation_gain)}m</span>
                        {location && <span>📍 {location}</span>}
                      </div>
                    </div>
                  </label>

                  {/* Formulário só aparece quando selecionado */}
                  {isSelected && forms[seg.id] && (
                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#64748b] mb-1">Tipo de solo</label>
                        <select
                          value={forms[seg.id].solo_type}
                          onChange={e => updateForm(seg.id, 'solo_type', e.target.value)}
                          className="input-field text-sm py-1.5"
                        >
                          {SOLO_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748b] mb-1">Exposição</label>
                        <select
                          value={forms[seg.id].exposicao}
                          onChange={e => updateForm(seg.id, 'exposicao', e.target.value)}
                          className="input-field text-sm py-1.5"
                        >
                          <option value="aberta">Aberta</option>
                          <option value="fechada">Fechada</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748b] mb-1">Tipo de trilha</label>
                        <select
                          value={forms[seg.id].trail_type}
                          onChange={e => updateForm(seg.id, 'trail_type', e.target.value)}
                          className="input-field text-sm py-1.5"
                        >
                          <option value="natural">Natural</option>
                          <option value="bikepark">Bike Park</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748b] mb-1">Região</label>
                        <select
                          value={forms[seg.id].regiao}
                          onChange={e => updateForm(seg.id, 'regiao', e.target.value)}
                          className="input-field text-sm py-1.5"
                        >
                          {REGIOES_OPT.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {segments.length > 0 && (
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || selected.size === 0}
            className="flex-1 font-semibold text-white py-3 rounded-xl transition-colors disabled:opacity-50"
            style={{ background: '#FC4C02' }}
          >
            {saving ? 'Salvando...' : `Salvar ${selected.size} trilha(s) pessoal(is)`}
          </button>
          <button
            onClick={() => router.replace('/perfil')}
            className="px-5 py-3 rounded-xl border border-slate-200 text-[#64748b] hover:bg-white transition-colors text-sm"
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
