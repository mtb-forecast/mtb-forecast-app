'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Observacao } from '@/lib/types'

type Props = {
  trilhaId: string
  veredictoAtual: string
}

const VEREDICTO_BADGE: Record<string, { bg: string; color: string }> = {
  'DROP LIBERADO': { bg: '#dcfce7', color: '#166534' },
  'ATENÇÃO':       { bg: '#fef9c3', color: '#854d0e' },
  'MELHOR ESPERAR': { bg: '#fee2e2', color: '#991b1b' },
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `Hoje, ${timeStr}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Ontem, ${timeStr}`
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}, ${timeStr}`
}

function getInitials(obs: Observacao): string {
  const name = obs.profiles?.apelido || obs.profiles?.nome || obs.profiles?.email?.split('@')[0] || '?'
  return name.slice(0, 2).toUpperCase()
}

function getDisplayName(obs: Observacao): string {
  return obs.profiles?.apelido || obs.profiles?.nome?.split(' ')[0] || obs.profiles?.email?.split('@')[0] || 'Rider'
}

function Stars({ count, size = 13 }: { count: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < count ? '#FFE000' : '#e5e5e5', fontSize: size, lineHeight: 1 }}>★</span>
      ))}
    </span>
  )
}

function StarSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < (hovered || value)
        return (
          <span
            key={i}
            style={{ color: filled ? '#FFE000' : '#e5e5e5', fontSize: 24, cursor: 'pointer', lineHeight: 1, userSelect: 'none' }}
            onMouseEnter={() => setHovered(i + 1)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(i + 1)}
          >
            ★
          </span>
        )
      })}
    </div>
  )
}

export default function TrailObservations({ trilhaId, veredictoAtual }: Props) {
  const [observacoes, setObservacoes] = useState<Observacao[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [podeComentar, setPodeComentar] = useState(false)
  const [favoritando, setFavoritando] = useState(false)

  // New observation form
  const [estrelas, setEstrelas] = useState(0)
  const [texto, setTexto] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEstrelas, setEditEstrelas] = useState(0)
  const [editTexto, setEditTexto] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [{ data: obs }, { data: favorito }] = await Promise.all([
      supabase
        .from('observacoes_trilha')
        .select(`id, estrelas, texto, veredicto_sistema, created_at, user_id, profiles (apelido, nome, email)`)
        .eq('trilha_id', trilhaId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('favoritos')
        .select('id')
        .eq('trilha_id', trilhaId)
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    setObservacoes((obs as unknown as Observacao[]) || [])
    setPodeComentar(!!favorito)
    setLoading(false)
  }, [trilhaId])

  useEffect(() => { load() }, [load])

  async function handleFavoritar() {
    if (!userId || favoritando) return
    setFavoritando(true)
    await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
    setPodeComentar(true)
    setFavoritando(false)
  }

  async function handlePublish() {
    if (!userId || estrelas === 0 || !texto.trim() || texto.length > 150) return
    setPublishing(true)
    const { data: newObs, error } = await supabase
      .from('observacoes_trilha')
      .insert({
        trilha_id: trilhaId,
        user_id: userId,
        estrelas,
        texto: texto.trim(),
        veredicto_sistema: veredictoAtual || null,
      })
      .select(`id, estrelas, texto, veredicto_sistema, created_at, user_id, profiles (apelido, nome, email)`)
      .single()

    setPublishing(false)
    if (!error && newObs) {
      setObservacoes(prev => [newObs as unknown as Observacao, ...prev])
      setEstrelas(0)
      setTexto('')
      setPublishSuccess(true)
      setTimeout(() => setPublishSuccess(false), 3000)
    }
  }

  function startEdit(obs: Observacao) {
    setEditingId(obs.id)
    setEditEstrelas(obs.estrelas)
    setEditTexto(obs.texto)
  }

  async function handleSaveEdit(id: string) {
    if (!editTexto.trim() || editTexto.length > 150 || editEstrelas === 0) return
    setSaving(true)
    const { error } = await supabase
      .from('observacoes_trilha')
      .update({ estrelas: editEstrelas, texto: editTexto.trim() })
      .eq('id', id)
    setSaving(false)
    if (!error) {
      setObservacoes(prev =>
        prev.map(o => o.id === id ? { ...o, estrelas: editEstrelas, texto: editTexto.trim() } : o)
      )
      setEditingId(null)
    }
  }

  const canPublish = estrelas > 0 && texto.trim().length > 0 && texto.length <= 150

  const media = observacoes.length > 0
    ? (observacoes.reduce((sum, o) => sum + o.estrelas, 0) / observacoes.length).toFixed(1)
    : null

  if (loading) return null

  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 20, marginBottom: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '1.5px', color: '#888', textTransform: 'uppercase', margin: 0 }}>
          Avaliações dos riders
        </p>
        {media && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
            <b style={{ color: '#111' }}>{media}</b>
            <Stars count={Math.round(parseFloat(media))} />
            <span>({observacoes.length})</span>
          </div>
        )}
      </div>

      {/* Timeline */}
      {observacoes.length > 0 && (
        <div style={{ position: 'relative', paddingLeft: 20, marginBottom: 4 }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 1.5, background: '#e5e5e5' }} />

          {observacoes.map(obs => {
            const ageMs = Date.now() - new Date(obs.created_at).getTime()
            const isRecent = ageMs < 24 * 60 * 60 * 1000
            const isOwn = obs.user_id === userId
            const vBadge = obs.veredicto_sistema ? (VEREDICTO_BADGE[obs.veredicto_sistema] ?? null) : null
            const isEditing = editingId === obs.id

            return (
              <div key={obs.id} style={{ position: 'relative', marginBottom: 12 }}>
                {/* Timeline dot */}
                <div style={{
                  position: 'absolute',
                  left: -14, top: 12,
                  width: 10, height: 10,
                  borderRadius: '50%',
                  background: isRecent ? '#FFE000' : '#e5e5e5',
                  border: `1.5px solid ${isRecent ? '#111' : '#ccc'}`,
                }} />

                {/* Card */}
                <div style={{ background: '#f7f7f5', borderRadius: 6, padding: '10px 12px' }}>

                  {/* Top row: avatar + name + stars */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isEditing ? 8 : 6 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: '#111', color: '#FFE000',
                      fontSize: 10, fontWeight: 500,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {getInitials(obs)}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{getDisplayName(obs)}</span>
                    {isEditing
                      ? <StarSelector value={editEstrelas} onChange={setEditEstrelas} />
                      : <Stars count={obs.estrelas} />
                    }
                  </div>

                  {/* Text / edit textarea */}
                  {isEditing ? (
                    <div>
                      <textarea
                        value={editTexto}
                        onChange={e => setEditTexto(e.target.value)}
                        maxLength={150}
                        style={{
                          width: '100%', border: '1px solid #e5e5e5', borderRadius: 4,
                          padding: '8px 10px', fontSize: 12, minHeight: 64,
                          resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                          outline: 'none',
                        }}
                        onFocus={e => (e.target.style.borderColor = '#111')}
                        onBlur={e => (e.target.style.borderColor = '#e5e5e5')}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: editTexto.length > 130 ? '#ef4444' : '#888' }}>
                          {editTexto.length}/150
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => setEditingId(null)}
                            style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleSaveEdit(obs.id)}
                            disabled={saving || !editTexto.trim() || editTexto.length > 150 || editEstrelas === 0}
                            style={{
                              fontSize: 12, fontWeight: 500, color: '#111',
                              background: '#FFE000', border: '1px solid #111',
                              borderRadius: 4, padding: '4px 12px', cursor: saving ? 'not-allowed' : 'pointer',
                              opacity: saving ? 0.7 : 1,
                            }}
                          >
                            {saving ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 12, color: '#444', lineHeight: 1.5, marginBottom: 6 }}>{obs.texto}</p>
                      {/* Footer */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#aaa' }}>{formatDate(obs.created_at)}</span>
                        {vBadge && obs.veredicto_sistema && (
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 2, background: vBadge.bg, color: vBadge.color }}>
                            {obs.veredicto_sistema}
                          </span>
                        )}
                        {isOwn && isRecent && (
                          <button
                            onClick={() => startEdit(obs)}
                            style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', textDecoration: 'underline' }}
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {observacoes.length === 0 && (
        <p style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic', marginBottom: 4 }}>
          {podeComentar ? 'Nenhuma avaliação ainda. Seja o primeiro!' : 'Nenhuma avaliação ainda. Favorite a trilha para ser o primeiro!'}
        </p>
      )}

      {/* Form area */}
      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 16, paddingTop: 16 }}>
        {!podeComentar ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
              Adicione esta trilha aos favoritos para avaliar
            </p>
            <button
              onClick={handleFavoritar}
              disabled={favoritando}
              style={{
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '6px 14px', fontSize: 12, fontWeight: 500,
                cursor: favoritando ? 'not-allowed' : 'pointer',
                opacity: favoritando ? 0.7 : 1,
              }}
            >
              {favoritando ? 'Favoritando...' : 'Favoritar trilha'}
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '1.5px', color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>
              Sua avaliação
            </p>

            {publishSuccess && (
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                Avaliação publicada!
              </div>
            )}

            <StarSelector value={estrelas} onChange={setEstrelas} />

            <div style={{ marginTop: 10 }}>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                maxLength={150}
                placeholder="Como estava a trilha hoje? Ex: Solo perfeito na descida principal, rock garden ainda úmido na entrada..."
                style={{
                  width: '100%', border: '1px solid #e5e5e5', borderRadius: 4,
                  padding: '10px 12px', fontSize: 13, minHeight: 72,
                  resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  outline: 'none', color: '#111',
                }}
                onFocus={e => (e.target.style.borderColor = '#111')}
                onBlur={e => (e.target.style.borderColor = '#e5e5e5')}
              />
              <div style={{ textAlign: 'right', fontSize: 11, color: texto.length > 130 ? '#ef4444' : '#888', marginTop: 2 }}>
                {texto.length}/150
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#aaa' }}>Você pode editar por 24h após publicar</span>
              <button
                onClick={handlePublish}
                disabled={!canPublish || publishing}
                style={{
                  background: '#FFE000', color: '#111',
                  border: '1.5px solid #111', borderRadius: 4,
                  padding: '8px 18px', fontSize: 13, fontWeight: 500,
                  cursor: canPublish && !publishing ? 'pointer' : 'not-allowed',
                  opacity: canPublish && !publishing ? 1 : 0.5,
                  transition: 'opacity 0.15s',
                }}
              >
                {publishing ? 'Publicando...' : 'Publicar avaliação'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
