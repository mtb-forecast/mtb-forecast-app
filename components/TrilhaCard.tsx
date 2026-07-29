import { memo } from 'react'
import Link from 'next/link'
import {
  IconMinus, IconCircleX, IconAlertTriangle, IconCircleCheck,
  IconMapPin, IconChevronRight, IconHourglass, IconBell,
  type TablerIcon,
} from '@tabler/icons-react'
import { TrilhaComCondicao, VEREDICTO_CONFIG } from '@/lib/types'
import { selecionarVeredicto, veredictoComAlerta } from '@/lib/veredicto'
import { formatLocalidade } from '@/lib/geocoding'
import { statusTrilhaLabel } from '@/lib/statusTrilha'
import { LogoMantenedor } from '@/components/LogoMantenedor'
import FavoritoButton from '@/components/FavoritoButton'

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
  isFavorito?: boolean
  onToggleFavorito?: (id: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

function TrilhaCard({ trilha, isFavorito, onToggleFavorito }: Props) {
  const c            = trilha.condicao
  const veredictoBase = selecionarVeredicto(c?.veredicto, c?.veredicto_12h)
  // Mesma fonte usada por CondicaoCard/DashboardTrailCard/DashboardVitrine: nunca
  // mostra "DROP LIBERADO" limpo ao lado de um alerta visível (rajada, vento,
  // chuva, piora futura) que sozinho não bastou pra escalar o risco TOTAL no backend.
  const veredictoText = veredictoComAlerta(veredictoBase, c, trilha.exposicao)
  const vcfg         = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const hasData      = c != null && vcfg != null
  const has12h       = veredictoBase !== null && veredictoBase === c?.veredicto_12h?.trim()

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

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 1 }}>
              {onToggleFavorito && (
                <FavoritoButton
                  isFavorito={!!isFavorito}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFavorito(trilha.id) }}
                  size="sm"
                />
              )}
              <IconChevronRight size={14} style={{ color: '#8a9480' }} />
            </div>
          </div>

          {/* Status da trilha (relato dos riders) */}
          {trilha.status_ativo && trilha.status_ativo.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {trilha.status_ativo.map(s => {
                const st = statusTrilhaLabel(s)
                return st ? (
                  <span key={s} style={{
                    display: 'inline-flex', alignItems: 'center',
                    fontSize: 10, fontWeight: 700,
                    padding: '3px 8px', borderRadius: 999,
                    background: st.bg, color: st.color,
                  }}>
                    {st.label}
                  </span>
                ) : null
              })}
            </div>
          )}

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
            </div>
          )}

          {!hasData && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', margin: '0 0 8px' }}>
                Condição ainda não calculada.
              </p>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#fffbeb', color: '#78350f',
                fontSize: 11, fontWeight: 500,
                padding: '5px 10px', borderRadius: 999,
              }}>
                <IconBell size={12} />
                Favorite para ser avisado quando a condição sair
              </span>
            </div>
          )}
        </div>

        {/* ── Card footer ── */}
        {!hasData && (
          <div style={{
            borderTop: '0.5px solid #d0d4c6',
            background: '#f4f5f0',
            padding: '8px 16px 10px',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <span style={{ fontSize: 11, color: '#6d745f', fontWeight: 500 }}>
              Ver trilha →
            </span>
          </div>
        )}
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

export default memo(TrilhaCard)
