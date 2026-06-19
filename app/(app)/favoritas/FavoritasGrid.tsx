'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TrilhaCard from '@/components/TrilhaCard'
import type { TrilhaComCondicao } from '@/lib/types'

type Props = {
  initialTrilhas: TrilhaComCondicao[]
  initialFavIds: string[]
  userId: string
}

export default function FavoritasGrid({ initialTrilhas, initialFavIds, userId }: Props) {
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set(initialFavIds))
  const [trilhas, setTrilhas] = useState<TrilhaComCondicao[]>(initialTrilhas)

  // Ref estável para evitar re-renders em todos os cards ao alterar qualquer favorito
  const favoritosRef = useRef(favoritos)
  favoritosRef.current = favoritos

  const toggleFavorito = useCallback(async (trilhaId: string) => {
    if (favoritosRef.current.has(trilhaId)) {
      // Optimistic: remove imediatamente da UI
      setFavoritos(prev => { const s = new Set(prev); s.delete(trilhaId); return s })
      setTrilhas(prev => prev.filter(t => t.id !== trilhaId))
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setFavoritos(prev => new Set([...prev, trilhaId]))
    }
  }, [userId]) // estável — lê favoritos via ref

  if (trilhas.length === 0) {
    return (
      <div style={{
        background: '#fff', borderRadius: 12, border: '0.5px solid #E5E7EB',
        padding: '40px 24px', textAlign: 'center',
      }}>
        <p style={{ fontSize: 14, color: '#9CA3AF', marginBottom: 16 }}>
          Você ainda não tem trilhas favoritas.
        </p>
        <Link href="/trilhas" style={{
          background: '#FFE000', color: '#1A1A1A', fontWeight: 700,
          borderRadius: 999, padding: '8px 20px', fontSize: 13,
          textDecoration: 'none', display: 'inline-block',
        }}>
          Explorar trilhas
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {trilhas.map(t => (
        <TrilhaCard
          key={t.id}
          trilha={t}
          isFavorito={favoritos.has(t.id)}
          onToggleFavorito={toggleFavorito}
        />
      ))}
    </div>
  )
}
