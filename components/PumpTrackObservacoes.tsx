'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type ObsPT = {
  id: string
  pumptrack_id: string
  user_id: string
  estrelas: number | null
  texto: string | null
  veredicto_rider: string | null
  created_at: string
  profiles?: { apelido?: string; nome?: string; email?: string; avatar_url?: string | null }
}

type FotoPT = {
  id: string
  url: string
  user_id: string
  created_at: string
  profiles?: { apelido?: string; nome?: string; avatar_url?: string | null }
}

const VEREDICTOS_RIDER = [
  { label: 'Rolou top 🤙', value: 'ROLOU TOP' },
  { label: 'Estava molhado 🌧', value: 'ESTAVA MOLHADO' },
  { label: 'Seco e rápido ⚡', value: 'SECO E RÁPIDO' },
  { label: 'Cheio de pedal 🚴', value: 'CHEIO DE PEDAL' },
  { label: 'Bom pra família 👨‍👩‍👧', value: 'BOM PRA FAMÍLIA' },
]

const VEREDICTO_STYLE: Record<string, { bg: string; color: string }> = {
  'ROLOU TOP':      { bg: '#dcfce7', color: '#166534' },
  'ESTAVA MOLHADO': { bg: '#dbeafe', color: '#1e40af' },
  'SECO E RÁPIDO':  { bg: '#fef9c3', color: '#854d0e' },
  'CHEIO DE PEDAL': { bg: '#ede9fe', color: '#5b21b6' },
  'BOM PRA FAMÍLIA':{ bg: '#fce7f3', color: '#9d174d' },
}

function Stars({ count, size = 13 }: { count: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < count ? '#a8b899' : '#e5e5e5', fontSize: size }}>★</span>
      ))}
    </span>
  )
}

function StarSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          onMouseEnter={() => setHovered(i + 1)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i + 1)}
          style={{ color: i < (hovered || value) ? '#a8b899' : '#d1d5db', fontSize: 24, cursor: 'pointer', transition: 'color 0.1s' }}
        >★</span>
      ))}
    </div>
  )
}

