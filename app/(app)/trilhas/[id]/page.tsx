'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  Trilha, Condicao,
  VEREDICTO_CONFIG, ADERENCIA_CONFIG, ADERENCIA_FRASE,
} from '@/lib/types'

type TrilhaDetalhada = Trilha & { condicoes?: Condicao[] }

// ── helpers de renderização ──────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1,
      color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, marginTop: 10 }} />
}

function parseHorarios(raw: string | null | undefined): string {
  if (!raw) return '—'
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p)) return p.join(', ')
    return String(p)
  } catch {
    return raw
  }
}

function inclinacaoCor(inc: number | null | undefined): string {
  if (inc == null) return '#64748b'
  if (inc > 30) return '#ef4444'
  if (inc > 20) return '#f97316'
  return '#64748b'
}

// ── page ────────────────────────────────────────────────────────────────────

export default function TrilhaDetalhe() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [trilha, setTrilha] = useState<Trilha | null>(null)
  const [c, setC] = useState<Condicao | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorito, setIsFavorito] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const [{ data: td }, { data: fav }] = await Promise.all([
        supabase.from('trilhas').select(`*, condicoes(*)`)
          .eq('id', id)
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
          .single(),
        supabase.from('favoritos').select('id').eq('user_id', user.id).eq('trilha_id', id).maybeSingle(),
      ])

      if (!td) { router.replace('/trilhas'); return }
      const t = td as TrilhaDetalhada
      const conds = Array.isArray(t.condicoes) ? t.condicoes : []
      setTrilha(t)
      setC(conds[0] ?? null)
      setIsFavorito(!!fav)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function toggleFavorito() {
    if (!userId) return
    if (isFavorito) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', id)
      setIsFavorito(false)
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: id })
      setIsFavorito(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f0eb' }}>
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!trilha) return null

  // Derive styling
  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg   = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const acfg   = c?.aderencia_status ? (ADERENCIA_CONFIG[c.aderencia_status] ?? null) : null
  const fraseStyle = ADERENCIA_FRASE[c?.aderencia_status ?? ''] ?? { bg: '#f8fafc', border: '#94a3b8' }
  const bordaCor   = vcfg?.cor ?? '#94a3b8'

  const isQuadrilatero = trilha.solo_type === 'ferro' || trilha.solo_type === 'misto_mg'
  const isMatAtlantica = trilha.bioma === 'Mata Atlântica'
  const mapsUrl = `https://www.google.com/maps?q=${trilha.lat},${trilha.lon}`

  // Alertas
  const alertaRajada = c?.alerta_rajada_kmh != null &&
    ((trilha.exposicao?.toLowerCase() === 'aberta' && c.alerta_rajada_kmh >= 30) ||
     (trilha.exposicao?.toLowerCase() !== 'aberta' && c.alerta_rajada_kmh >= 50))
  const nivelVento = c?.alerta_vento_nivel ?? 0

  // FDS — próximos 3 dias
  const fdsDias = [
    { label: 'D+1', v: c?.fds_d1_veredicto, rain: c?.fds_d1_rain },
    { label: 'D+2', v: c?.fds_d2_veredicto, rain: c?.fds_d2_rain },
    { label: 'D+3', v: c?.fds_d3_veredicto, rain: c?.fds_d3_rain },
  ]
  const hasFds = fdsDias.some(d => d.v)

  // Fontes
  const clay = c?.clay_pct
  const fontes: string[] = []
  if (c?.fonte)   fontes.push(`📡 Previsão: ${c.fonte}`)
  fontes.push(clay != null ? '🌱 Solo: OpenLandMap' : '🌱 Solo: manual (fallback)')
  if (c?.enso_fase || c?.enso_oni != null) {
    const oniStr = c?.enso_oni != null ? ` · fase ${c.enso_fase ?? '—'} (ONI ${c.enso_oni.toFixed(2)})` : ''
    fontes.push(`📈 ENSO: NOAA ONI${oniStr}`)
  }
  if (c?.alerta_vento_kmh) fontes.push('💨 Vento hist.: MERRA-2 / ERA5')

  return (
    <div style={{ background: '#f5f0eb', minHeight: '100vh', padding: '20px 16px 40px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* ── Voltar ── */}
        <Link
          href="/trilhas"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: '#64748b', textDecoration: 'none',
            marginBottom: 16, fontWeight: 600 }}
        >
          ← Voltar para trilhas
        </Link>

        {/* ══ CARD PRINCIPAL ══════════════════════════════════════════════ */}
        <div style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(4px)',
          borderRadius: 12,
          borderTop: '1px solid rgba(0,0,0,0.08)',
          borderRight: '1px solid rgba(0,0,0,0.08)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          borderLeft: `4px solid ${bordaCor}`,
          boxShadow: '0 2px 12px rgba(0,0,0,.10)',
          padding: '16px 18px 14px',
        }}>

          {/* ── HEADER: nome + favoritar ───────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 16, fontWeight: 800, color: '#1e293b',
                fontFamily: "'WheatSmile', serif",
                textDecoration: 'none', display: 'block', lineHeight: 1.3, flex: 1, minWidth: 0 }}
            >
              {trilha.name} 📍
            </a>

            {/* Botão favoritar */}
            <button
              onClick={toggleFavorito}
              style={{ marginLeft: 8, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                border: isFavorito ? '1px solid #eab308' : '1px solid #cbd5e1',
                background: isFavorito ? '#fefce8' : 'transparent',
                color: isFavorito ? '#92400e' : '#64748b',
                fontSize: 16, fontWeight: 700, flexShrink: 0 }}
            >
              {isFavorito ? '★' : '☆'}
            </button>
          </div>

          {/* ── MAPA SATÉLITE ──────────────────────────────────────────── */}
          <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', height: 200 }}>
            <iframe
              src={`https://maps.google.com/maps?q=${trilha.lat},${trilha.lon}&z=15&output=embed&t=k`}
              width="100%"
              height="200"
              style={{ border: 'none', display: 'block' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          {/* ── Subtítulo tipo ─────────────────────────────────────────── */}
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600,
            letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 10 }}>
            {trilha.trail_type === 'bikepark' ? '🏟 Bike Park' : '🏔 Trilha Natural'}
          </div>

          {/* Características físicas */}
          {(() => {
            const parts: string[] = []
            if (trilha.desnivel_m != null && trilha.extensao_km != null) {
              const inc = c?.inclinacao
              const incCor = inclinacaoCor(inc)
              const incPart = inc != null
                ? ` · <span style="color:${incCor};font-weight:700;">${inc}%</span>`
                : ''
              parts.push(`⛰ <b>${trilha.desnivel_m}m</b> em <b>${trilha.extensao_km}km</b>${incPart}`)
            } else if (trilha.desnivel_m != null) {
              parts.push(`⛰ <b>${trilha.desnivel_m}m</b>`)
            }
            if (clay != null && c?.texture_class) {
              parts.push(`🪨 ${c.texture_class} <span style="color:#94a3b8;">(arg ${clay}% · ar ${c.sand_pct ?? '?'}%)</span>`)
            }
            if (parts.length === 0) return null
            return (
              <div
                style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: parts.join(' &nbsp;·&nbsp; ') }}
              />
            )
          })()}

          {/* Badges bioma / quadrilátero */}
          {(isMatAtlantica || isQuadrilatero) && (
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {isQuadrilatero && (
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                  color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b44' }}>
                  ⛏ Quadrilátero Ferrífero
                </span>
              )}
              {isMatAtlantica && (
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                  color: '#166534', background: '#dcfce7', border: '1px solid #86efac' }}>
                  🌿 Mata Atlântica
                </span>
              )}
              {trilha.bioma && !isMatAtlantica && (
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                  color: '#374151', background: '#f3f4f6', border: '1px solid #d1d5db' }}>
                  🌱 {trilha.bioma}
                </span>
              )}
            </div>
          )}

          {/* ── PILLS: aderência + veredicto ───────────────────────────── */}
          {c && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {acfg && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.5, color: acfg.cor,
                  background: acfg.cor + '18', border: `1px solid ${acfg.cor}33` }}>
                  {acfg.emoji} {c.aderencia_status}
                </span>
              )}
              {vcfg && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.5, color: vcfg.cor,
                  background: vcfg.bg, border: `1px solid ${vcfg.cor}33` }}>
                  {vcfg.emoji} {veredictoText}
                </span>
              )}
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>HOJE 12h</span>
            </div>
          )}

          {!c && (
            <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 12 }}>
              Condição ainda não calculada para esta trilha.
            </div>
          )}

          {/* ══ SEÇÃO 1 — Condição do Solo ═══════════════════════════════ */}
          {c && (
            <>
              <Divider />
              <SectionTitle>🌍 Condição do Solo</SectionTitle>

              {/* Frase de secagem */}
              {c.frase_secagem && (
                <div style={{ background: fraseStyle.bg, borderLeft: `3px solid ${fraseStyle.border}`,
                  borderRadius: '0 6px 6px 0', padding: '7px 10px',
                  fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 8 }}>
                  {c.frase_secagem}
                </div>
              )}

              {/* Chuva 48h + solo descansado */}
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.8 }}>
                🕰 Chuva 48h:{' '}
                <strong>{c.acumulo_48h?.toFixed(1) ?? '—'}mm</strong> bruto
                {' · '} efetivo: <strong>{c.acumulo_ef?.toFixed(1) ?? '—'}mm</strong>
                {' · '}
                {c.solo_descansado === true
                  ? <span style={{ color: '#22c55e', fontWeight: 700 }}>solo descansado 🟢</span>
                  : c.solo_descansado === false
                  ? <span style={{ color: '#f97316', fontWeight: 700 }}>solo já úmido 🟠</span>
                  : null}
              </div>

              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.8 }}>
                {c.ultima_chuva_h != null
                  ? <>⏱ Última chuva <strong>{Math.round(c.ultima_chuva_h)}h</strong> atrás</>
                  : '☀️ Sem chuva recente'}
                {' · '}
                ⏳ meia-vida: <strong>{c.meia_vida_h ?? '—'}h</strong>
              </div>
            </>
          )}

          {/* ══ SEÇÃO 2 — Previsão 48h ═══════════════════════════════════ */}
          {c && (
            <>
              <Divider />
              <SectionTitle>🌦 Previsão 48h</SectionTitle>

              {/* 12h */}
              <div style={{ fontSize: 12, color: '#64748b', paddingBottom: 3 }}>
                <strong style={{ color: '#475569' }}>12h</strong>{' '}
                🌧 <strong>{c.rain_12h?.toFixed(1) ?? '—'}mm</strong>{' '}
                ☁️ <strong>{c.pop_12h ?? '—'}%</strong>{' '}
                💨 <strong>{c.wind_12h?.toFixed(1) ?? '—'}m/s</strong>{' '}
                🌡 <strong>{c.temp_max?.toFixed(0) ?? '—'}°C</strong>
              </div>

              {/* 24h */}
              <div style={{ fontSize: 12, color: '#64748b', paddingBottom: 3 }}>
                <strong style={{ color: '#475569' }}>24h</strong>{' '}
                🌧 <strong>{c.rain_mm?.toFixed(1) ?? '—'}mm</strong>{' '}
                ☁️ <strong>{c.pop_48h ?? '—'}%</strong>{' '}
                💨 <strong>{c.wind_ms?.toFixed(1) ?? '—'}m/s</strong>{' '}
                🌡 <strong>{c.temp_max?.toFixed(0) ?? '—'}°C</strong>
              </div>

              {/* Pico 3h */}
              {c.pico_3h != null && c.pico_3h >= 5 && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                  ⚡ Pico de chuva: <strong>{c.pico_3h}mm</strong> em 3h
                </div>
              )}

              {/* Janela */}
              {c.janela && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  🕐 <strong>Melhor janela:</strong> {c.janela}
                </div>
              )}

              {/* Chuva prevista */}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                🌦 <strong>Chuva prevista:</strong> {parseHorarios(c.horarios_chuva)}
              </div>

              {/* Descrição aderência */}
              {c.aderencia_desc && (
                <div style={{ fontSize: 12, color: '#475569', marginTop: 5, fontStyle: 'italic' }}>
                  {c.aderencia_desc}
                </div>
              )}
            </>
          )}

          {/* ══ SEÇÃO 3 — Alertas (condicional) ══════════════════════════ */}
          {c && (alertaRajada || nivelVento > 0) && (
            <>
              <Divider />
              <SectionTitle>⚠️ Alertas</SectionTitle>

              {/* Alerta rajada futura */}
              {alertaRajada && c.alerta_rajada_kmh != null && (
                <div style={{ background: '#fefce8', border: '1px solid #fde047',
                  borderRadius: 8, padding: '8px 12px', fontSize: 12,
                  color: '#713f12', fontWeight: 600, lineHeight: 1.5, marginBottom: 6 }}>
                  🟡 <strong>Rajadas previstas nas próximas 48h</strong><br />
                  <span style={{ fontWeight: 400, color: '#a16207' }}>
                    {trilha.exposicao?.toLowerCase() === 'aberta'
                      ? `Rajadas de até ${c.alerta_rajada_kmh.toFixed(0)} km/h previstas. Trilha exposta — risco de perda de controle em descidas rápidas, saltos e trechos de crista.`
                      : `Rajadas de até ${c.alerta_rajada_kmh.toFixed(0)} km/h previstas. Mesmo em trilha fechada, rajadas acima de 50 km/h podem atingir clareiras e trechos sem dossel.`}
                  </span>
                </div>
              )}

              {/* Alerta vento histórico */}
              {nivelVento > 0 && c.alerta_vento_kmh != null && (() => {
                const cfg3 = {
                  1: { bg: '#fefce8', border: '#fde047', corT: '#713f12', corS: '#a16207', emoji: '🟡',
                    titulo: 'Vento moderado a forte nas últimas 48h',
                    msg: 'Ventos entre 55–65 km/h podem quebrar galhos de árvores com saúde comprometida. Fique atento a galhos soltos na trilha.' },
                  2: { bg: '#fff7ed', border: '#fdba74', corT: '#7c2d12', corS: '#c2410c', emoji: '🟠',
                    titulo: 'Ventos fortes nas últimas 48h',
                    msg: 'Ventos entre 65–90 km/h podem derrubar árvores de médio e grande porte. Avalie as condições no local antes de pedalar.' },
                  3: { bg: '#fef2f2', border: '#fca5a5', corT: '#7f1d1d', corS: '#b91c1c', emoji: '🔴',
                    titulo: 'Risco alto — vento de tempestade nas últimas 48h',
                    msg: 'Ventos acima de 90 km/h com alto potencial de arrancar árvores pela raiz. Avalie presencialmente antes de pedalar — risco severo de obstrução.' },
                }
                const n = Math.min(nivelVento as number, 3) as 1 | 2 | 3
                const a = cfg3[n]
                const rajada = c.alerta_rajada_kmh ? ` · rajada ${c.alerta_rajada_kmh.toFixed(0)} km/h` : ''
                return (
                  <div style={{ background: a.bg, border: `1px solid ${a.border}`,
                    borderRadius: 8, padding: '8px 12px', fontSize: 12,
                    color: a.corT, fontWeight: 600, lineHeight: 1.5 }}>
                    {a.emoji} <strong>{a.titulo}</strong>{' '}
                    ({c.alerta_vento_kmh.toFixed(0)} km/h sustentado{rajada})<br />
                    <span style={{ fontWeight: 400, color: a.corS }}>{a.msg}</span>
                  </div>
                )
              })()}
            </>
          )}

          {/* ══ SEÇÃO 4 — Próximos 3 dias ════════════════════════════════ */}
          {hasFds && (
            <>
              <Divider />
              <SectionTitle>📅 Próximos 3 dias</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {fdsDias.map(({ label, v, rain }) => {
                  const dvcfg = v ? (VEREDICTO_CONFIG[v] ?? null) : null
                  return (
                    <div key={label} style={{
                      background: dvcfg ? dvcfg.bg : '#f8fafc',
                      border: `1px solid ${dvcfg ? dvcfg.cor + '44' : '#e2e8f0'}`,
                      borderRadius: 8, padding: '8px 10px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 16, marginBottom: 2 }}>
                        {dvcfg?.emoji ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: dvcfg?.cor ?? '#94a3b8', marginBottom: 3 }}>
                        {v ?? 'SEM DADOS'}
                      </div>
                      {rain != null && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          🌧 {rain.toFixed(1)}mm
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ══ RODAPÉ — Fontes ══════════════════════════════════════════ */}
          {fontes.length > 0 && (
            <>
              <Divider />
              <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.8 }}>
                {fontes.join(' · ')}
              </div>
            </>
          )}

        </div>
        {/* fim card principal */}

      </div>
    </div>
  )
}
