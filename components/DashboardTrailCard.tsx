'use client'

import { memo } from 'react'
import Link from 'next/link'
import {
  IconMinus, IconCircleX, IconAlertTriangle, IconCircleCheck,
  IconMapPin, IconChevronRight, IconStarFilled, IconHourglass,
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
  if (!v) return '#d0d4c6'
  const u = v.toUpperCase()
  if (u.includes('EVITAR') || u.includes('FECHADA')) return '#8a1a1a'
  if (u.includes('ESPERAR') || u.includes('AGUARDAR') || u.includes('ALERTA')) return '#8a5e00'
  if (u.includes('LIBERADO')) return '#2a6b1e'
  return '#d0d4c6'
}

type VerdictStyle = { Icon: TablerIcon; bg: string; text: string; border: string }

function verdictStyle(v: string | null): VerdictStyle {
  if (!v) return { Icon: IconMinus, bg: '#eaece4', text: '#6d745f', border: '#d0d4c6' }
  const u = v.toUpperCase()
  if (u.includes('EVITAR') || u.includes('FECHADA')) return { Icon: IconCircleX, bg: '#fcd8d8', text: '#8a1a1a', border: '#e8a0a0' }
  if (u.includes('ESPERAR') || u.includes('AGUARDAR') || u.includes('ALERTA')) return { Icon: IconAlertTriangle, bg: '#fdf0cc', text: '#8a5e00', border: '#e8d080' }
  if (u.includes('LIBERADO')) return { Icon: IconCircleCheck, bg: '#d6edcc', text: '#2a6b1e', border: '#a8d99a' }
  return { Icon: IconMinus, bg: '#eaece4', text: '#6d745f', border: '#d0d4c6' }
}

type SoloBadge = { label: string; bg: string; color: string; border: string }

function soloLabel(a: string | null | undefined): SoloBadge | null {
  if (!a) return null
  const s = a.trim()
  if (s === 'SECO')                  return { label: s, bg: '#fef9c3', color: '#a16207', border: '#fde68a' }
  if (s === 'GRIP PERFEITO')         return { label: s, bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' }
  if (s === 'BOA ADERÊNCIA - ÚMIDO') return { label: s, bg: '#f7fee7', color: '#4d7c0f', border: '#bef264' }
  if (s === 'BAIXA ADERÊNCIA')       return { label: s, bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' }
  return null
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  trilha: TrilhaComCondicao
  avaliacao?: { count: number; media: number }
}

// ── Component ─────────────────────────────────────────────────────────────────

function DashboardTrailCard({ trilha, avaliacao }: Props) {
  const c            = trilha.condicao
  const veredictoText = selecionarVeredicto(c?.veredicto, c?.veredicto_12h)
  const vcfg         = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const hasData      = c != null && vcfg != null
  const has12h       = veredictoText !== null && veredictoText === c?.veredicto_12h?.trim()

  const barColor = topBarColor(veredictoText)
  const vs       = verdictStyle(veredictoText)
  const solo     = soloLabel(c?.aderencia_status)

  const tagBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 999, lineHeight: 1.4,
    border: `0.5px solid ${vs.border}`,
    background: vs.bg, color: vs.text,
    fontWeight: 700,
  }

  return (
    <Link href={`/trilhas/${trilha.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        borderRadius: 14, border: '0.5px solid #d0d4c6',
        background: '#ffffff', overflow: 'hidden',
      }}>

        {/* ── Barra de acento ── */}
        <div style={{ height: 3, width: '100%', background: barColor }} />

        {/* ── Card body ── */}
        <div style={{ padding: '14px 16px 12px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#2a2e25', lineHeight: 1.3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {trilha.name}
              </div>
              <div style={{ fontSize: 11, color: '#6d745f', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                <IconMapPin size={10} />
                {formatLocalidade(trilha.localidades, trilha.regiao)}
              </div>
            </div>
            <IconChevronRight size={14} style={{ color: '#8a9480', flexShrink: 0, marginTop: 1 }} />
          </div>

          {/* Mantenedor */}
          {trilha.mantenedor && (
            <LogoMantenedor mantenedor={trilha.mantenedor} contexto="card" />
          )}

          {/* Verdict row */}
          {hasData && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...tagBase, fontSize: 10 }}>
                <vs.Icon size={10} />
                {veredictoText}
              </span>

              {has12h && (
                <span style={{ ...tagBase, fontSize: 9, fontWeight: 600 }}>12h</span>
              )}

              {solo && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 10, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 999, lineHeight: 1.4,
                  background: solo.bg, color: solo.color, border: `0.5px solid ${solo.border}`,
                }}>
                  {solo.label}
                </span>
              )}

              {avaliacao && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 999, lineHeight: 1.4,
                  background: '#fffbeb', color: '#92400e', border: '0.5px solid #fde68a',
                }}>
                  <IconStarFilled size={10} style={{ color: '#f59e0b' }} />
                  {avaliacao.media}
                  <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({avaliacao.count})</span>
                </span>
              )}
            </div>
          )}

          {!hasData && (
            <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', margin: '8px 0 0' }}>
              Condição ainda não calculada.
            </p>
          )}
        </div>

        {/* ── Card footer ── */}
        {hasData && c && (
          <div style={{
            borderTop: '0.5px solid #d0d4c6',
            background: '#f4f5f0',
            padding: '8px 16px 10px',
            display: 'flex', alignItems: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#8a9480', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconHourglass size={11} />
              {c.ultima_chuva_h != null ? fmtUltimaChuva(c.ultima_chuva_h) : '—'}
            </div>
          </div>
        )}

      </div>
    </Link>
  )
}

export default memo(DashboardTrailCard)
