'use client'

import { useRouter, usePathname } from 'next/navigation'

// Páginas raiz do BottomNav — sem botão voltar
const TAB_ROOTS = ['/dashboard', '/trilhas', '/mapa', '/perfil']

export default function BackButton() {
  const router = useRouter()
  const pathname = usePathname()

  if (!pathname) return null
  if (TAB_ROOTS.includes(pathname)) return null

  return (
    <button
      onClick={() => router.back()}
      aria-label="Voltar"
      style={{
        position: 'fixed',
        top: 64,
        left: 16,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#1A1A1A',
        color: '#fff',
        border: '1px solid #333',
        borderRadius: 20,
        padding: '6px 14px 6px 10px',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        letterSpacing: '0.01em',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
      Voltar
    </button>
  )
}
