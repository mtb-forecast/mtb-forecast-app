'use client'

import { useEffect, useState } from 'react'
import { IconPlus, IconCheck } from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'

type Props = {
  targetUserId: string
  initialFollowing?: boolean
}

export default function FollowButton({ targetUserId, initialFollowing }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [following, setFollowing] = useState(!!initialFollowing)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(initialFollowing !== undefined)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const user = await getClientUser()
      if (cancelled) return
      if (!user) { setReady(true); return }
      setUserId(user.id)

      if (initialFollowing === undefined) {
        const { data } = await supabase
          .from('seguidores')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId)
          .maybeSingle()
        if (!cancelled) setFollowing(!!data)
      }
      if (!cancelled) setReady(true)
    }
    load()
    return () => { cancelled = true }
  }, [targetUserId, initialFollowing])

  async function handleClick() {
    if (!userId || loading) return
    setLoading(true)
    if (following) {
      setFollowing(false)
      await supabase.from('seguidores').delete()
        .eq('follower_id', userId).eq('following_id', targetUserId)
    } else {
      setFollowing(true)
      await supabase.from('seguidores').insert({ follower_id: userId, following_id: targetUserId })
    }
    setLoading(false)
  }

  if (!ready || userId === targetUserId) return null
  if (ready && !userId) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: following ? '#2a2e25' : '#F4F3EF',
        color: following ? '#c9cdbf' : '#0E0F0D',
        border: 'none', borderRadius: 999,
        padding: '8px 18px',
        fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 14,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {following ? <IconCheck size={15} stroke={2.5} /> : <IconPlus size={15} stroke={2.5} />}
      {following ? 'Seguindo' : 'Seguir'}
    </button>
  )
}
