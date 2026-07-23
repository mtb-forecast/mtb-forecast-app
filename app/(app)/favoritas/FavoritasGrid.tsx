'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardTrailCard from '@/components/DashboardTrailCard'
import FavoritoButton from '@/components/FavoritoButton'
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
        background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
        padding: '40px 24px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
      }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', marginBottom: 16 }}>
          Você ainda não tem trilhas favoritas.
        </p>
        <Link href="/trilhas" style={{
          background: '#1A1D18', color: '#F4F3EF', fontWeight: 700,
          borderRadius: 999, padding: '8px 20px', fontSize: 13,
          textDecoration: 'none', display: 'inline-block',
        }}>
          Explorar trilhas
        </Link>
      </div>
    )
  }

  return (
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
  )
}
