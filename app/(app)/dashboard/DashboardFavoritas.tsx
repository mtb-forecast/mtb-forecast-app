import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'
import DashboardTrailCard from '@/components/DashboardTrailCard'
import type { TrilhaComCondicao } from '@/lib/types'

const RANKING_VEREDICTO: Record<string, number> = {
  'DROP LIBERADO': 0,
  'DROP LIBERADO - Veja os alertas': 1,
  'MELHOR ESPERAR': 2,
}
const RANKING_ADERENCIA: Record<string, number> = {
  'GRIP PERFEITO': 0, 'SECO': 1, 'BOA ADERÊNCIA': 2, 'BAIXA ADERÊNCIA': 3,
}

export default async function DashboardFavoritas({ favTrilhaIds }: { favTrilhaIds: string[] }) {
  if (!favTrilhaIds.length) {
    return (
      <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 16 }}>
          Você ainda não tem trilhas favoritas.
        </p>
        <Link href="/trilhas" style={{
          background: '#6d745f', color: '#fff', border: 'none', borderRadius: 4,
          padding: '10px 20px', fontSize: 13, fontWeight: 500, textDecoration: 'none',
        }}>
          Explorar trilhas
        </Link>
      </div>
    )
  }

  const sb = createSupabaseServerClient()
  const h48atras = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const [{ data: trilhasData }, { data: avaliacoes48h }] = await Promise.all([
    sb.from('trilhas')
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
      .in('id', favTrilhaIds)
      .eq('aprovada', true),
    sb.from('observacoes_trilha')
      .select('trilha_id, estrelas')
      .gte('created_at', h48atras)
      .in('trilha_id', favTrilhaIds),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (trilhasData as any[] ?? []).map((t) => {
    const arr = Array.isArray(t.condicoes) ? t.condicoes : []
    arr.sort((a: { gerado_em: string }, b: { gerado_em: string }) =>
      new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
    )
    return { ...t, condicao: arr[0] ?? undefined } as TrilhaComCondicao
  })

  const favoritas = [...mapped].sort((a, b) => {
    const vA = RANKING_VEREDICTO[a.condicao?.veredicto_12h || a.condicao?.veredicto || ''] ?? 99
    const vB = RANKING_VEREDICTO[b.condicao?.veredicto_12h || b.condicao?.veredicto || ''] ?? 99
    if (vA !== vB) return vA - vB
    const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
    const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
    return aA - aB
  })

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
    const v = t.condicao?.veredicto_12h?.trim() || t.condicao?.veredicto?.trim() || ''
    if (v === 'DROP LIBERADO') liberadas++
    else if (v === 'DROP LIBERADO - Veja os alertas' || v === 'MELHOR ESPERAR') comAlerta++
    else aguardando++
  }

  return (
    <>
      {favoritas.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          {liberadas > 0 && (
            <span style={{ fontSize: 13, color: '#4ADE80', fontWeight: 500 }}>
              ✅ {liberadas} liberada{liberadas !== 1 ? 's' : ''}
            </span>
          )}
          {comAlerta > 0 && (
            <span style={{ fontSize: 13, color: '#FCD34D', fontWeight: 500 }}>
              ⚠️ {comAlerta} com alerta
            </span>
          )}
          {aguardando > 0 && (
            <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500 }}>
              ⏳ {aguardando} sem dados
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {favoritas.map(t => (
          <DashboardTrailCard
            key={t.id}
            trilha={t}
            avaliacao={porTrilha[t.id]}
          />
        ))}
      </div>
    </>
  )
}
