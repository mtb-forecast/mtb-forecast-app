import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { IconCircleCheck, IconAlertTriangle, IconHourglass } from '@tabler/icons-react'
import DashboardTrailCard from '@/components/DashboardTrailCard'
import DashboardVitrine from './DashboardVitrine'
import type { TrilhaComCondicao } from '@/lib/types'
import { selecionarVeredicto, veredictoComAlerta } from '@/lib/veredicto'
import { fetchStatusAtivoPorTrilha } from '@/lib/statusTrilha'
import { condicoesArray } from '@/lib/display'

const RANKING_VEREDICTO: Record<string, number> = {
  'DROP LIBERADO': 0,
  'DROP LIBERADO - Veja os alertas': 1,
  'MELHOR ESPERAR': 2,
}
const RANKING_ADERENCIA: Record<string, number> = {
  'GRIP PERFEITO': 0, 'SECO': 1, 'BOA ADERÊNCIA': 2, 'BAIXA ADERÊNCIA': 3,
}

const PREVISAO_BLOCOS_SELECT = 'previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med, gerado_em)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergePrevisao24h(t: any) {
  const blocos = Array.isArray(t.previsao_blocos)
    ? [...t.previsao_blocos].sort((a: { bloco: number }, b: { bloco: number }) => a.bloco - b.bloco)
    : null
  const arr = condicoesArray(t.condicoes)
  arr.sort((a: { gerado_em: string }, b: { gerado_em: string }) =>
    new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
  )
  const condicao = arr[0] ?? undefined
  if (condicao && blocos?.length) condicao.previsao_24h = blocos
  return condicao
}

export default async function DashboardFavoritas({
  favTrilhaIds,
  userEstado,
  userId,
}: {
  favTrilhaIds: string[]
  userEstado?: string
  userId?: string
}) {
  if (!favTrilhaIds.length) {
    if (userEstado && userId) {
      const vitrineData = await getVitrineData(userEstado)
      return (
        <DashboardVitrine
          trilha={vitrineData.trilha}
          totalTrilhasRegiao={vitrineData.totalCount}
          userEstado={userEstado}
          userId={userId}
        />
      )
    }
    return (
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16, padding: 40, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', color: '#9AA093', fontSize: 14, marginBottom: 16 }}>
          Você ainda não tem trilhas favoritas.
        </p>
        <Link href="/trilhas" style={{
          background: '#1A1D18', color: '#F4F3EF', border: 'none', borderRadius: 999,
          padding: '9px 20px', fontSize: 13, fontFamily: 'var(--font-barlow-condensed)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', textDecoration: 'none',
          display: 'inline-block',
        }}>
          Explorar trilhas
        </Link>
      </div>
    )
  }

  const sb = await createSupabaseServerClient()
  const h48atras = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const [{ data: trilhasData }, { data: avaliacoes48h }] = await Promise.all([
    sb.from('trilhas')
      .select(`
        id, name, bioma, trail_type, regiao, exposicao,
        localidades(cidade, estado, localidade),
        mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,logo_url,site_url),
        condicoes(
          veredicto, veredicto_12h,
          aderencia_status, aderencia_futura_status, aderencia_futura_label,
          pico_3h, wind_ms, chuva_solo_48h, ultima_chuva_h,
          rajada_max_kmh, alerta_vento_nivel,
          texto_dinamico, frase_secagem, gerado_em
        ),
        ${PREVISAO_BLOCOS_SELECT}
      `)
      .in('id', favTrilhaIds)
      .eq('aprovada', true)
      .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
      .limit(1, { foreignTable: 'condicoes' })
      .order('bloco', { foreignTable: 'previsao_blocos' }),
    sb.from('observacoes_trilha')
      .select('trilha_id, estrelas')
      .gte('created_at', h48atras)
      .in('trilha_id', favTrilhaIds),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (trilhasData as any[] ?? []).map((t) => {
    const condicao = mergePrevisao24h(t)
    return { ...t, condicao } as TrilhaComCondicao
  })

  const statusMap = await fetchStatusAtivoPorTrilha(sb, mapped.map(t => t.id))
  mapped.forEach(t => { t.status_ativo = statusMap[t.id] ?? null })

  const favoritasAll = [...mapped].sort((a, b) => {
    const vA = RANKING_VEREDICTO[selecionarVeredicto(a.condicao?.veredicto, a.condicao?.veredicto_12h) || ''] ?? 99
    const vB = RANKING_VEREDICTO[selecionarVeredicto(b.condicao?.veredicto, b.condicao?.veredicto_12h) || ''] ?? 99
    if (vA !== vB) return vA - vB
    const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
    const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
    return aA - aB
  })
  const favoritas = favoritasAll.slice(0, 5)
  const totalFavoritas = favoritasAll.length

  const porTrilha: Record<string, { count: number; media: number }> = {}
  for (const av of (avaliacoes48h ?? [])) {
    if (av.trilha_id) {
      if (!porTrilha[av.trilha_id]) porTrilha[av.trilha_id] = { count: 0, media: 0 }
      porTrilha[av.trilha_id].count++
      porTrilha[av.trilha_id].media += av.estrelas
    }
  }
  Object.values(porTrilha).forEach(d => { d.media = Math.round(d.media / d.count * 10) / 10 })

  let liberadas = 0, comAlerta = 0, aguardando = 0
  for (const t of favoritas) {
    const vBase = selecionarVeredicto(t.condicao?.veredicto, t.condicao?.veredicto_12h)
    // Mesma fonte usada por DashboardTrailCard/CondicaoCard/etc: nunca conta como
    // "liberada" uma trilha que o card vai mostrar com alerta visível (rajada,
    // vento, chuva prevista, piora futura).
    const v = veredictoComAlerta(vBase, t.condicao, t.exposicao) || ''
    if (v === 'DROP LIBERADO') liberadas++
    else if (v === 'DROP LIBERADO - Veja os alertas' || v === 'MELHOR ESPERAR') comAlerta++
    else aguardando++
  }

  return (
    <>
      {favoritas.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 13, flexWrap: 'wrap' }}>
          {liberadas > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--font-dm-mono)', fontSize: 12, fontWeight: 500, color: '#22C55E',
            }}>
              <IconCircleCheck size={12} stroke={2} />
              {liberadas} liberada{liberadas !== 1 ? 's' : ''}
            </span>
          )}
          {comAlerta > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--font-dm-mono)', fontSize: 12, fontWeight: 500, color: '#F59E0B',
            }}>
              <IconAlertTriangle size={12} stroke={2} />
              {comAlerta} com alerta
            </span>
          )}
          {aguardando > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--font-dm-mono)', fontSize: 12, fontWeight: 500, color: '#9AA093',
            }}>
              <IconHourglass size={12} stroke={2} />
              {aguardando} sem dados
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {favoritas.map(t => (
          <DashboardTrailCard
            key={t.id}
            trilha={t}
            avaliacao={porTrilha[t.id]}
          />
        ))}
      </div>
      {totalFavoritas > 5 && (
        <Link
          href="/favoritas"
          style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#6d745f',
            textDecoration: 'none', textAlign: 'center', marginTop: 10, display: 'block',
          }}
        >
          +{totalFavoritas - 5} favoritas ocultas — ver todas
        </Link>
      )}
    </>
  )
}

