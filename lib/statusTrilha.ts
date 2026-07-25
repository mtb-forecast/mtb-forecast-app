import type { SupabaseClient } from '@supabase/supabase-js'

export const STATUS_TRILHA_OPTIONS = [
  { value: 'fechada',         label: 'Fechada',         bg: '#fee2e2', color: '#991b1b' },
  { value: 'manutencao',      label: 'Em Manutenção',   bg: '#fef9c3', color: '#854d0e' },
  { value: 'sem_manutencao',  label: 'Sem Manutenção',  bg: '#ffedd5', color: '#9a3412' },
  { value: 'arvore_caida',    label: 'Árvore Caída',    bg: '#e0e7ff', color: '#3730a3' },
] as const

export type StatusTrilhaValue = typeof STATUS_TRILHA_OPTIONS[number]['value']

export const STATUS_TRILHA_MAX_SELECAO = 2

// Relatos de status expiram após esse prazo — evita etiqueta desatualizada
// presa no card quando ninguém mais reporta (não existe opção "normalizada").
const STATUS_TRILHA_JANELA_DIAS = 7

export function statusTrilhaLabel(value: string) {
  return STATUS_TRILHA_OPTIONS.find(o => o.value === value) ?? null
}

function statusTrilhaDesde(): string {
  return new Date(Date.now() - STATUS_TRILHA_JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString()
}

// Busca o status ativo (relato não expirado mais recente) por trilha, para popular o card.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchStatusAtivoPorTrilha(sb: SupabaseClient<any>, trilhaIds: string[]): Promise<Record<string, string[]>> {
  if (trilhaIds.length === 0) return {}

  const { data } = await sb
    .from('observacoes_trilha')
    .select('trilha_id, status_trilha, created_at')
    .in('trilha_id', trilhaIds)
    .not('status_trilha', 'is', null)
    .gte('created_at', statusTrilhaDesde())
    .order('created_at', { ascending: false })

  const result: Record<string, string[]> = {}
  for (const row of (data as { trilha_id: string; status_trilha: string[] | null }[] ?? [])) {
    if (!row.trilha_id || result[row.trilha_id] || !row.status_trilha?.length) continue
    result[row.trilha_id] = row.status_trilha
  }
  return result
}
