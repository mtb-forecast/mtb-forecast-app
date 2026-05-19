'use client'

import { Barlow_Condensed } from 'next/font/google'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import {
  Trilha, Condicao,
  VEREDICTO_CONFIG,
} from '@/lib/types'
import { formatLocalidade } from '@/lib/geocoding'
import ElevationProfile from '@/components/ElevationProfile'
import TrailObservations from '@/components/TrailObservations'
import CondicaoCard from '@/components/CondicaoCard'

const StravaMap = dynamic(() => import('@/components/StravaMap'), { ssr: false })

type TrilhaDetalhada = Trilha & { condicoes?: Condicao[] }

const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'] })

// ── helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </p>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function TrilhaDetalhe() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [trilha, setTrilha] = useState<Trilha | null>(null)
  const [c, setC] = useState<Condicao | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorito, setIsFavorito] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [plano, setPlano] = useState<string | null>(null)
  const [limiteMsg, setLimiteMsg] = useState(false)

  const [isTrilhaPessoal, setIsTrilhaPessoal] = useState(false)
  const [polyline, setPolyline] = useState<string | null>(null)
  const [elevationProfileUrl, setElevationProfileUrl] = useState<string | null>(null)
  const [stravaUrl, setStravaUrl] = useState<string | null>(null)
  const [stravaSegmentId, setStravaSegmentId] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const [{ data: td }, { data: fav }, { data: profile }] = await Promise.all([
        supabase.from('trilhas').select(`*, condicoes(*), localidades(cidade, estado, localidade)`)
          .eq('id', id)
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
          .maybeSingle(),
        supabase.from('favoritos').select('id').eq('user_id', user.id).eq('trilha_id', id).maybeSingle(),
        supabase.from('profiles').select('plano').eq('id', user.id).single(),
      ])
      setPlano(profile?.plano ?? null)

      if (td) {
        const t = td as TrilhaDetalhada
        const conds = Array.isArray(t.condicoes) ? t.condicoes : []
        setTrilha(t)
        setC(conds[0] ?? null)
        setIsFavorito(!!fav)
        setLoading(false)
        return
      }

      const { data: pt } = await supabase
        .from('trilhas_pessoais')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!pt) { router.replace('/trilhas'); return }

      const { data: condicaoStrava } = await supabase
        .from('condicoes_strava')
        .select('*')
        .eq('strava_segment_id', pt.strava_segment_id)
        .order('gerado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      setTrilha({
        id: pt.id,
        name: pt.name,
        lat: pt.lat,
        lon: pt.lon,
        solo_type: pt.solo_type,
        exposicao: pt.exposicao,
        altitude_m: pt.altitude_m ?? 0,
        trail_type: pt.trail_type,
        desnivel_m: pt.desnivel_m ?? undefined,
        extensao_km: pt.extensao_km ?? undefined,
        regiao: pt.regiao,
        bioma: pt.bioma ?? undefined,
      })
      setC(condicaoStrava as Condicao ?? null)
      setIsTrilhaPessoal(true)
      setPolyline(pt.polyline ?? null)
      setElevationProfileUrl(pt.strava_elevation_profile ?? null)
      setStravaUrl(pt.strava_url ?? null)
      setStravaSegmentId(pt.strava_segment_id ?? null)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function toggleFavorito() {
    if (!userId || isTrilhaPessoal) return
    if (isFavorito) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', id)
      setIsFavorito(false)
    } else {
      const isGratuito = !plano || plano === 'gratuito'
      if (isGratuito) {
        const { count } = await supabase
          .from('favoritos')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
        if ((count ?? 0) >= 5) {
          setLimiteMsg(true)
          setTimeout(() => setLimiteMsg(false), 6000)
          return
        }
      }
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: id })
      setIsFavorito(true)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!trilha) return null

  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg   = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const borderCor = isTrilhaPessoal ? '#FC4C02' : (vcfg?.cor ?? '#e5e5e5')

  const isQuadrilatero = trilha.solo_type === 'ferro' || trilha.solo_type === 'misto_mg'
  const isMatAtlantica = trilha.bioma === 'Mata Atlântica'
  const mapsUrl = `https://www.google.com/maps?q=${trilha.lat},${trilha.lon}`

  const alertaRajada = c?.alerta_rajada_kmh != null &&
    ((trilha.exposicao?.toLowerCase() === 'aberta' && c.alerta_rajada_kmh >= 30) ||
     (trilha.exposicao?.toLowerCase() !== 'aberta' && c.alerta_rajada_kmh >= 50))
  const nivelVento = c?.alerta_vento_nivel ?? 0

  function compartilharWhatsApp() {
    if (!trilha) return
    const url = `https://www.mtbforecaster.com.br/t/${trilha.id}`
    const mensagem = `🚵 Confira as condições da trilha *${trilha.name}* no MTB Forecaster!\n\nVeja solo, chuva, vento e o melhor horário para pedalar:\n${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, '_blank')
  }

  const clay = c?.clay_pct
  const fontes: string[] = []
  if (c?.fonte) fontes.push(`📡 Previsão: ${c.fonte}`)
  fontes.push(clay != null ? '🌱 Solo: OpenLandMap' : '🌱 Solo: manual (fallback)')
  if (c?.enso_fase || c?.enso_oni != null) {
    const oniStr = c?.enso_oni != null ? ` · fase ${c.enso_fase ?? '—'} (ONI ${c.enso_oni.toFixed(2)})` : ''
    fontes.push(`📈 ENSO: NOAA ONI${oniStr}`)
  }
  if (c?.alerta_vento_kmh) fontes.push('💨 Vento hist.: MERRA-2 / ERA5')

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header grafite ─────────────────────────────────────────── */}
      <div className="page-header" style={{ background: '#1A1A1A', padding: '40px 32px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          {/* Voltar */}
          <Link
            href="/trilhas"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', marginBottom: 20, textDecoration: 'none' }}
          >
            ← Voltar para trilhas
          </Link>

          {/* Nome + ações */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h1 style={{
              fontFamily: barlow.style.fontFamily,
              fontSize: 36, fontWeight: 800,
              textTransform: 'uppercase',
              color: '#FFFFFF', lineHeight: 1.1, flex: 1, margin: 0,
            }}>
              {trilha.name}
            </h1>
            <div className="trilha-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={compartilharWhatsApp}
                style={{
                  background: '#25D366', color: '#fff',
                  border: 'none', borderRadius: 4,
                  padding: '8px 16px', fontSize: 13, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.554 4.118 1.524 5.855L.054 23.454a.75.75 0 00.914.914l5.599-1.47A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.5-5.2-1.373l-.374-.22-3.878 1.018 1.018-3.878-.22-.374A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                Compartilhar
              </button>
              {isTrilhaPessoal ? (
                <a
                  href={stravaUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#FC4C02', fontWeight: 500, background: 'rgba(252,76,2,0.12)', padding: '6px 12px', borderRadius: 4 }}
                >
                  Ver no Strava ↗
                </a>
              ) : (
                <button
                  onClick={toggleFavorito}
                  style={{
                    background: 'none', border: '1px solid', cursor: 'pointer',
                    borderColor: isFavorito ? '#FFE000' : '#444',
                    color: isFavorito ? '#FFE000' : '#888',
                    fontSize: 18, padding: '4px 10px', borderRadius: 4,
                  }}
                >
                  {isFavorito ? '★' : '☆'}
                </button>
              )}
            </div>
          </div>

          {/* a) Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            {isTrilhaPessoal && (
              <span style={{ fontSize: 12, fontWeight: 500, color: '#FC4C02', background: 'rgba(252,76,2,0.15)', borderRadius: 999, padding: '2px 10px' }}>
                Strava
              </span>
            )}
            <span style={{ fontSize: 12, color: '#D1D5DB', background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '2px 10px' }}>
              {trilha.trail_type === 'bikepark' ? 'Bike Park' : 'Natural'}
            </span>
            <span style={{ fontSize: 12, color: '#D1D5DB', background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '2px 10px' }}>
              {formatLocalidade(trilha.localidades, trilha.regiao)}
            </span>
            {trilha.bioma && (
              <span style={{ fontSize: 12, color: '#D1D5DB', background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '2px 10px' }}>
                {trilha.bioma}
              </span>
            )}
            {isQuadrilatero && (
              <span style={{ fontSize: 12, fontWeight: 500, color: '#FFE000', background: 'rgba(255,224,0,0.12)', borderRadius: 999, padding: '2px 10px' }}>
                ⛏ Quadrilátero Ferrífero
              </span>
            )}
          </div>

          {/* b) Dados físicos */}
          {(trilha.desnivel_m != null || trilha.extensao_km != null || (clay != null && c?.texture_class)) && (
            <div className="dados-fisicos" style={{ fontSize: 13, color: '#9CA3AF', marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {trilha.desnivel_m != null && <span>⛰ {trilha.desnivel_m}m desnível</span>}
              {trilha.extensao_km != null && <span>📏 {trilha.extensao_km}km</span>}
              {clay != null && c?.texture_class && (
                <span>🪨 {c.texture_class} (arg {clay}% · ar {c?.sand_pct ?? '?'}%)</span>
              )}
            </div>
          )}


</div>
      </div>

      {/* ── Faixa amarela ─────────────────────────────────────────────── */}
      <div style={{ background: '#FFE000', height: 3 }} />

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div className="content-area" style={{ padding: '32px 32px 48px', maxWidth: 720, margin: '0 auto' }}>

        {/* Mapa */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderLeft: `3px solid ${borderCor}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {(isTrilhaPessoal ? polyline : trilha.polyline) ? (
            <>
              <StravaMap polyline={(isTrilhaPessoal ? polyline : trilha.polyline)!} />
              <div style={{ padding: '0 0 0 0' }}>
                <ElevationProfile
                  elevationProfileUrl={elevationProfileUrl}
                  desnivel_m={trilha.desnivel_m}
                  extensao_km={trilha.extensao_km}
                  altitude_m={trilha.altitude_m}
                />
              </div>
            </>
          ) : (
            <iframe
              className="trilha-mapa-iframe"
              src={`https://maps.google.com/maps?q=${trilha.lat},${trilha.lon}&z=15&output=embed&t=k`}
              width="100%"
              height="220"
              style={{ border: 'none', display: 'block' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
          <div style={{ padding: '8px 14px', borderTop: '0.5px solid #e5e5e5' }}>
            {(isTrilhaPessoal ? polyline : trilha.polyline) ? (
              stravaUrl ? (
                <a href={stravaUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#888' }}>
                  Ver no Strava ↗
                </a>
              ) : null
            ) : (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#888' }}>
                Ver no mapa ↗
              </a>
            )}
          </div>
        </div>

        {/* Sem condição */}
        {!c && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>Condições no próximo relatório (07:00 BRT)</p>
          </div>
        )}

        {/* ── Card: Condição do Solo ──────────────────────────────────── */}
        {c && (
          <div style={{ marginBottom: 12 }}>
            <CondicaoCard condicao={c} />
          </div>
        )}

        {/* ── Card: Alertas ───────────────────────────────────────────── */}
        {c && (alertaRajada || nivelVento > 0) && (
          <div className="section-card" style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 20, marginBottom: 12 }}>
            <SectionLabel>Alertas</SectionLabel>

            {alertaRajada && c.alerta_rajada_kmh != null && (
              <div style={{ background: '#fefce8', borderLeft: '3px solid #fde047', borderRadius: '0 4px 4px 0', padding: '10px 14px', fontSize: 12, color: '#713f12', fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>
                🟡 <b>Rajadas previstas nas próximas 48h</b><br />
                <span style={{ fontWeight: 400, color: '#a16207' }}>
                  {trilha.exposicao?.toLowerCase() === 'aberta'
                    ? `Rajadas de até ${c.alerta_rajada_kmh.toFixed(0)} km/h. Trilha exposta — risco em descidas rápidas e cristas.`
                    : `Rajadas de até ${c.alerta_rajada_kmh.toFixed(0)} km/h. Mesmo em trilha fechada, rajadas acima de 50 km/h podem atingir clareiras.`}
                </span>
              </div>
            )}

            {nivelVento > 0 && c.alerta_vento_kmh != null && (() => {
              const cfg3 = {
                1: { bg: '#fefce8', border: '#fde047', corT: '#713f12', corS: '#a16207', emoji: '🟡',
                  titulo: 'Vento moderado a forte nas últimas 48h',
                  msg: 'Ventos entre 55–65 km/h podem quebrar galhos de árvores com saúde comprometida.' },
                2: { bg: '#fff7ed', border: '#fdba74', corT: '#7c2d12', corS: '#c2410c', emoji: '🟠',
                  titulo: 'Ventos fortes nas últimas 48h',
                  msg: 'Ventos entre 65–90 km/h podem derrubar árvores. Avalie as condições antes de pedalar.' },
                3: { bg: '#fef2f2', border: '#fca5a5', corT: '#7f1d1d', corS: '#b91c1c', emoji: '🔴',
                  titulo: 'Risco alto — vento de tempestade',
                  msg: 'Ventos acima de 90 km/h com risco severo de obstrução. Avalie presencialmente.' },
              }
              const n = Math.min(nivelVento as number, 3) as 1 | 2 | 3
              const a = cfg3[n]
              const rajada = c.alerta_rajada_kmh ? ` · rajada ${c.alerta_rajada_kmh.toFixed(0)} km/h` : ''
              return (
                <div style={{ background: a.bg, borderLeft: `3px solid ${a.border}`, borderRadius: '0 4px 4px 0', padding: '10px 14px', fontSize: 12, color: a.corT, fontWeight: 600, lineHeight: 1.5 }}>
                  {a.emoji} <b>{a.titulo}</b> ({c.alerta_vento_kmh.toFixed(0)} km/h sustentado{rajada})<br />
                  <span style={{ fontWeight: 400, color: a.corS }}>{a.msg}</span>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Avaliações dos riders ───────────────────────────────────── */}
        <TrailObservations
          trilhaId={trilha.id}
          veredictoAtual={veredictoText || ''}
          isOwner={isTrilhaPessoal}
          stravaSegmentId={stravaSegmentId ?? undefined}
        />

        {/* ── Fontes ─────────────────────────────────────────────────── */}
        {fontes.length > 0 && (
          <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.8 }}>
            {fontes.join(' · ')}
          </div>
        )}
      </div>

      {limiteMsg && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#111', color: '#fff', borderRadius: 8, padding: '12px 20px',
          fontSize: 13, zIndex: 1000, maxWidth: 440, textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        }}>
          Plano Gratuito permite até 5 trilhas favoritas.{' '}
          <a href="/planos" style={{ color: '#FFE000', fontWeight: 600, textDecoration: 'none' }}>Faça upgrade</a>{' '}
          para monitorar mais trilhas.
        </div>
      )}
    </div>
  )
}
