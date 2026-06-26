'use client'

import { IconStar, IconStarFilled } from '@tabler/icons-react'

type Props = {
  isFavorito: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  loading?: boolean
  size?: 'sm' | 'md'
}

export default function FavoritoButton({ isFavorito, onClick, loading, size = 'sm' }: Props) {
  const sm = size === 'sm'
  const iconSize = sm ? 12 : 14
  const fontSize = sm ? 11 : 13
  const padding = sm ? '5px 10px' : '6px 14px'

  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: sm ? 4 : 5,
        background: isFavorito ? '#FFE000' : '#ffffff',
        border: `1.5px solid #FFE000`,
        borderRadius: 999,
        padding,
        fontSize,
        fontWeight: 700,
        color: '#1A1A1A',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        transition: 'opacity 0.15s, background 0.15s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {isFavorito
        ? <IconStarFilled size={iconSize} style={{ color: '#1A1A1A' }} />
        : <IconStar size={iconSize} style={{ color: '#1A1A1A' }} />
      }
      {loading ? 'Salvando…' : isFavorito ? 'Favoritado' : 'Favoritar'}
    </button>
  )
}
