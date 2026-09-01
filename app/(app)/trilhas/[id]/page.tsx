import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { Condicao } from '@/lib/types'
import { selecionarVeredicto } from '@/lib/veredicto'
import { formatLocalidade } from '@/lib/geocoding'
import { condicoesArray } from '@/lib/display'
import { IconSun, IconRoute, IconArrowsUpDown, IconLayersSubtract } from '@tabler/icons-react'
import TrailObservations from '@/components/TrailObservations'
import CondicaoCard from '@/components/CondicaoCard'
import { LogoMantenedor } from '@/components/LogoMantenedor'
import TrilhaAcoes from './TrilhaAcoes'
import FavoritosTrigger from './FavoritosTrigger'
import TrailMapWithProfile from '@/components/TrailMapWithProfile'
import TrilhaSegmentosBreakdown from '@/components/TrilhaSegmentosBreakdown'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-dm-mono)', fontSize: 10, fontWeight: 500,
      letterSpacing: '1.5px', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 12,
    }}>
      {children}
    </p>
  )
}

const TOPO_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='900' height='500' viewBox='0 0 900 500'>
  <g fill='none' stroke='%236d745f' stroke-opacity='.15' stroke-width='1.3'>
    <path d='M750,80 C820,120 870,200 850,300 C830,400 760,450 670,440 C580,430 520,370 530,280 C540,190 620,100 700,80 Z'/>
    <path d='M750,40 C840,90 910,190 885,310 C860,430 775,490 670,475 C565,460 490,385 505,275 C520,165 620,60 715,42 Z'/>
    <path d='M750,115 C800,148 835,215 818,295 C800,375 743,415 668,406 C593,397 548,346 556,276 C564,206 630,138 692,118 Z'/>
  </g>
