import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = val
    }
  } catch { /* usa env vars já definidas */ }
}

loadEnvLocal()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Mapeamento de nome completo → sigla
const ESTADO_MAP: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
  'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA',
  'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
  'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE',
  'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
}

async function main() {
  console.log('🔍  Buscando localidades com estado em nome completo...\n')

  const { data: localidades, error } = await admin
    .from('localidades')
    .select('id, estado, cidade, localidade')

  if (error) { console.error('❌  Erro:', error.message); process.exit(1) }
  if (!localidades?.length) { console.log('✅  Nenhuma localidade encontrada.'); return }

  const erradas = localidades.filter(l => ESTADO_MAP[l.estado])
  if (erradas.length === 0) {
    console.log('✅  Todos os estados já estão normalizados como siglas.')
    return
  }

  console.log(`⚠️   ${erradas.length} localidade(s) com nome completo de estado:\n`)

  for (const loc of erradas) {
    const sigla = ESTADO_MAP[loc.estado]
    console.log(`  "${loc.estado}" → "${sigla}" | cidade: ${loc.cidade ?? '—'} | localidade: ${loc.localidade ?? '—'}`)

    // Verifica se já existe uma localidade com a sigla correta para a mesma cidade/localidade
    let queryExist = admin.from('localidades').select('id')
      .eq('estado', sigla)
      .eq('cidade', loc.cidade ?? '')
    if (loc.localidade) {
      queryExist = queryExist.eq('localidade', loc.localidade)
    } else {
      queryExist = queryExist.is('localidade', null)
    }
    const { data: existente } = await queryExist.maybeSingle()

    if (existente) {
      // Já existe uma localidade correta — redireciona trilhas e exclui a duplicata
      console.log(`     ↳ Localidade correta já existe (id: ${existente.id}) — redirecionando trilhas...`)

      const { error: upErr } = await admin
        .from('trilhas')
        .update({ localidade_id: existente.id })
        .eq('localidade_id', loc.id)

      if (upErr) {
        console.log(`     ✗ Erro ao redirecionar trilhas: ${upErr.message}`)
        continue
      }

      const { error: delErr } = await admin.from('localidades').delete().eq('id', loc.id)
      if (delErr) {
        console.log(`     ✗ Erro ao excluir duplicata: ${delErr.message}`)
      } else {
        console.log(`     ✓ Trilhas redirecionadas e duplicata removida.`)
      }
    } else {
      // Não existe — apenas atualiza a sigla
      const { error: upErr } = await admin
        .from('localidades')
        .update({ estado: sigla })
        .eq('id', loc.id)

      if (upErr) {
        console.log(`     ✗ Erro ao atualizar: ${upErr.message}`)
      } else {
        console.log(`     ✓ Atualizado para sigla "${sigla}".`)
      }
    }
  }

  console.log('\n── Normalização concluída ──')
}

main()
