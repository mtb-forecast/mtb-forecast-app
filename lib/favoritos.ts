import { supabase } from '@/lib/supabase'

// Favoritar uma trilha composta (ver trilha_segmentos / CLAUDE.md) favorita
// automaticamente também os trechos componentes. Sem isso, os trechos nunca
// entram no filtro de favoritos que o pipeline usa pra decidir quais trilhas
// processar por completo (`ids_com_favorito` em mtb-forecast.py) -- ficariam
// com condição desatualizada mesmo fazendo parte de um percurso que o rider
// está acompanhando.
//
// Usar sempre esta função (nunca inserir direto em `favoritos`) pra manter
// esse comportamento consistente em toda a UI -- ver TrilhaAcoes,
// FavoritasGrid, DashboardVitrine, MantenedorContent, TrailObservations e
// /trilhas/page.tsx.
export async function favoritarTrilha(userId: string, trilhaId: string): Promise<void> {
  await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })

  const { data: segmentos } = await supabase
    .from('trilha_segmentos')
    .select('trilha_componente_id')
    .eq('trilha_composta_id', trilhaId)

  if (segmentos && segmentos.length > 0) {
    const rows = segmentos.map(s => ({ user_id: userId, trilha_id: s.trilha_componente_id as string }))
    await supabase.from('favoritos').upsert(rows, { onConflict: 'user_id,trilha_id', ignoreDuplicates: true })
  }
}

// Desfavoritar NÃO cascateia pros trechos -- eles podem estar favoritados
// por conta própria (pelo mesmo usuário, diretamente) ou fazer parte de
// outra trilha composta ainda favoritada.
export async function desfavoritarTrilha(userId: string, trilhaId: string): Promise<void> {
  await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
}
