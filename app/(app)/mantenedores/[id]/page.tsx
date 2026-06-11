import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { Mantenedor, TrilhaComCondicao } from '@/lib/types'
import MantenedorContent from './MantenedorContent'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const { data } = await getSupabase()
    .from('mantenedores').select('nome').eq('id', params.id).single()
  if (!data) return { title: 'Mantenedor não encontrado' }
  return {
    title: data.nome,
    description: `Trilhas mantidas por ${data.nome} no MTB Forecaster`,
  }
}

export default async function MantenedorPage({ params }: { params: { id: string } }) {
  const supabase = getSupabase()

  const [{ data: mantenedor }, { data: trilhasRaw }] = await Promise.all([
    supabase
      .from('mantenedores')
      .select('id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,icone,logo_url,site_url,ativo')
      .eq('id', params.id)
      .eq('ativo', true)
      .single(),
    supabase
      .from('trilhas')
      .select(`
        id, name, bioma, trail_type, regiao,
        localidades(cidade, estado, localidade),
        mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,icone,logo_url,site_url),
        condicoes(
          veredicto, veredicto_12h,
          aderencia_status, aderencia_futura_status, aderencia_futura_label,
          pico_3h, wind_ms, acumulo_48h, ultima_chuva_h,
          texto_dinamico, frase_secagem, janela, gerado_em
        )
      `)
      .eq('mantenedor_id', params.id)
      .eq('aprovada', true)
      .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
      .order('name'),
  ])

  if (!mantenedor) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trilhas: TrilhaComCondicao[] = (trilhasRaw ?? []).map((t: any) => {
    const arr = Array.isArray(t.condicoes) ? t.condicoes : []
    return { ...t, condicao: arr[0] ?? undefined } as TrilhaComCondicao
  })

  return <MantenedorContent mantenedor={mantenedor as Mantenedor} trilhas={trilhas} />
}
