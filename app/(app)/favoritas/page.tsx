import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import FavoritasGrid from './FavoritasGrid'
import type { TrilhaComCondicao } from '@/lib/types'

const RANKING_VEREDICTO: Record<string, number> = {
  'DROP LIBERADO': 0,
  'DROP LIBERADO - Veja os alertas': 1,
  'MELHOR ESPERAR': 2,
}
const RANKING_ADERENCIA: Record<string, number> = {
  'GRIP PERFEITO': 0, 'SECO': 1, 'BOA ADERÊNCIA': 2, 'BAIXA ADERÊNCIA': 3,
}

export default async function FavoritasPage() {
  const sb = createSupabaseServerClient()
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
        id, name, bioma, trail_type, regiao,
        localidades(cidade, estado, localidade),
        mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,logo_url,site_url),
        condicoes(
          veredicto, veredicto_12h,
          aderencia_status, aderencia_futura_status, aderencia_futura_label,
          pico_3h, wind_ms, acumulo_48h, ultima_chuva_h,
          texto_dinamico, frase_secagem, gerado_em
        )
      `)
      .in('id', ids)
      .eq('aprovada', true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data as any[] ?? []).map((t) => {
      const arr = Array.isArray(t.condicoes) ? t.condicoes : []
      arr.sort((a: { gerado_em: string }, b: { gerado_em: string }) =>
        new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
      )
      return { ...t, condicao: arr[0] ?? undefined } as TrilhaComCondicao
    })

    mapped.sort((a, b) => {
      const vA = RANKING_VEREDICTO[a.condicao?.veredicto_12h || a.condicao?.veredicto || ''] ?? 99
      const vB = RANKING_VEREDICTO[b.condicao?.veredicto_12h || b.condicao?.veredicto || ''] ?? 99
      if (vA !== vB) return vA - vB
      const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
      const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
      return aA - aB
    })

    trilhas = mapped
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link href="/dashboard" style={{
            fontSize: 13, color: '#a8b899', textDecoration: 'none',
            display: 'inline-block', marginBottom: 16,
          }}>
            ← Dashboard
          </Link>
          <h1 style={{
            fontSize: 36, fontWeight: 800, textTransform: 'uppercase',
            color: '#FFFFFF', lineHeight: 1.05, margin: 0,
          }}>
            Minhas favoritas
          </h1>
          <p style={{ fontSize: 13, color: '#a8b899', marginTop: 8, marginBottom: 0 }}>
            {trilhas.length} trilha{trilhas.length !== 1 ? 's' : ''} monitorada{trilhas.length !== 1 ? 's' : ''}
          </p>
          <div style={{ background: '#a8b899', height: 3, marginTop: 20 }} />
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <FavoritasGrid
          initialTrilhas={trilhas}
          initialFavIds={ids}
          userId={userId}
        />
      </div>
    </div>
  )
}
