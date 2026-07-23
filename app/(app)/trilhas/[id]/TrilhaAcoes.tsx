'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import FavoritoButton from '@/components/FavoritoButton'

type Props = {
  trilhaId: string
  trilhaNome: string
  initialIsFavorito: boolean
  userId: string
}

export default function TrilhaAcoes({ trilhaId, trilhaNome, initialIsFavorito, userId }: Props) {
  const [isFavorito, setIsFavorito] = useState(initialIsFavorito)

  async function toggleFavorito() {
    if (isFavorito) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
      setIsFavorito(false)
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setIsFavorito(true)
    }
  }

  function compartilharWhatsApp() {
    const url = `https://www.mtbforecaster.com.br/t/${trilhaId}`
    const msg = `🚵 Confira as condições da trilha *${trilhaNome}* no MTB Forecaster!\n\nVeja solo, chuva, vento e o melhor horário para pedalar:\n${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <button
        onClick={compartilharWhatsApp}
        style={{
          background: '#25D366', color: '#fff', border: 'none',
          borderRadius: 999, padding: '7px 14px', fontSize: 12,
          fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.5px',
          display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.554 4.118 1.524 5.855L.054 23.454a.75.75 0 00.914.914l5.599-1.47A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.5-5.2-1.373l-.374-.22-3.878 1.018 1.018-3.878-.22-.374A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
        </svg>
        Compartilhar
      </button>
      <FavoritoButton isFavorito={isFavorito} onClick={toggleFavorito} size="md" />
    </div>
  )
}
