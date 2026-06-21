'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import TrilhaCard from '@/components/TrilhaCard'
import type { Mantenedor, TrilhaComCondicao } from '@/lib/types'

type Props = { mantenedor: Mantenedor; trilhas: TrilhaComCondicao[] }

export default function MantenedorContent({ mantenedor, trilhas }: Props) {
  const router = useRouter()
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set())
  const [userId, setUserId]       = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getClientUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from('favoritos').select('trilha_id').eq('user_id', user.id)
      if (data) setFavoritos(new Set(data.map((f: { trilha_id: string }) => f.trilha_id)))
    }
    init()
  }, [])

  const toggleFavorito = useCallback(async (trilhaId: string) => {
    if (!userId) return
    if (favoritos.has(trilhaId)) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
      setFavoritos(prev => { const s = new Set(prev); s.delete(trilhaId); return s })
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setFavoritos(prev => new Set([...prev, trilhaId]))
    }
  }, [userId, favoritos])

  const primario   = mantenedor.nome_primario ?? mantenedor.nome
  const secundario = mantenedor.nome_secundario

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="hero-dark" style={{ background: '#2a2e25', padding: '32px 0 28px' }}>
        <div className="hero-dark-inner" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', boxSizing: 'border-box' }}>

          <button onClick={() => router.back()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', marginBottom: 20, textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ← Trilhas
          </button>

          {/* Logo à esquerda do nome */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            {mantenedor.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mantenedor.logo_url}
                alt={mantenedor.nome}
                style={{ height: 48, maxWidth: 140, objectFit: 'contain', display: 'block' }}
              />
            )}
            <span style={{ fontSize: 30, fontWeight: 800, color: mantenedor.cor_primaria, letterSpacing: '1.5px', textTransform: 'uppercase', lineHeight: 1 }}>
              {primario}
            </span>
            {secundario && (
              <span style={{ fontSize: 24, fontWeight: 700, color: mantenedor.cor_secundaria ?? mantenedor.cor_primaria, letterSpacing: '0.3px', lineHeight: 1 }}>
                {secundario}
              </span>
            )}
          </div>

          {mantenedor.site_url && (
            <a
              href={mantenedor.site_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6d8a60', textDecoration: 'none', marginBottom: 14 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              {mantenedor.site_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}

          <p style={{ color: '#888', fontSize: 14, margin: 0 }}>
            {trilhas.length} trilha{trilhas.length !== 1 ? 's' : ''} mantida{trilhas.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      {/* ── Trilhas ──────────────────────────────────────────────── */}
      <div className="page-main-content" style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', margin: '0 0 16px' }}>
          Trilhas
        </p>

        {trilhas.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: '48px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>
              Nenhuma trilha associada a este mantenedor.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {trilhas.map(t => (
              <TrilhaCard
                key={t.id}
                trilha={t}
                isFavorito={favoritos.has(t.id)}
                onToggleFavorito={toggleFavorito}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