</svg>
`.replace(/\s+/g, ' ').trim()

const TOPO_DATA_URI = `url("data:image/svg+xml,${encodeURIComponent(TOPO_SVG)}")`

export default async function TrilhaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const sb = await createSupabaseServerClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) redirect('/login')

  const userId = session.user.id
  const { id } = await params

  const [{ data: td }, { data: fav }, { count: favoritosCount }] = await Promise.all([
    sb.from('trilhas')
      .select(`*, condicoes(*), previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med, gerado_em), localidades(cidade, estado, localidade), mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,logo_url,site_url)`)
      .eq('id', id)
      .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
      .order('bloco', { foreignTable: 'previsao_blocos' })
      .maybeSingle(),
    sb.from('favoritos').select('id').eq('user_id', userId).eq('trilha_id', id).maybeSingle(),
    sb.from('favoritos').select('id', { count: 'exact', head: true }).eq('trilha_id', id),
  ])

  if (!td) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trilha = td as any
  const conds = condicoesArray(trilha.condicoes)
  const c: Condicao | null = conds[0] ?? null

  // Trilha composta: percurso longo que passa por trechos já cadastrados
  // como trilhas próprias no catálogo (ver trilha_segmentos / CLAUDE.md).
  const { data: segmentosRaw } = await sb
    .from('trilha_segmentos')
    .select('ordem, trilha:trilhas!trilha_componente_id(id, name, lat, lon, polyline, condicoes(veredicto, veredicto_12h, gerado_em))')
    .eq('trilha_composta_id', id)
    .order('ordem')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmentos = ((segmentosRaw ?? []) as any[]).map(s => {
    const t = Array.isArray(s.trilha) ? s.trilha[0] : s.trilha
    const condsT = condicoesArray(t?.condicoes)
    const ct = condsT[0] ?? null
    return {
      id: t?.id as string, name: t?.name as string,
      veredicto: ct?.veredicto ?? null, veredicto_12h: ct?.veredicto_12h ?? null,
      lat: t?.lat as number | null, lon: t?.lon as number | null, polyline: t?.polyline as string | null,
    }
  }).filter(s => s.id)
  const blocos = Array.isArray(trilha.previsao_blocos)
    ? [...trilha.previsao_blocos].sort((a: { bloco: number }, b: { bloco: number }) => a.bloco - b.bloco)
    : null
  if (c && blocos?.length) c.previsao_24h = blocos

  const isFavorito = !!fav

  const veredictoText = selecionarVeredicto(c?.veredicto, c?.veredicto_12h)

  const isQuadrilatero = trilha.solo_type === 'ferro' || trilha.solo_type === 'misto_mg'

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
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: '#141612',
        padding: '28px 32px 32px',
      }}>
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            backgroundImage: TOPO_DATA_URI,
            backgroundSize: 'cover',
            backgroundPosition: 'right center',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>

          {/* Nome + ações */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h1 style={{
              fontFamily: 'var(--font-barlow-condensed)', fontSize: 'clamp(26px, 5vw, 40px)',
              fontWeight: 800, textTransform: 'uppercase', color: '#F4F3EF',
              lineHeight: 0.95, flex: 1, margin: 0,
            }}>
              {trilha.name}
            </h1>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <TrilhaAcoes
                trilhaId={id}
                trilhaNome={trilha.name}
                initialIsFavorito={isFavorito}
                userId={userId}
              />
              <FavoritosTrigger trilhaId={id} trilhaNome={trilha.name} count={favoritosCount ?? 0} />
            </div>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-dm-mono)', color: 'rgba(209,213,219,.75)',
              background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 999, padding: '3px 10px',
            }}>
              {trilha.trail_type === 'bikepark' ? 'Bike Park' : 'Natural'}
            </span>
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-dm-mono)', color: 'rgba(209,213,219,.75)',
              background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 999, padding: '3px 10px',
            }}>
              {formatLocalidade(trilha.localidades, trilha.regiao)}
            </span>
            {trilha.bioma && (
              <span style={{
                fontSize: 11, fontFamily: 'var(--font-dm-mono)', color: 'rgba(209,213,219,.75)',
                background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 999, padding: '3px 10px',
              }}>
                {trilha.bioma}
              </span>
            )}
            {isQuadrilatero && (
              <span style={{
                fontSize: 11, fontFamily: 'var(--font-dm-mono)', color: '#c4b5fd',
                background: 'rgba(196,181,253,.1)', border: '1px solid rgba(196,181,253,.2)',
                borderRadius: 999, padding: '3px 10px',
              }}>
                ⛏ Quadrilátero Ferrífero
              </span>
            )}
          </div>

          {/* Mantenedor */}
          {trilha.mantenedor && (
            <LogoMantenedor mantenedor={trilha.mantenedor} contexto="pagina" />
          )}

          {/* Dados físicos */}
          {(trilha.desnivel_m != null || trilha.extensao_km != null || (clay != null && c?.texture_class)) && (
            <div style={{
              fontSize: 12, fontFamily: 'var(--font-dm-mono)', color: '#9AA093',
              marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap',
            }}>
              {trilha.desnivel_m != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <IconArrowsUpDown size={12} strokeWidth={2} color="#9AA093" />
                  {trilha.desnivel_m}m desnível
                </span>
              )}
              {trilha.extensao_km != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <IconRoute size={12} strokeWidth={2} color="#9AA093" />
                  {trilha.extensao_km}km
                </span>
              )}
              {clay != null && c?.texture_class && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <IconLayersSubtract size={12} strokeWidth={2} color="#9AA093" />
                  {c.texture_class} (arg {clay}%)
                </span>
              )}
            </div>
          )}

          {/* Temperatura */}
          {c?.temp_max != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9, background: 'rgba(88,120,200,.15)',
                border: '1px solid rgba(88,120,200,.25)', display: 'grid', placeItems: 'center',
              }}>
                <IconSun size={17} strokeWidth={1.75} color="#5B8DEF" />
              </div>
              <div>
                <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 18, fontWeight: 500, color: '#E5E7EB' }}>
                  {c.temp_max}°
                </span>
                {c.temp_min != null && (
                  <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 13, color: '#6B7280' }}>
                    {' '}/ {c.temp_min}°
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 32px 48px', maxWidth: 720, margin: '0 auto' }}>

        {/* Mapa + elevação */}
        <div style={{
          background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)',
          borderRadius: 16, overflow: 'hidden', marginBottom: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,.04)',
        }}>
          <TrailMapWithProfile
            polyline={trilha.polyline ?? null}
            elevationProfile={trilha.elevation_profile ?? null}
            desnivel_m={trilha.desnivel_m}
            extensao_km={trilha.extensao_km}
            altitude_m={trilha.altitude_m}
            lat={trilha.lat}
            lon={trilha.lon}
            trechos={segmentos.map(s => ({ id: s.id, name: s.name, polyline: s.polyline, lat: s.lat, lon: s.lon }))}
          />
        </div>

        {/* Sem condição */}
        {!c && (
          <div style={{
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
            padding: 24, textAlign: 'center', marginBottom: 12,
          }}>
            <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
              Condições no próximo relatório (07:00 BRT)
            </p>
          </div>
        )}

        {/* ── Card: Condição do Solo ──────────────────────────────────── */}
        {c && (
          <div style={{ marginBottom: 12 }}>
            <CondicaoCard condicao={c} lat={trilha.lat} lon={trilha.lon} exposicao={trilha.exposicao} />
          </div>
        )}

        {/* ── Trechos (trilha composta) ────────────────────────────────── */}
        <TrilhaSegmentosBreakdown segmentos={segmentos} origemTrecho={c?.veredicto_origem_trecho} />

        {/* ── Avaliações dos riders ───────────────────────────────────── */}
        <div style={{
          background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)',
          borderRadius: 16, overflow: 'hidden', marginBottom: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,.04)',
        }}>
          <TrailObservations
            trilhaId={trilha.id}
            veredictoAtual={veredictoText || ''}
            isOwner={false}
          />
        </div>

        {/* ── Fontes ─────────────────────────────────────────────────── */}
        {fontes.length > 0 && (
          <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#b5bbb0', lineHeight: 1.8 }}>
            {fontes
              .map(f => f.replace('📡 ', '').replace('🌱 ', '').replace('📈 ', '').replace('💨 ', ''))
              .join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
