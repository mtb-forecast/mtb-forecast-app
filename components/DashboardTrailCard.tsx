'use client'

import { memo } from 'react'
import Link from 'next/link'
import { TrilhaComCondicao, VEREDICTO_CONFIG } from '@/lib/types'
import { VEREDICTO_ACCENT, VEREDICTO_JANELA_BG } from '@/lib/display'

function aderenciaBadge(a: string): { bg: string; color: string } {
  if (a === 'GRIP PERFEITO')   return { bg: '#DCFCE7', color: '#15803D' }
  if (a === 'BOA ADERÊNCIA')   return { bg: '#FFF7ED', color: '#C2410C' }
  if (a === 'BAIXA ADERÊNCIA') return { bg: '#FEE2E2', color: '#B91C1C' }
  return { bg: '#FEF9C3', color: '#A16207' }
}

type Props = {
  trilha: TrilhaComCondicao
  avaliacao?: { count: number; media: number }
}

function DashboardTrailCard({ trilha, avaliacao }: Props) {
  const c            = trilha.condicao
  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg         = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const accentColor  = veredictoText ? (VEREDICTO_ACCENT[veredictoText] ?? '#D1D5DB') : '#D1D5DB'
  const janelaBg     = veredictoText ? (VEREDICTO_JANELA_BG[veredictoText] ?? '#F9FAFB') : '#F9FAFB'
  const has12h       = !!c?.veredicto_12h?.trim()

  return (
    <Link href={`/trilhas/${trilha.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          background: '#FFFFFF', borderRadius: 12,
          boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
          display: 'flex', overflow: 'hidden',
          transition: 'box-shadow 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = '0 1px 8px rgba(0,0,0,0.05)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {/* Barra de acento */}
        <div style={{ width: 5, flexShrink: 0, background: accentColor }} />

        {/* Conteúdo */}
        <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Nome */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111', lineHeight: 1.3 }}>
              {trilha.name}
            </span>
            <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#9CA3AF', flexShrink: 0, marginTop: 2 }} />
          </div>

          {vcfg && veredictoText ? (
            <>
              {/* Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{
                  background: accentColor + '22', color: accentColor,
                  borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '3px 10px',
                }}>
                  {vcfg.emoji} {veredictoText}
                  {has12h && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>12h</span>}
                </span>
                {c?.aderencia_status && (() => {
                  const ab = aderenciaBadge(c.aderencia_status.trim())
                  return (
                    <span style={{ background: ab.bg, color: ab.color, borderRadius: 6, fontSize: 12, fontWeight: 600, padding: '3px 10px' }}>
                      {c.aderencia_status}
                    </span>
                  )
                })()}
                {avaliacao && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#92400E', background: '#FFFBEB', borderRadius: 6, padding: '3px 8px' }}>
                    <i className="ti ti-star-filled" style={{ fontSize: 11, color: '#F59E0B' }} />
                    {avaliacao.media}
                    <span style={{ color: '#9CA3AF' }}>({avaliacao.count})</span>
                  </span>
                )}
              </div>

              {/* Janela */}
              {c?.janela && (
                <div style={{ background: janelaBg, borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-clock" style={{ fontSize: 12, color: '#6B7280' }} />
                  <span style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Janela:</span>
                  <span style={{ fontSize: 11, color: '#374151' }}>{c.janela}</span>
                </div>
              )}
            </>
          ) : (
            <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
              Condição ainda não calculada.
            </span>
          )}

        </div>
      </div>
    </Link>
  )
}

export default memo(DashboardTrailCard)
