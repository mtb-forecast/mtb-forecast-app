'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  IconMapSearch, IconMapPin, IconChevronRight, IconHourglass,
  IconMinus, IconCircleX, IconAlertTriangle, IconCircleCheck,
  type TablerIcon,
} from '@tabler/icons-react'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, VEREDICTO_CONFIG, ESTADOS_BRASIL } from '@/lib/types'
import { LogoMantenedor } from '@/components/LogoMantenedor'
import { formatLocalidade } from '@/lib/geocoding'
import FavoritoButton from '@/components/FavoritoButton'

// ── Helpers (espelham TrilhaCard) ─────────────────────────────────────────────

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
  trilha: TrilhaComCondicao | null
  userEstado: string
  userId: string
  totalTrilhasRegiao: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardVitrine({ trilha, userEstado, userId, totalTrilhasRegiao }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const nomeEstado = ESTADOS_BRASIL.find(e => e.value === userEstado)?.label.split(' — ')[1] ?? userEstado

  async function handleFavoritar() {
    if (!trilha || !userId || loading) return
    setLoading(true)
    await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilha.id })
    router.refresh()
    setLoading(false)
  }

  // ── Estado sem trilhas na região ──────────────────────────────────────────
  if (!trilha) {
    return (
      <div style={{
        background: '#fff', borderRadius: 12, border: '0.5px solid #E5E7EB',
        padding: '32px 24px', textAlign: 'center',
      }}>
        <IconMapSearch size={40} style={{ color: '#9CA3AF', margin: '0 auto 12px', display: 'block' }} />
        <p style={{ fontFamily: 'var(--font-barlow-condensed, "Barlow Condensed", sans-serif)', fontWeight: 800, fontSize: 20, color: '#2a2e25', margin: '0 0 6px' }}>
          Nenhuma trilha em {nomeEstado} ainda
        </p>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 16px', lineHeight: 1.5 }}>
          Seja o primeiro rider da sua região a cadastrar uma trilha e ajude outros a planejar a pedalada!
        </p>
        <Link href="/trilhas">
          <button style={{
            background: '#FFE000', color: '#1A1A1A', fontWeight: 600,
            borderRadius: 8, border: 'none', padding: '8px 20px', fontSize: 13, cursor: 'pointer',
          }}>
            + Cadastrar trilha
          </button>
        </Link>
      </div>
    )
  }

  // ── Card vitrine ──────────────────────────────────────────────────────────
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
    <div>
      {/* Label regional */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6d745f', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {userEstado} · Bem-vindo!
        </span>
        <p style={{
          fontFamily: 'var(--font-barlow-condensed, "Barlow Condensed", sans-serif)',
          fontWeight: 800, fontSize: 20, color: '#2a2e25', margin: '2px 0 0', lineHeight: 1.1,
        }}>
          Trilha mais popular da sua região
        </p>
      </div>

      {/* Card */}
      <div style={{
        borderRadius: 14, border: '0.5px solid #d0d4c6',
        background: '#ffffff', overflow: 'hidden',
      }}>
        {/* Barra de acento */}
        <div style={{ height: 3, width: '100%', background: barColor }} />

        {/* Card body */}
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

            <FavoritoButton
              isFavorito={false}
              onClick={handleFavoritar}
              loading={loading}
              size="sm"
            />
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

              {/* Tag solo % */}
              {c?.aderencia_score != null && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 10, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 999, lineHeight: 1.4,
                  background: '#F3F4F6', color: '#6B7280', border: '0.5px solid #E5E7EB',
                }}>
                  Solo {Math.round(c.aderencia_score)}%
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

        {/* Card footer */}
        {hasData && c ? (
          <div style={{
            borderTop: '0.5px solid #d0d4c6',
            background: '#f4f5f0',
            padding: '8px 16px 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#8a9480', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconHourglass size={11} />
              {c.ultima_chuva_h != null ? fmtUltimaChuva(c.ultima_chuva_h) : '—'}
            </div>
            <Link href={`/trilhas/${trilha.id}`} style={{ fontSize: 11, color: '#6d745f', fontWeight: 500, textDecoration: 'none' }}>
              Ver condição completa →
            </Link>
          </div>
        ) : (
          <div style={{
            borderTop: '0.5px solid #d0d4c6',
            background: '#f4f5f0',
            padding: '8px 16px 10px',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <Link href={`/trilhas/${trilha.id}`} style={{ fontSize: 11, color: '#6d745f', fontWeight: 500, textDecoration: 'none' }}>
              Ver condição completa →
            </Link>
          </div>
        )}
      </div>

      {/* CTA abaixo do card */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '0.5px solid #E5E7EB',
        padding: '10px 14px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginTop: 8,
      }}>
        <span style={{ fontSize: 12, color: '#6B7280' }}>
          Mais <strong style={{ color: '#2a2e25' }}>{totalTrilhasRegiao - 1 > 0 ? totalTrilhasRegiao - 1 : totalTrilhasRegiao}</strong> trilhas monitoradas em {userEstado}
        </span>
        <Link href="/trilhas">
          <button style={{
            background: '#FFE000', color: '#1A1A1A', fontWeight: 600,
            borderRadius: 8, border: 'none', padding: '6px 12px', fontSize: 12, cursor: 'pointer',
          }}>
            Explorar todas
          </button>
        </Link>
      </div>
    </div>
  )
}
