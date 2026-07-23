'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientUser } from '@/lib/supabase'
import DashboardTrailCard from '@/components/DashboardTrailCard'
import FavoritoButton from '@/components/FavoritoButton'
import type { Mantenedor, TrilhaComCondicao } from '@/lib/types'

type Props = { mantenedor: Mantenedor; trilhas: TrilhaComCondicao[] }

const TOPO_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='900' height='500' viewBox='0 0 900 500'>
  <g fill='none' stroke='%236d745f' stroke-opacity='.18' stroke-width='1.3'>
    <path d='M750,80 C820,120 870,200 850,300 C830,400 760,450 670,440 C580,430 520,370 530,280 C540,190 620,100 700,80 C720,74 738,72 750,80 Z'/>
    <path d='M750,40 C840,90 910,190 885,310 C860,430 775,490 670,475 C565,460 490,385 505,275 C520,165 620,60 715,42 C728,39 740,37 750,40 Z'/>
    <path d='M750,115 C800,148 835,215 818,295 C800,375 743,415 668,406 C593,397 548,346 556,276 C564,206 630,138 692,118 C712,112 732,108 750,115 Z'/>
    <path d='M750,150 C782,172 802,228 788,292 C774,355 728,386 668,378 C608,370 574,326 580,272 C586,218 636,170 682,155 C704,148 728,145 750,150 Z'/>
  </g>
</svg>
`.replace(/\s+/g, ' ').trim()

const TOPO_DATA_URI = `url("data:image/svg+xml,${encodeURIComponent(TOPO_SVG)}")`

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
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: '#141612',
        borderBottom: '1px solid rgba(109,116,95,.25)', padding: '32px 28px 28px',
      }}>
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            backgroundImage: TOPO_DATA_URI,
            backgroundSize: 'cover',
            backgroundPosition: 'right center',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto' }}>

          <button onClick={() => router.back()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1px',
            color: 'rgba(154,160,147,.7)', marginBottom: 18,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}>
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
            <span style={{
              fontFamily: 'var(--font-barlow-condensed)', fontSize: 32, fontWeight: 800,
              color: mantenedor.cor_primaria, letterSpacing: '1.5px', textTransform: 'uppercase', lineHeight: 1,
            }}>
              {primario}
            </span>
            {secundario && (
              <span style={{
                fontFamily: 'var(--font-barlow-condensed)', fontSize: 26, fontWeight: 700,
                color: mantenedor.cor_secundaria ?? mantenedor.cor_primaria, letterSpacing: '0.3px', lineHeight: 1,
              }}>
                {secundario}
              </span>
            )}
          </div>

          {mantenedor.site_url && (
            <a
              href={mantenedor.site_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#6d745f',
                textDecoration: 'none', marginBottom: 12,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              {mantenedor.site_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}

          <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', margin: 0 }}>
            {trilhas.length} trilha{trilhas.length !== 1 ? 's' : ''} mantida{trilhas.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Trilhas ──────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1.5px',
          textTransform: 'uppercase', color: '#6d745f', margin: '0 0 12px',
        }}>
          Trilhas
        </p>

        {trilhas.length === 0 ? (
          <div style={{
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 14,
            padding: '48px 32px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
          }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', margin: 0 }}>
              Nenhuma trilha associada a este mantenedor.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trilhas.map(t => (
              <div key={t.id} style={{ position: 'relative' }}>
                <DashboardTrailCard trilha={t} />
                <div style={{ position: 'absolute', top: 10, right: 44, zIndex: 10 }}>
                  <FavoritoButton
                    isFavorito={favoritos.has(t.id)}
                    onClick={() => toggleFavorito(t.id)}
                    size="sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
