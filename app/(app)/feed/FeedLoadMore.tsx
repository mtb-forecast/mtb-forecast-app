'use client'

import { useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import FeedEventCard from '@/components/FeedEventCard'
import type { FeedItem } from '@/lib/types'

type DaySection = { daysAgo: number; label: string; items: FeedItem[] }

export default function FeedLoadMore({ viewerId }: { viewerId: string }) {
  const [sections, setSections] = useState<DaySection[]>([])
  const [nextDaysAgo, setNextDaysAgo] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function handleLoadMore() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/feed?daysAgo=${nextDaysAgo}`)
      if (!res.ok) throw new Error('Falha ao carregar')
      const data: { items: FeedItem[]; dateLabel: string } = await res.json()
      setSections(prev => [...prev, { daysAgo: nextDaysAgo, label: data.dateLabel, items: data.items }])
      setNextDaysAgo(prev => prev + 1)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {sections.map(section => (
        <div key={section.daysAgo} style={{ marginBottom: 20 }}>
          <span style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1.5px',
            textTransform: 'uppercase', color: '#9AA093', display: 'block', marginBottom: 10,
          }}>
            {section.label}
          </span>

          {section.items.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9AA093' }}>Nenhuma atividade nesse dia.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {section.items.map(item => (
                <FeedEventCard key={`${item.kind}-${item.id}`} item={item} viewerId={viewerId} />
              ))}
            </div>
          )}
        </div>
      ))}

      {error && (
        <p style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', marginBottom: 10 }}>
          Erro ao carregar. Tente novamente.
        </p>
      )}

      <button
        onClick={handleLoadMore}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', margin: '4px 0 0',
          background: '#fff', color: '#1A1D18',
          border: '1px solid rgba(0,0,0,.1)', borderRadius: 999,
          padding: '11px 24px', fontSize: 13, fontWeight: 700,
          fontFamily: 'var(--font-barlow-condensed)', textTransform: 'uppercase', letterSpacing: '.5px',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        }}
      >
        {loading && (
          <IconLoader2 size={14} style={{ animation: 'flm-spin 0.8s linear infinite' }} />
        )}
        {loading ? 'Carregando…' : 'Carregar mais'}
      </button>
      <style>{`@keyframes flm-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
