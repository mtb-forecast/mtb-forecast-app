import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Barlow_Condensed } from 'next/font/google'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { Condicao, VEREDICTO_CONFIG } from '@/lib/types'
import { formatLocalidade } from '@/lib/geocoding'
import { deveAlertarRajada, emojiTempo } from '@/lib/display'
import ElevationProfile from '@/components/ElevationProfile'
import TrailObservations from '@/components/TrailObservations'
import CondicaoCard from '@/components/CondicaoCard'
import { LogoMantenedor } from '@/components/LogoMantenedor'
import TrilhaAcoes from './TrilhaAcoes'

const StravaMap = dynamic(() => import('@/components/StravaMap'), {
  ssr: false,
  loading: () => <div style={{ height: 250, borderRadius: 8, background: '#d4dcc9' }} />,
})

const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'] })

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </p>
  )
}

export default async function TrilhaDetalhe({ params }: { params: { id: string } }) {
  const sb = createSupabaseServerClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) redirect('/login')

  const userId = session.user.id
  const { id } = params

  const [{ data: td }, { data: fav }] = await Promise.all([
    sb.from('trilhas')
      .select(`*, condicoes(*), previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med), localidades(cidade, estado, localidade), mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,logo_url,site_url)`)
      .eq('id', id)
      .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
      .order('bloco', { foreignTable: 'previsao_blocos' })
      .maybeSingle(),
    sb.from('favoritos').select('id').eq('user_id', userId).eq('trilha_id', id).maybeSingle(),
  ])

  if (!td) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trilha = td as any
  const conds = Array.isArray(trilha.condicoes) ? trilha.condicoes : []
  const c: Condicao | null = conds[0] ?? null
  const blocos = Array.isArray(trilha.previsao_blocos)
    ? [...trilha.previsao_blocos].sort((a: { bloco: number }, b: { bloco: number }) => a.bloco - b.bloco)
    : null
  if (c && blocos?.length) c.previsao_24h = blocos

  const isFavorito = !!fav

  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg    = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const borderCor = vcfg?.cor ?? '#e5e5e5'

  const isQuadrilatero = trilha.solo_type === 'ferro' || trilha.solo_type === 'misto_mg'
  const mapsUrl = `https://www.google.com/maps?q=${trilha.lat},${trilha.lon}`

  const alertaRajada = deveAlertarRajada(c?.alerta_rajada_kmh, trilha.exposicao)
  const nivelVento = c?.alerta_vento_nivel ?? 0

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
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* ── Page header grafite ─────────────────────────────────────────── */}
      <div className="page-header" style={{ background: '#2a2e25', padding: '40px 0' }}>
        <div className="page-header-inner" style={{ maxWidth: 720, margin: '0 auto', padding: '0 32px', boxSizing: 'border-box' }}>

          {/* Voltar */}
          <Link
            href="/trilhas"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', marginBottom: 20, textDecoration: 'none' }}
          >
            ← Voltar para trilhas
          </Link>

          {/* Nome + ações */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <h1 className="trilha-nome" style={{
              fontFamily: barlow.style.fontFamily,
              fontSize: 36, fontWeight: 800,
              textTransform: 'uppercase',
              color: '#FFFFFF', lineHeight: 1.1, flex: 1, margin: 0,
            }}>
              {trilha.name}
            </h1>
            <div className="trilha-header-actions" style={{ flexShrink: 0 }}>
              <TrilhaAcoes
                trilhaId={id}
                trilhaNome={trilha.name}
                initialIsFavorito={isFavorito}
                userId={userId}
              />
            </div>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
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
              <span style={{ fontSize: 12, fontWeight: 500, color: '#6d745f', background: 'rgba(168,184,153,0.2)', borderRadius: 999, padding: '2px 10px' }}>
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
            <div className="dados-fisicos" style={{ fontSize: 13, color: '#9CA3AF', marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {trilha.desnivel_m != null && <span className="font-mono">⛰ {trilha.desnivel_m}m desnível</span>}
              {trilha.extensao_km != null && <span className="font-mono">📏 {trilha.extensao_km}km</span>}
              {clay != null && c?.texture_class && (
                <span>🪨 {c.texture_class} (<span className="font-mono">arg {clay}% · ar {c?.sand_pct ?? '?'}%</span>)</span>
              )}
            </div>
          )}

          {/* Clima do dia */}
          {c?.temp_max != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 28, fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', lineHeight: 1 }}>
                {emojiTempo(c.rain_mm, c.pop_12h)}
              </span>
              <div>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#E5E7EB' }} className="font-mono">{c.temp_max}°</span>
                {c.temp_min != null && (
                  <span style={{ fontSize: 14, color: '#6B7280', fontWeight: 400 }} className="font-mono"> / {c.temp_min}°</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Faixa de acento ─────────────────────────────────────────────── */}
      <div style={{ background: '#a8b899', height: 3 }} />

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div className="content-area" style={{ padding: '32px 32px 48px', maxWidth: 720, margin: '0 auto' }}>

        {/* Mapa */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderLeft: `3px solid ${borderCor}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {trilha.polyline ? (
            <>
              <StravaMap polyline={trilha.polyline} />
              <div>
                <ElevationProfile
                  elevationProfileUrl={null}
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
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#888' }}>
              Ver no mapa ↗
            </a>
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
            <CondicaoCard condicao={c} lat={trilha.lat} lon={trilha.lon} />
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
                    ? <>Rajadas de até <span className="font-mono">{c.alerta_rajada_kmh.toFixed(0)} km/h</span>. Trilha exposta — risco em descidas rápidas e cristas.</>
                    : <>Rajadas de até <span className="font-mono">{c.alerta_rajada_kmh.toFixed(0)} km/h</span>. Mesmo em trilha fechada, rajadas acima de <span className="font-mono">50 km/h</span> podem atingir clareiras.</>}
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
                  {a.emoji} <b>{a.titulo}</b> (<span className="font-mono">{c.alerta_vento_kmh.toFixed(0)} km/h sustentado{rajada}</span>)<br />
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
          isOwner={false}
        />

        {/* ── Fontes ─────────────────────────────────────────────────── */}
        {fontes.length > 0 && (
          <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.8 }}>
            {fontes.join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