// ── Vitrine helpers ───────────────────────────────────────────────────────────

async function getVitrineData(estado: string): Promise<{ trilha: TrilhaComCondicao | null; totalCount: number }> {
  const sb = await createSupabaseServerClient()

  const [{ data: trilhasData }, { count }] = await Promise.all([
    sb.from('trilhas')
      .select(`
        id, name, bioma, trail_type, regiao, exposicao,
        localidades(cidade, estado, localidade),
        mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,logo_url,site_url),
        condicoes(
          veredicto, veredicto_12h,
          aderencia_status, aderencia_score,
          aderencia_futura_status, aderencia_futura_label,
          pico_3h, wind_ms, chuva_solo_48h, ultima_chuva_h,
          rajada_max_kmh, alerta_vento_nivel,
          texto_dinamico, frase_secagem, gerado_em
        ),
        ${PREVISAO_BLOCOS_SELECT},
        favoritos_agg:favoritos(count)
      `)
      .eq('regiao', estado)
      .eq('aprovada', true)
      .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
      .limit(1, { foreignTable: 'condicoes' })
      .order('bloco', { foreignTable: 'previsao_blocos' })
      .limit(30),
    sb.from('trilhas')
      .select('id', { count: 'exact', head: true })
      .eq('regiao', estado)
      .eq('aprovada', true),
  ])

  const totalCount = count ?? 0

  if (!trilhasData?.length) return { trilha: null, totalCount }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (trilhasData as any[]).map((t) => {
    const condicao = mergePrevisao24h(t)
    const favCount = Array.isArray(t.favoritos_agg) ? (t.favoritos_agg[0]?.count ?? 0) : 0
    return { ...t, condicao, _favCount: favCount } as TrilhaComCondicao & { _favCount: number }
  })

  mapped.sort((a, b) => b._favCount - a._favCount)

  const top = mapped[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { _favCount: _, favoritos_agg: __, ...trilha } = top as any
  return { trilha: trilha as TrilhaComCondicao, totalCount }
}
