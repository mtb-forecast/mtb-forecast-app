'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Observacao } from '@/lib/types'
import FavoritoButton from '@/components/FavoritoButton'

type Props = {
  trilhaId: string
  veredictoAtual: string
  isOwner?: boolean
}

const CONDICOES: { value: string; label: string; bg: string; color: string }[] = [
  { value: 'seco',  label: 'Seco',           bg: '#e0f2fe', color: '#0369a1' },
  { value: 'grip',  label: 'Grip Perfeito',  bg: '#dcfce7', color: '#166534' },
  { value: 'boa',   label: 'Boa Aderência',  bg: '#d1fae5', color: '#065f46' },
  { value: 'baixa', label: 'Baixa Aderência', bg: '#fef9c3', color: '#854d0e' },
  { value: 'lama',  label: 'Lama / Barro',   bg: '#fee2e2', color: '#991b1b' },
]

const VEREDICTO_BADGE: Record<string, { bg: string; color: string }> = {
  'DROP LIBERADO': { bg: '#dcfce7', color: '#166534' },
  'DROP LIBERADO - Veja os alertas': { bg: '#fef9c3', color: '#854d0e' },
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

function Avatar({ obs, size = 24 }: { obs: Observacao; size?: number }) {
  const avatarUrl = obs.profiles?.avatar_url
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" style={{
      width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
    }} />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#6d745f', color: '#fff',
      fontSize: 10, fontWeight: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {getInitials(obs)}
    </div>
  )
}

function Stars({ count, size = 13 }: { count: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < count ? '#a8b899' : '#e5e5e5', fontSize: size, lineHeight: 1 }}>★</span>
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
            className="star-selector-star"
            style={{ color: filled ? '#a8b899' : '#e5e5e5', fontSize: 24, cursor: 'pointer', lineHeight: 1, userSelect: 'none' }}
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

