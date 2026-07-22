'use client'

import { memo, useMemo } from 'react'
import Link from 'next/link'
import {
  IconMinus, IconCircleX, IconAlertTriangle, IconCircleCheck,
  IconMapPin, IconStarFilled,
  type TablerIcon,
} from '@tabler/icons-react'
import { TrilhaComCondicao, VEREDICTO_CONFIG } from '@/lib/types'
import { selecionarVeredicto } from '@/lib/veredicto'
import { formatLocalidade } from '@/lib/geocoding'
import { LogoMantenedor } from '@/components/LogoMantenedor'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUltimaChuva(h: number): string {
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.floor(h / 24)}d`
}

function topBarColor(v: string | null): string {
  if (!v) return '#e5e7eb'
  const u = v.toUpperCase()
  if (u.includes('EVITAR') || u.includes('FECHADA')) return '#EF4444'
  if (u.includes('ESPERAR') || u.includes('AGUARDAR') || u.includes('ALERTA')) return '#F59E0B'
  if (u.includes('LIBERADO')) return '#22C55E'
  return '#e5e7eb'
}

type ChipStyle = { bg: string; textColor: string }

function chipStyle(v: string | null): ChipStyle {
  if (!v) return { bg: '#e5e7eb', textColor: '#6B7280' }
  const u = v.toUpperCase()
  if (u.includes('EVITAR') || u.includes('FECHADA')) return { bg: '#EF4444', textColor: '#FFFFFF' }
  if (u.includes('ESPERAR') || u.includes('AGUARDAR') || u.includes('ALERTA')) return { bg: '#F59E0B', textColor: '#0E0F0D' }
  if (u.includes('LIBERADO')) return { bg: '#22C55E', textColor: '#0E0F0D' }
  return { bg: '#e5e7eb', textColor: '#6B7280' }
}

function chipIcon(v: string | null): TablerIcon {
  if (!v) return IconMinus
  const u = v.toUpperCase()
  if (u.includes('EVITAR') || u.includes('FECHADA')) return IconCircleX
  if (u.includes('ESPERAR') || u.includes('AGUARDAR') || u.includes('ALERTA')) return IconAlertTriangle
  if (u.includes('LIBERADO')) return IconCircleCheck
  return IconMinus
}

function soloText(a: string | null | undefined): string {
  if (!a) return '—'
  const s = a.trim()
  if (s === 'GRIP PERFEITO') return 'Grip perfeito'
  if (s === 'SECO') return 'Seco'
  if (s === 'BOA ADERÊNCIA - ÚMIDO') return 'Úmido'
  if (s === 'BAIXA ADERÊNCIA') return 'Baixo grip'
  return s
}

function soloFontSize(a: string | null | undefined): number {
  const s = a?.trim()
  if (s === 'GRIP PERFEITO' || s === 'BOA ADERÊNCIA - ÚMIDO' || s === 'BAIXA ADERÊNCIA') return 15
  return 20
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  trilha: TrilhaComCondicao
  avaliacao?: { count: number; media: number }
}

// ── Component ─────────────────────────────────────────────────────────────────

function DashboardTrailCard({ trilha, avaliacao }: Props) {
  const c             = trilha.condicao
  const veredictoText = selecionarVeredicto(c?.veredicto, c?.veredicto_12h)
  const vcfg          = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const hasData       = c != null && vcfg != null
  const has12h        = veredictoText !== null && veredictoText === c?.veredicto_12h?.trim()

  const barColor = topBarColor(veredictoText)
  const cs       = chipStyle(veredictoText)
  const ChipIcon = chipIcon(veredictoText)

  const barData = useMemo(() => {
    if (!c?.previsao_24h?.length) return null
    const blocos = c.previsao_24h.slice(0, 8)
    const maxRain = Math.max(...blocos.map(b => b.rain_mm), 0.1)
    return blocos.map(b => ({
      label: b.label.split(/[→-]/)[0],
      height: Math.max(8, Math.round((b.rain_mm / maxRain) * 100)),
      isRain: b.rain_mm > 0.1,
    }))
  }, [c?.previsao_24h])

  const tags = [trilha.trail_type, trilha.bioma].filter(Boolean).slice(0, 2) as string[]

  return (
    <Link href={`/trilhas/${trilha.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        style={{
          background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
          overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
          transition: 'transform .18s ease, box-shadow .18s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.10)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,.05)'
        }}
      >
        {/* ── Barra de acento ── */}
        <div style={{ height: 4, width: '100%', background: barColor }} />

        {/* ── Head ── */}
        <div style={{
          padding: '11px 15px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, borderBottom: '1px solid rgba(0,0,0,.05)',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 12,
            textTransform: 'uppercase', letterSpacing: '.5px',
            padding: '3px 9px', borderRadius: 6, background: cs.bg, color: cs.textColor,
          }}>
            <ChipIcon size={10} stroke={2.5} color={cs.textColor} />
            {veredictoText ?? 'Sem dados'}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {has12h && (
              <span style={{
                fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#9AA093',
                border: '1px solid rgba(0,0,0,.1)', borderRadius: 3, padding: '2px 6px',
              }}>
                12h
              </span>
            )}
            {avaliacao && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '3px 8px', borderRadius: 999,
                background: '#fffbeb', color: '#92400e', border: '.5px solid #fde68a',
              }}>
                <IconStarFilled size={10} color="#f59e0b" />
                {avaliacao.media}
                <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({avaliacao.count})</span>
              </span>
            )}
          </div>
        </div>

        {/* ── Info ── */}
        <div style={{ padding: '13px 15px 0' }}>
          <div style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 21,
            textTransform: 'uppercase', letterSpacing: '.3px', lineHeight: 1.05, color: '#1A1D18',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {trilha.name}
          </div>
          <div style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#6d745f', marginTop: 3,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <IconMapPin size={9} stroke={2} color="#6d745f" />
            {formatLocalidade(trilha.localidades, trilha.regiao)}
          </div>
        </div>

        {/* ── Mantenedor ── */}
        {trilha.mantenedor && (
          <LogoMantenedor mantenedor={trilha.mantenedor} contexto="card" />
        )}

        {/* ── Tags ── */}
        {tags.length > 0 && (
          <div style={{ padding: '8px 15px 0', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {tags.map(tag => (
              <span key={tag} style={{
                fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#9AA093',
                background: '#F5F6F2', border: '1px solid rgba(0,0,0,.07)',
                borderRadius: 999, padding: '2px 8px',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Data blocks ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, padding: '10px 15px 0' }}>
          <div style={{ background: '#F8F9F5', border: '1px solid rgba(0,0,0,.06)', borderRadius: 9, padding: '9px 11px' }}>
            <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, letterSpacing: '.5px', textTransform: 'uppercase', color: '#9AA093', margin: 0 }}>
              Solo
            </p>
            <p style={{
              fontFamily: 'var(--font-dm-mono)', fontWeight: 500, lineHeight: 1.1, color: '#1A1D18',
              marginTop: 4, marginBottom: 0, fontSize: soloFontSize(c?.aderencia_status),
            }}>
              {soloText(c?.aderencia_status)}
            </p>
          </div>
          <div style={{ background: '#F8F9F5', border: '1px solid rgba(0,0,0,.06)', borderRadius: 9, padding: '9px 11px' }}>
            <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, letterSpacing: '.5px', textTransform: 'uppercase', color: '#9AA093', margin: 0 }}>
              Última chuva
            </p>
            <p style={{
              fontFamily: 'var(--font-dm-mono)', fontWeight: 500, lineHeight: 1.1, color: '#1A1D18',
              marginTop: 4, marginBottom: 0, fontSize: 20,
            }}>
              {c?.ultima_chuva_h != null ? fmtUltimaChuva(c.ultima_chuva_h) : '—'}
            </p>
          </div>
        </div>

        {/* ── Gráfico ── */}
        {barData && (
          <div style={{ padding: '9px 15px 12px' }}>
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 36 }}>
              {barData.map((b, i) => (
                <div key={i} style={{
                  flex: 1, height: `${b.height}%`, borderRadius: '3px 3px 0 0',
                  background: b.isRain ? 'rgba(88,120,200,.75)' : 'rgba(109,116,95,.3)',
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {barData.map((b, i) => (
                <span key={i} style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: 'rgba(155,161,150,.5)' }}>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {!barData && <div style={{ height: 12 }} />}
      </div>
    </Link>
  )
}

export default memo(DashboardTrailCard)
