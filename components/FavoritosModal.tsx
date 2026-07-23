'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconX } from '@tabler/icons-react'
import { supabase } from '@/lib/supabase'
import FollowButton from '@/components/FollowButton'

type Row = {
  id: string
  user_id: string
  profiles: { id: string; apelido: string | null; nome: string | null; avatar_url: string | null } | null
}

type Props = {
  trilhaId: string
  trilhaNome: string
  onClose: () => void
}

export default function FavoritosModal({ trilhaId, trilhaNome, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: favoritos } = await supabase
        .from('favoritos')
        .select('id, user_id')
        .eq('trilha_id', trilhaId)

      const userIds = Array.from(new Set((favoritos ?? []).map(f => f.user_id)))

      const { data: profilesData } = userIds.length > 0
        ? await supabase.from('profiles').select('id, apelido, nome, avatar_url').in('id', userIds)
        : { data: [] as Row['profiles'][] }

      const profileById = new Map((profilesData ?? []).map(p => [p!.id, p]))

      if (!cancelled) {
        setRows((favoritos ?? []).map(f => ({
          id: f.id,
          user_id: f.user_id,
          profiles: profileById.get(f.user_id) ?? null,
        })))
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [trilhaId])

  return (
    <>
      <style>{`
        @keyframes fm-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes fm-spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2001,
        maxWidth: 480, margin: '0 auto',
        background: '#fff', borderRadius: '20px 20px 0 0',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.18)',
        animation: 'fm-slide 0.28s cubic-bezier(.32,.72,0,1)',
      }}>
        {/* Handle */}
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: '#D1D5DB' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111', letterSpacing: '-0.3px' }}>
              Favoritados
            </div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{trilhaNome}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#F3F4F6', border: 'none', borderRadius: '50%',
              width: 34, height: 34, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#6B7280', flexShrink: 0,
            }}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
              <div style={{
                width: 26, height: 26,
                border: '2.5px solid #E5E7EB', borderTopColor: '#6d745f',
                borderRadius: '50%', animation: 'fm-spin 0.8s linear infinite',
              }} />
            </div>
          )}

          {!loading && rows.length === 0 && (
            <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '32px 0' }}>
              Ninguém favoritou essa trilha ainda.
            </p>
          )}

          {!loading && rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
              {rows.map(row => {
                const p = row.profiles
                const displayName = p?.apelido || p?.nome || 'Rider'
                const initials = displayName[0]?.toUpperCase() ?? '?'
                return (
                  <div key={row.id} style={{
                    background: '#F8F9F5', borderRadius: 12, padding: '10px 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}>
                    <Link
                      href={`/perfil/${row.user_id}`}
                      onClick={onClose}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', minWidth: 0 }}
                    >
                      {p?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt="" style={{
                          width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                        }} />
                      ) : (
                        <span style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: '#eef1e9', color: '#6d745f',
                          fontSize: 13, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {initials}
                        </span>
                      )}
                      <span style={{
                        fontSize: 14, fontWeight: 600, color: '#1A1D18',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {displayName}
                      </span>
                    </Link>
                    {p?.id && <FollowButton targetUserId={p.id} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