export default function TrailObservations({ trilhaId, veredictoAtual, isOwner }: Props) {
  const [observacoes, setObservacoes] = useState<Observacao[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [podeComentar, setPodeComentar] = useState(false)
  const [favoritando, setFavoritando] = useState(false)
  const [limiteMsg, setLimiteMsg] = useState<string | null>(null)

  // New observation form
  const [estrelas, setEstrelas] = useState(0)
  const [texto, setTexto] = useState('')
  const [condicaoEncontrada, setCondicaoEncontrada] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)


  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const obsQuery = supabase
      .from('observacoes_trilha')
      .select(`id, trilha_id, estrelas, texto, condicao_encontrada, veredicto_sistema, created_at, user_id, profiles (apelido, nome, email, avatar_url)`)
      .eq('trilha_id', trilhaId)

    const [{ data: obs }, { data: favorito }] = await Promise.all([
      obsQuery.order('created_at', { ascending: false }).limit(5),
      supabase
        .from('favoritos')
        .select('id')
        .eq('trilha_id', trilhaId)
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    setObservacoes((obs as unknown as Observacao[]) || [])
    setPodeComentar(isOwner || !!favorito)
    setLoading(false)
  }, [trilhaId, isOwner])

  useEffect(() => { load() }, [load])

  async function handleFavoritar() {
    if (!userId || favoritando) return
    setFavoritando(true)
    await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
    setPodeComentar(true)
    setFavoritando(false)
  }

  async function handlePublish() {
    if (!userId || !condicaoEncontrada || estrelas === 0 || !texto.trim() || texto.length > 150) return
    setPublishing(true)
    setPublishError(null)
    const insertPayload = { trilha_id: trilhaId, user_id: userId, estrelas, texto: texto.trim(), condicao_encontrada: condicaoEncontrada, veredicto_sistema: veredictoAtual || null }
    const { data: newObs, error } = await supabase
      .from('observacoes_trilha')
      .insert(insertPayload)
      .select(`id, trilha_id, estrelas, texto, condicao_encontrada, veredicto_sistema, created_at, user_id, profiles (apelido, nome, email, avatar_url)`)
      .single()

    setPublishing(false)
    if (error) {
      console.error('Erro ao publicar avaliação:', error)
      setPublishError(error.message)
      return
    }
    if (newObs) {
      setObservacoes(prev => [newObs as unknown as Observacao, ...prev])
      setEstrelas(0)
      setTexto('')
      setCondicaoEncontrada(null)
      setPublishSuccess(true)
      setTimeout(() => setPublishSuccess(false), 3000)
    }
  }

  const canPublish = !!condicaoEncontrada && estrelas > 0 && texto.trim().length > 0 && texto.length <= 150

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
            <b style={{ color: '#2a2e25' }}>{media}</b>
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
            const vBadge = obs.veredicto_sistema ? (VEREDICTO_BADGE[obs.veredicto_sistema] ?? null) : null

            return (
              <div key={obs.id} style={{ position: 'relative', marginBottom: 12 }}>
                {/* Timeline dot */}
                <div style={{
                  position: 'absolute',
                  left: -14, top: 12,
                  width: 10, height: 10,
                  borderRadius: '50%',
                  background: isRecent ? '#a8b899' : '#e5e5e5',
                  border: `1.5px solid ${isRecent ? '#6d745f' : '#ccc'}`,
                }} />

                {/* Card */}
                <div style={{ background: '#f4f5f0', borderRadius: 6, padding: '10px 12px' }}>

                  {/* Top row: avatar + name + stars */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Link
                      href={`/perfil/${obs.user_id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                    >
                      <Avatar obs={obs} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#2a2e25' }}>{getDisplayName(obs)}</span>
                    </Link>
                    <Stars count={obs.estrelas} />
                  </div>

                  {obs.condicao_encontrada && (() => {
                    const c = CONDICOES.find(x => x.value === obs.condicao_encontrada)
                    return c ? (
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.color, marginBottom: 6 }}>
                        {c.label}
                      </span>
                    ) : null
                  })()}
                  <p style={{ fontSize: 12, color: '#444', lineHeight: 1.5, marginBottom: 6 }}>{obs.texto}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{formatDate(obs.created_at)}</span>
                    {vBadge && obs.veredicto_sistema && (
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 2, background: vBadge.bg, color: vBadge.color }}>
                        {obs.veredicto_sistema}
                      </span>
                    )}
                  </div>
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
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                Adicione esta trilha aos favoritos para avaliar
              </p>
              <FavoritoButton
                isFavorito={false}
                onClick={e => { e.preventDefault(); handleFavoritar() }}
                loading={favoritando}
                size="sm"
              />
            </div>
            {limiteMsg && (
              <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>
                {limiteMsg}{' '}
                <a href="/planos" style={{ color: '#ef4444', fontWeight: 600, textDecoration: 'underline' }}>
                  Faça upgrade
                </a>{' '}
                para monitorar mais trilhas.
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '1.5px', color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>
              Condição da trilha
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {CONDICOES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCondicaoEncontrada(condicaoEncontrada === c.value ? null : c.value)}
                  style={{
                    fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${condicaoEncontrada === c.value ? c.color : '#e5e5e5'}`,
                    background: condicaoEncontrada === c.value ? c.bg : '#fff',
                    color: condicaoEncontrada === c.value ? c.color : '#888',
                    transition: 'all 0.15s',
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '1.5px', color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>
              Sua experiência
            </p>

            {publishSuccess && (
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                Avaliação publicada!
              </div>
            )}

            {publishError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                Erro ao publicar: {publishError}
              </div>
            )}

            <StarSelector value={estrelas} onChange={setEstrelas} />

            <div style={{ marginTop: 10 }}>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                maxLength={150}
                placeholder="Como estava a trilha hoje? Ex: Solo perfeito na descida principal, rock garden ainda úmido na entrada..."
                className="obs-textarea"
                style={{
                  width: '100%', border: '1px solid #e5e5e5', borderRadius: 4,
                  padding: '10px 12px', fontSize: 13, minHeight: 72,
                  resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  outline: 'none', color: '#2a2e25',
                }}
                onFocus={e => (e.target.style.borderColor = '#6d745f')}
                onBlur={e => (e.target.style.borderColor = '#e5e5e5')}
              />
              <div style={{ textAlign: 'right', fontSize: 11, color: texto.length > 130 ? '#ef4444' : '#888', marginTop: 2 }}>
                {texto.length}/150
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                onClick={handlePublish}
                disabled={!canPublish || publishing}
                style={{
                  background: '#6d745f', color: '#fff',
                  border: 'none', borderRadius: 4,
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
