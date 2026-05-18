import { supabase } from '@/lib/supabase'
import { ESTADOS_BRASIL } from '@/lib/types'

// Fallbacks alinhados com os valores canônicos do agente Python
const SOLO_FALLBACK = ['terra', 'misto', 'misto_mg', 'preto', 'pedra', 'ferro']
const BIOMA_FALLBACK = ['Mata Atlântica', 'Cerrado', 'Caatinga', 'Pantanal', 'Amazônia', 'Pampa']

export async function getSoloTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('tabela_solo')
    .select('solo_type')
    .neq('solo_type', 'TODOS')
  if (error || !data?.length) return SOLO_FALLBACK
  return [...new Set(data.map(r => r.solo_type))].sort()
}

export async function getBiomas(): Promise<string[]> {
  const { data, error } = await supabase
    .from('tabela_solo')
    .select('bioma')
    .neq('bioma', 'TODOS')
  if (error || !data?.length) return BIOMA_FALLBACK
  return [...new Set(data.map(r => r.bioma))]
}

export async function getRegioes(): Promise<{ valor: string; label: string }[]> {
  return ESTADOS_BRASIL.map(e => ({ valor: e.value, label: e.label }))
}

// Valores canônicos do agente Python (aberta/semi-aberta/fechada)
// semi-aberta mantida para compatibilidade com meia_vida_secagem na tabela admin
export async function getExposicoes(): Promise<{ valor: string; label: string }[]> {
  return [
    { valor: 'aberta',      label: 'Aberta (sol direto, sem cobertura)' },
    { valor: 'semi-aberta', label: 'Semi-aberta (vegetação rala)' },
    { valor: 'fechada',     label: 'Fechada (mata densa, sombra)' },
  ]
}

// Valores canônicos do agente Python
export async function getTrailTypes(): Promise<{ valor: string; label: string }[]> {
  return [
    { valor: 'natural',  label: 'Natural (trilha de terra)' },
    { valor: 'bikepark', label: 'Bike Park (construído)' },
  ]
}
