import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { Mantenedor, TrilhaComCondicao } from '@/lib/types'
import MantenedorContent from './MantenedorContent'
import { fetchStatusAtivoPorTrilha } from '@/lib/statusTrilha'
import { condicoesArray } from '@/lib/display'

// Conteúdo muda quando admin edita trilhas — sem cache para garantir dados frescos
export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const { data } = await getSupabase()
    .from('mantenedores').select('nome').eq('id', id).single()
  if (!data) return { title: 'Mantenedor não encontrado' }
  return {
    title: data.nome,
    description: `Trilhas mantidas por ${data.nome} no MTB Forecaster`,
  }
}

export default async function MantenedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getSupabase()

  const [{ data: mantenedor }, { data: trilhasRaw }] = await Promise.all([
    supabase
      .from('mantenedores')
      .select('id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,logo_url,site_url,ativo')
      .eq('id', id)
      .eq('ativo', true)
      .single(),
    supabase
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
        previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med, gerado_em)
      `)
      .eq('mantenedor_id', id)
      .eq('aprovada', true)
      .order('name')
      .order('bloco', { foreignTable: 'previsao_blocos' }),
  ])

  if (!mantenedor) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trilhas: TrilhaComCondicao[] = (trilhasRaw ?? []).map((t: any) => {
    const blocos = Array.isArray(t.previsao_blocos)
      ? [...t.previsao_blocos].sort((a: { bloco: number }, b: { bloco: number }) => a.bloco - b.bloco)
      : null
    const arr = condicoesArray(t.condicoes)
    // ordena por gerado_em desc para pegar a condição mais recente
    arr.sort((a: { gerado_em: string }, b: { gerado_em: string }) =>
      new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
    )
    const condicao = arr[0] ?? undefined
    if (condicao && blocos?.length) condicao.previsao_24h = blocos
    return { ...t, condicao } as TrilhaComCondicao
  })

  const statusMap = await fetchStatusAtivoPorTrilha(supabase, trilhas.map(t => t.id))
  trilhas.forEach(t => { t.status_ativo = statusMap[t.id] ?? null })

  return <MantenedorContent mantenedor={mantenedor as Mantenedor} trilhas={trilhas} />
}