function formatDate(d: string) {
  const date = new Date(d), now = new Date()
  const t = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `Hoje, ${t}`
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (date.toDateString() === y.toDateString()) return `Ontem, ${t}`
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}, ${t}`
}

function Avatar({ obs, size = 34 }: { obs: { profiles?: { apelido?: string; nome?: string; email?: string; avatar_url?: string | null } }; size?: number }) {
  const p = obs.profiles
  const initials = ((p?.apelido || p?.nome || p?.email?.split('@')[0] || '?').slice(0, 2)).toUpperCase()
  return p?.avatar_url ? (
    <img src={p.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

export default function PumpTrackObservacoes({ pumptracks_id, userId }: { pumptracks_id: string; userId: string | null }) {
  const [obs, setObs] = useState<ObsPT[]>([])
  const [fotos, setFotos] = useState<FotoPT[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'reviews' | 'fotos'>('reviews')

  // Form state
  const [estrelas, setEstrelas] = useState(0)
  const [texto, setTexto] = useState('')
  const [veredictoRider, setVeredictoRider] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Foto state
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [fotoError, setFotoError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    const [{ data: obsData }, { data: fotosData }] = await Promise.all([
      supabase.from('observacoes_pumptrack')
        .select('*, profiles(apelido, nome, email, avatar_url)')
        .eq('pumptrack_id', pumptracks_id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('fotos_pumptrack')
        .select('*, profiles(apelido, nome, avatar_url)')
        .eq('pumptrack_id', pumptracks_id)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    if (obsData) setObs(obsData as ObsPT[])
    if (fotosData) setFotos(fotosData as FotoPT[])
    setLoading(false)
  }, [pumptracks_id])

  useEffect(() => { loadData() }, [loadData])

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!userId) { setFormError('Faça login para comentar.'); return }
    if (estrelas === 0) { setFormError('Selecione uma avaliação em estrelas.'); return }
    if (!texto.trim()) { setFormError('Escreva algo sobre o pump track.'); return }

    setSaving(true)
    if (editingId) {
      const { error } = await supabase.from('observacoes_pumptrack')
        .update({ estrelas, texto: texto.trim(), veredicto_rider: veredictoRider || null })
        .eq('id', editingId)
      if (error) { setFormError('Erro ao atualizar.'); setSaving(false); return }
    } else {
      const { error } = await supabase.from('observacoes_pumptrack').insert({
        pumptrack_id: pumptracks_id, user_id: userId,
        estrelas, texto: texto.trim(),
        veredicto_rider: veredictoRider || null,
      })
      if (error) { setFormError('Erro ao enviar.'); setSaving(false); return }
    }
    setSaving(false)
    setEstrelas(0); setTexto(''); setVeredictoRider(''); setEditingId(null)
    loadData()
  }

  async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setFotoError(null)
    setUploadingFoto(true)
    const form = new FormData()
    form.append('file', file)
    form.append('pumptrack_id', pumptracks_id)
    try {
      const res = await fetch('/api/pump-track/foto', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setFotoError(data.error || 'Erro no upload.') }
      else { loadData(); setActiveTab('fotos') }
    } catch { setFotoError('Erro de conexão.') }
    finally { setUploadingFoto(false); e.target.value = '' }
  }

  function startEdit(o: ObsPT) {
    setEditingId(o.id)
    setEstrelas(o.estrelas ?? 0)
    setTexto(o.texto ?? '')
    setVeredictoRider(o.veredicto_rider ?? '')
  }

  const canEdit = (o: ObsPT) =>
    o.user_id === userId && (new Date().getTime() - new Date(o.created_at).getTime()) < 86400000

  const tabBtn = (tab: 'reviews' | 'fotos', label: string, count: number) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
        color: activeTab === tab ? '#7C3AED' : '#6B7280',
        borderBottom: activeTab === tab ? '2px solid #7C3AED' : '2px solid transparent',
        padding: '8px 4px', transition: 'all 0.15s',
      }}
    >
      {label} <span style={{ fontSize: 11, color: activeTab === tab ? '#7C3AED' : '#9CA3AF' }}>({count})</span>
    </button>
  )

  return (
    <div style={{ marginTop: 24 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #E5E7EB', marginBottom: 20 }}>
        {tabBtn('reviews', 'Avaliações', obs.length)}
        {tabBtn('fotos', 'Fotos', fotos.length)}
      </div>

      {/* ── Tab Fotos ── */}
      {activeTab === 'fotos' && (
        <div>
          {userId && (
            <div style={{ marginBottom: 16 }}>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFotoUpload} disabled={uploadingFoto} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFoto}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#7C3AED', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '10px 18px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: uploadingFoto ? 0.6 : 1,
                }}
              >
                {uploadingFoto ? '⏳ Enviando…' : '📷 Adicionar foto'}
              </button>
              {fotoError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{fotoError}</p>}
            </div>
          )}
          {loading ? (
            <p style={{ fontSize: 13, color: '#9CA3AF' }}>Carregando fotos…</p>
          ) : fotos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>📷</p>
              <p style={{ fontSize: 13 }}>Nenhuma foto ainda. Seja o primeiro!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {fotos.map(f => (
                <div key={f.id} onClick={() => setLightbox(f.url)} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}>
                  <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Reviews ── */}
      {activeTab === 'reviews' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Formulário */}
          {userId ? (
            <form onSubmit={handleSubmitReview} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#7C3AED', margin: 0 }}>
                {editingId ? 'Editar avaliação' : 'Deixar avaliação'}
              </p>
              <StarSelector value={estrelas} onChange={setEstrelas} />

              {/* Veredicto rápido */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {VEREDICTOS_RIDER.map(v => {
                  const active = veredictoRider === v.value
                  const st = VEREDICTO_STYLE[v.value]
                  return (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => setVeredictoRider(active ? '' : v.value)}
                      style={{
                        fontSize: 11, fontWeight: 600, borderRadius: 999,
                        padding: '4px 10px', cursor: 'pointer', border: 'none',
                        background: active ? st.bg : '#F3F4F6',
                        color: active ? st.color : '#6B7280',
                        transition: 'all 0.15s',
                      }}
                    >
                      {v.label}
                    </button>
                  )
                })}
              </div>

              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value.slice(0, 200))}
                placeholder="Como estava o pump track? Superfície, condição, movimento…"
                rows={3}
                style={{ fontSize: 13, border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{texto.length}/200</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {editingId && (
                    <button type="button" onClick={() => { setEditingId(null); setEstrelas(0); setTexto(''); setVeredictoRider('') }}
                      style={{ fontSize: 12, background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', color: '#6B7280' }}>
                      Cancelar
                    </button>
                  )}
                  <button type="submit" disabled={saving} style={{ fontSize: 12, fontWeight: 700, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Enviando…' : editingId ? 'Salvar' : 'Publicar'}
                  </button>
                </div>
              </div>
              {formError && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{formError}</p>}
            </form>
          ) : (
            <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>
              <a href="/login" style={{ color: '#7C3AED', fontWeight: 600 }}>Faça login</a> para deixar uma avaliação.
            </p>
          )}

          {/* Lista de avaliações */}
          {loading ? (
            <p style={{ fontSize: 13, color: '#9CA3AF' }}>Carregando avaliações…</p>
          ) : obs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#9CA3AF' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>🤙</p>
              <p style={{ fontSize: 13 }}>Nenhuma avaliação ainda. Seja o primeiro!</p>
            </div>
          ) : obs.map(o => {
            const vs = o.veredicto_rider ? VEREDICTO_STYLE[o.veredicto_rider] : null
            return (
              <div key={o.id} style={{ display: 'flex', gap: 12 }}>
                <Avatar obs={o} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                      {o.profiles?.apelido || o.profiles?.nome?.split(' ')[0] || 'Rider'}
                    </span>
                    {o.estrelas != null && <Stars count={o.estrelas} />}
                    {o.veredicto_rider && vs && (
                      <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: vs.bg, color: vs.color }}>
                        {o.veredicto_rider}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>{formatDate(o.created_at)}</span>
                  </div>
                  {o.texto && <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, margin: 0 }}>{o.texto}</p>}
                  {canEdit(o) && !editingId && (
                    <button onClick={() => startEdit(o)} style={{ fontSize: 11, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 4 }}>
                      Editar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out',
        }}>
          <img src={lightbox} alt="" style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}
