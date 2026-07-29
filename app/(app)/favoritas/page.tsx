import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import FavoritasGrid from './FavoritasGrid'
import type { TrilhaComCondicao } from '@/lib/types'
import { selecionarVeredicto } from '@/lib/veredicto'
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

const TOPO_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='900' height='500' viewBox='0 0 900 500'>
  <g fill='none' stroke='%236d745f' stroke-opacity='0.18' stroke-width='1.3'>
    <path d='M700,60 C820,50 900,140 900,250 C900,360 830,440 720,455 C610,470 520,420 500,320 C480,220 540,120 630,80 C660,67 680,63 700,60 Z'/>
    <path d='M700,10 C860,0 950,120 950,250 C950,380 850,470 720,490 C590,510 470,440 445,320 C420,200 500,90 620,40 C650,25 675,15 700,10 Z'/>
    <path d='M700,-40 C900,-55 1000,100 1000,250 C1000,400 870,500 720,525 C570,550 420,460 390,320 C360,180 460,55 610,0 C640,-13 670,-35 700,-40 Z'/>
    <path d='M700,-90 C940,-110 1050,80 1050,250 C1050,420 890,530 720,560 C550,590 370,480 335,320 C300,160 420,20 600,-40 C630,-53 665,-83 700,-90 Z'/>
  </g>
</svg>
`.replace(/\s+/g, ' ').trim()

const TOPO_DATA_URI = `url("data:image/svg+xml,${TOPO_SVG}")`

const PREVISAO_BLOCOS_SELECT = 'previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med, gerado_em)'

export default async function FavoritasPage() {
  const sb = await createSupabaseServerClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) redirect('/login')

  const userId = session.user.id

  const { data: favRows } = await sb
    .from('favoritos')
    .select('trilha_id')
    .eq('user_id', userId)

  const ids = (favRows ?? []).map((f: { trilha_id: string }) => f.trilha_id)

  let trilhas: TrilhaComCondicao[] = []

  if (ids.length > 0) {
    const { data } = await sb
      .from('trilhas')
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
      .in('id', ids)
      .eq('aprovada', true)
      .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
      .limit(1, { foreignTable: 'condicoes' })
      .order('bloco', { foreignTable: 'previsao_blocos' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data as any[] ?? []).map((t) => {
      const blocos = Array.isArray(t.previsao_blocos)
        ? [...t.previsao_blocos].sort((a: { bloco: number }, b: { bloco: number }) => a.bloco - b.bloco)
        : null
      const arr = condicoesArray(t.condicoes)
      arr.sort((a: { gerado_em: string }, b: { gerado_em: string }) =>
        new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
      )
      const condicao = arr[0] ?? undefined
      if (condicao && blocos?.length) condicao.previsao_24h = blocos
      return { ...t, condicao } as TrilhaComCondicao
    })

    const statusMap = await fetchStatusAtivoPorTrilha(sb, mapped.map(t => t.id))
    mapped.forEach(t => { t.status_ativo = statusMap[t.id] ?? null })

    mapped.sort((a, b) => {
      const vA = RANKING_VEREDICTO[selecionarVeredicto(a.condicao?.veredicto, a.condicao?.veredicto_12h) || ''] ?? 99
      const vB = RANKING_VEREDICTO[selecionarVeredicto(b.condicao?.veredicto, b.condicao?.veredicto_12h) || ''] ?? 99
      if (vA !== vB) return vA - vB
      const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
      const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
      return aA - aB
    })

    trilhas = mapped
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: '#141612',
        borderBottom: '1px solid rgba(109,116,95,.25)', padding: '28px 28px 22px',
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
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto' }}>
          <Link href="/dashboard" style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1px',
            color: 'rgba(109,116,95,.7)', textDecoration: 'none',
            display: 'inline-block', marginBottom: 14,
          }}>
            ← Dashboard
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(36px, 5vw, 50px)', textTransform: 'uppercase',
            lineHeight: 0.95, color: '#F4F3EF', margin: 0,
          }}>
            Minhas favoritas
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', marginTop: 8, marginBottom: 0 }}>
            {trilhas.length} trilha{trilhas.length !== 1 ? 's' : ''} monitorada{trilhas.length !== 1 ? 's' : ''}
          </p>
          <div style={{ height: 1, background: 'rgba(109,116,95,.25)', marginTop: 20 }} />
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div style={{ padding: '24px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <FavoritasGrid
          initialTrilhas={trilhas}
          initialFavIds={ids}
          userId={userId}
        />
      </div>
    </div>
  )
}
