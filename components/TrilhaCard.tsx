import { memo } from 'react'
import Link from 'next/link'
import { TrilhaComCondicao, VEREDICTO_CONFIG } from '@/lib/types'
import { formatLocalidade } from '@/lib/geocoding'
import { LogoMantenedor } from '@/components/LogoMantenedor'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUltimaChuva(h: number): string {
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.floor(h / 24)}d`
}

function topBarColor(v: string | null): string {
  if (!v) return '#d0d4c6'
  if (v.includes('LIBERADO')) return '#2a6b1e'
  if (v.includes('ESPERAR') || v.includes('AGUARDAR') || v.includes('ALERTA')) return '#8a5e00'
  if (v.includes('EVITAR') || v.includes('FECHADA')) return '#8a1a1a'
  return '#d0d4c6'
}

type VerdictStyle = { icon: string; bg: string; text: string; border: string }

function verdictStyle(v: string | null): VerdictStyle {
  if (!v) return { icon: 'ti-minus', bg: '#eaece4', text: '#6d745f', border: '#d0d4c6' }
  if (v.includes('LIBERADO')) return { icon: 'ti-circle-check', bg: '#d6edcc', text: '#2a6b1e', border: '#a8d99a' }
  if (v.includes('ESPERAR') || v.includes('AGUARDAR') || v.includes('ALERTA')) return { icon: 'ti-alert-triangle', bg: '#fdf0cc', text: '#8a5e00', border: '#e8d080' }
  if (v.includes('EVITAR') || v.includes('FECHADA')) return { icon: 'ti-circle-x', bg: '#fcd8d8', text: '#8a1a1a', border: '#e8a0a0' }
  return { icon: 'ti-minus', bg: '#eaece4', text: '#6d745f', border: '#d0d4c6' }
}

function soloLabel(a: string | null | undefined): string | null {
  if (!a) return null
  const s = a.trim()
  if (s === 'SECO' || s === 'GRIP PERFEITO') return 'SECO'
  if (s === 'BOA ADERÊNCIA') return 'ÚMIDO'
  if (s === 'BAIXA ADERÊNCIA') return 'SATURADO'
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
  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg         = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const hasData      = c != null && vcfg != null
  const has12h       = !!c?.veredicto_12h?.trim()

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
                <i className="ti ti-map-pin" style={{ fontSize: 10 }} />
                {formatLocalidade(trilha.localidades, trilha.regiao)}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 1 }}>
              {onToggleFavorito && (
                <button
                  onClick={e => { e.preventDefault(); onToggleFavorito(trilha.id) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 16, lineHeight: 1, padding: 0,
                    color: isFavorito ? '#a8b899' : '#d0d4c6',
                    transition: 'color 0.15s',
                  }}
                >
                  {isFavorito ? '★' : '☆'}
                </button>
              )}
              <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#8a9480' }} />
            </div>
          </div>

          {/* Mantenedor */}
          {trilha.mantenedor && (
            <LogoMantenedor mantenedor={trilha.mantenedor} contexto="card" />
          )}

          {/* Verdict row */}
          {hasData && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...tagBase, fontSize: 10 }}>
                <i className={`ti ${vs.icon}`} style={{ fontSize: 10 }} />
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
                  background: '#eaece4', color: '#6d745f', border: '0.5px solid #d0d4c6',
                }}>
                  {solo}
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#8a9480', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-clock" style={{ fontSize: 11 }} />
              {c.janela ? `JANELA: ${c.janela}` : '—'}
            </div>

            <div style={{ width: 1, height: 12, background: '#d0d4c6', flexShrink: 0 }} />

            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#8a9480', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-hourglass" style={{ fontSize: 11 }} />
              {c.ultima_chuva_h != null ? fmtUltimaChuva(c.ultima_chuva_h) : '—'}
            </div>
          </div>
        )}

      </div>
    </Link>
  )
}

export default memo(TrilhaCard)
