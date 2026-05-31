'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getClientUser } from '@/lib/supabase'

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

type ConfigAtual = {
  name: string
  solo_type: string
  exposicao: string
  trail_type: string
  bioma: string
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #E0E0E0',
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-[#64748b] font-medium">{label}</span>
      <span className="text-xs text-[#1e293b] font-semibold capitalize">{value || '—'}</span>
    </div>
  )
}

function SelectField({
  label, value, onChange, options, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#64748b] mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-field text-sm py-2"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export default function SugestaoPage() {
  const router = useRouter()
  const params = useParams()
  const segmentId = Number(params.segment_id)

  const [configAtual, setConfigAtual] = useState<ConfigAtual | null>(null)
  const [soloType, setSoloType] = useState('')
  const [exposicao, setExposicao] = useState('')
  const [trailType, setTrailType] = useState('')
  const [bioma, setBioma] = useState('')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.replace('/perfil'); return }

      const { data: config } = await supabase
        .from('strava_segmentos_config')
        .select('name, solo_type, exposicao, trail_type, bioma')
        .eq('strava_segment_id', segmentId)
        .maybeSingle()

      setConfigAtual(config)
      if (config) {
        setSoloType(config.solo_type)
        setExposicao(config.exposicao)
        setTrailType(config.trail_type)
        setBioma(config.bioma)
      }
      setLoading(false)
    }
    load()
  }, [segmentId, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!motivo.trim()) { setError('O motivo é obrigatório.'); return }

    const user = await getClientUser()
    if (!user) { window.location.href = '/login'; return }

    setSaving(true)
    const { error: dbErr } = await supabase.from('strava_config_sugestoes').insert({
      strava_segment_id: segmentId,
      user_id: user.id,
      solo_type: soloType,
      exposicao: exposicao,
      trail_type: trailType,
      bioma: bioma,
      motivo: motivo.trim(),
      status: 'pendente',
    })
    setSaving(false)

    if (dbErr) { setError(`Erro ao enviar: ${dbErr.message}`); return }
    setSuccess(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F5F5' }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#111111', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="rounded-xl p-8 text-center max-w-sm w-full" style={cardStyle}>
          <div className="text-3xl mb-3">✅</div>
          <h2 className="font-wheat text-xl text-[#1e293b] mb-2">Sugestão enviada!</h2>
          <p className="text-[#64748b] text-sm mb-6">Os admins irão analisar sua sugestão em breve.</p>
          <button
            onClick={() => router.replace('/perfil')}
            className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            Voltar ao perfil
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-lg mx-auto">
      <button
        onClick={() => router.back()}
        className="text-[#64748b] text-sm font-medium mb-6 flex items-center gap-1 hover:text-[#1e293b] transition-colors"
      >
        ← Voltar
      </button>

      <h1 className="font-wheat text-3xl text-[#1e293b] mb-1">Sugerir alteração</h1>
      <p className="text-[#64748b] text-sm mb-6">
        Sugira uma nova configuração para o segmento <strong>{configAtual?.name ?? `#${segmentId}`}</strong>.
      </p>

      {/* Config atual */}
      {configAtual && (
        <div className="rounded-xl p-4 mb-6" style={cardStyle}>
          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Configuração atual</p>
          <Field label="Tipo de solo" value={configAtual.solo_type} />
          <Field label="Exposição" value={configAtual.exposicao} />
          <Field label="Tipo de trilha" value={configAtual.trail_type} />
          <Field label="Bioma" value={configAtual.bioma} />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl p-5 space-y-4" style={cardStyle}>
        <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Nova configuração sugerida</p>

        <SelectField
          label="Tipo de solo"
          value={soloType}
          onChange={setSoloType}
          options={SOLO_TYPES}
          placeholder="Selecione"
        />
        <SelectField
          label="Exposição"
          value={exposicao}
          onChange={setExposicao}
          options={[
            { value: 'aberta',  label: 'Aberta — Sol direto, cristas, campos' },
            { value: 'fechada', label: 'Fechada — Mata densa, sombra constante' },
          ]}
          placeholder="Selecione"
        />
        <SelectField
          label="Tipo de trilha"
          value={trailType}
          onChange={setTrailType}
          options={[
            { value: 'natural',  label: 'Natural — Sem drenagem' },
            { value: 'bikepark', label: 'Bike Park — Com drenagem' },
          ]}
          placeholder="Selecione"
        />
        <SelectField
          label="Bioma"
          value={bioma}
          onChange={setBioma}
          options={BIOMAS}
          placeholder="Selecione"
        />

        <div>
          <label className="block text-xs font-medium text-[#64748b] mb-1">
            Motivo da sugestão <span className="text-red-500">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            placeholder="Explique por que a configuração atual está incorreta..."
            className="input-field text-sm py-2 resize-none"
            required
          />
        </div>

        <button
          type="submit"
          disabled={saving || !motivo.trim()}
          className="w-full font-semibold text-white py-3 rounded-xl transition-all"
          style={{
            background: saving || !motivo.trim() ? '#94a3b8' : '#16a34a',
            cursor: saving || !motivo.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Enviando...' : 'Enviar sugestão'}
        </button>
      </form>
    </div>
  )
}
