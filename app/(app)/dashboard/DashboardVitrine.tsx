'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  IconMapSearch, IconMapPin, IconChevronRight, IconHourglass,
  IconMinus, IconCircleX, IconAlertTriangle, IconCircleCheck,
  type TablerIcon,
} from '@tabler/icons-react'
import { favoritarTrilha } from '@/lib/favoritos'
import { TrilhaComCondicao, VEREDICTO_CONFIG, ESTADOS_BRASIL } from '@/lib/types'
import { selecionarVeredicto, veredictoComAlerta } from '@/lib/veredicto'
import { LogoMantenedor } from '@/components/LogoMantenedor'
import { formatLocalidade } from '@/lib/geocoding'
import FavoritoButton from '@/components/FavoritoButton'

// ── Helpers (espelham TrilhaCard) ─────────────────────────────────────────────

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
    await favoritarTrilha(userId, trilha.id)
    router.refresh()
    setLoading(false)
  }

  // ── Estado sem trilhas na região ──────────────────────────────────────────
  if (!trilha) {
    return (
      <div style={{
        background: '#FFFFFF', borderRadius: 16, border: '1px solid rgba(0,0,0,.07)',
        padding: '32px 24px', textAlign: 'center',
      }}>
        <IconMapSearch size={40} style={{ color: '#9CA3AF', margin: '0 auto 12px', display: 'block' }} />
        <p style={{ fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 20, color: '#1A1D18', margin: '0 0 6px', textTransform: 'uppercase' }}>
          Nenhuma trilha em {nomeEstado} ainda
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#6B7280', margin: '0 0 16px', lineHeight: 1.5 }}>
          Seja o primeiro rider da sua região a cadastrar uma trilha e ajude outros a planejar a pedalada!
        </p>
        <Link href="/trilhas">
          <button style={{
            background: '#1A1D18', color: '#F4F3EF', fontFamily: 'var(--font-barlow-condensed)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
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
  const veredictoBase = selecionarVeredicto(c?.veredicto, c?.veredicto_12h)
  // Mesma fonte usada por CondicaoCard/DashboardTrailCard/TrilhaCard: nunca
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
    <div>
      {/* Label regional */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6d745f' }}>
          {userEstado} · Bem-vindo!
        </span>
        <p style={{
          fontFamily: 'var(--font-barlow-condensed)',
          fontWeight: 800, fontSize: 20, color: '#1A1D18', margin: '2px 0 0', lineHeight: 1.1, textTransform: 'uppercase',
        }}>
          Trilha mais popular da sua região
        </p>
      </div>

      {/* Card */}
      <div style={{
        borderRadius: 16, border: '1px solid rgba(0,0,0,.07)',
        background: '#FFFFFF', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
      }}>
        {/* Barra de acento */}
        <div style={{ height: 4, width: '100%', background: barColor }} />

        {/* Card body */}
        <div style={{ padding: '14px 16px 12px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 20,
                textTransform: 'uppercase', color: '#1A1D18', lineHeight: 1.1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {trilha.name}
              </div>
              <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#6d745f', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
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
            borderTop: '1px solid rgba(0,0,0,.05)',
            background: '#F8F9F5',
            padding: '8px 16px 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#9AA093', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconHourglass size={11} />
              {c.ultima_chuva_h != null ? fmtUltimaChuva(c.ultima_chuva_h) : '—'}
            </div>
            <Link href={`/trilhas/${trilha.id}`} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 11, color: '#6d745f', fontWeight: 500, textDecoration: 'none' }}>
              Ver condição completa →
            </Link>
          </div>
        ) : (
          <div style={{
            borderTop: '1px solid rgba(0,0,0,.05)',
            background: '#F8F9F5',
            padding: '8px 16px 10px',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <Link href={`/trilhas/${trilha.id}`} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 11, color: '#6d745f', fontWeight: 500, textDecoration: 'none' }}>
              Ver condição completa →
            </Link>
          </div>
        )}
      </div>

      {/* CTA abaixo do card */}
      <div style={{
        background: '#FFFFFF', borderRadius: 12, border: '1px solid rgba(0,0,0,.07)',
        padding: '10px 14px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: '#6B7280' }}>
          Mais <strong style={{ color: '#1A1D18' }}>{totalTrilhasRegiao - 1 > 0 ? totalTrilhasRegiao - 1 : totalTrilhasRegiao}</strong> trilhas monitoradas em {userEstado}
        </span>
        <Link href="/trilhas">
          <button style={{
            background: '#1A1D18', color: '#F4F3EF', fontFamily: 'var(--font-barlow-condensed)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
            borderRadius: 8, border: 'none', padding: '6px 12px', fontSize: 12, cursor: 'pointer',
          }}>
            Explorar todas
          </button>
        </Link>
      </div>
    </div>
  )
}
