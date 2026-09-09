'use client'

import { useEffect } from 'react'
import { IconX, IconBulb } from '@tabler/icons-react'
import { SetupDica } from '@/lib/setupDicas'

type Props = {
  dica: SetupDica
  onClose: () => void
}

export default function SetupDicaModal({ dica, onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <>
      <style>{`
        @keyframes sdm-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        }}
      />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 640, margin: '0 auto', zIndex: 2001,
        background: '#fff', borderRadius: '20px 20px 0 0',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.18)',
        animation: 'sdm-slide 0.28s cubic-bezier(.32,.72,0,1)',
      }}>
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: '#D1D5DB' }} />
        </div>

        <div style={{ padding: '8px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconBulb size={18} style={{ color: '#D97706', flexShrink: 0 }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111', letterSpacing: '-0.2px' }}>{dica.titulo}</div>
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

        <div style={{
          padding: '0 20px 24px', overflowY: 'auto',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {dica.itens.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10, fontSize: 14, color: '#1F2937', lineHeight: 1.5,
              background: '#F9FAFB', borderRadius: 10, padding: '10px 12px',
            }}>
              <span style={{ color: '#D97706', fontWeight: 700, flexShrink: 0 }}>•</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
