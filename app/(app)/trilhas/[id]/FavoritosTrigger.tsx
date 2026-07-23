'use client'

import { useState } from 'react'
import { IconUsers, IconChevronRight } from '@tabler/icons-react'
import FavoritosModal from '@/components/FavoritosModal'

type Props = {
  trilhaId: string
  trilhaNome: string
  count: number
}

export default function FavoritosTrigger({ trilhaId, trilhaNome, count }: Props) {
  const [open, setOpen] = useState(false)

  if (!count) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 12, color: '#9a9d94', background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <IconUsers size={13} stroke={2} color="#9a9d94" />
        <span style={{ color: '#c9cdbf', fontWeight: 500 }}>{count}</span> favoritados
        <IconChevronRight size={13} stroke={2} color="#9a9d94" />
      </button>

      {open && (
        <FavoritosModal
          trilhaId={trilhaId}
          trilhaNome={trilhaNome}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
