import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local without dotenv dependency
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
  } catch {
    // no .env.local — rely on environment variables already set
  }
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

async function main() {
  console.log('🔍  Buscando usuários em auth.users...')

  // Paginate through all auth users
  const allUsers: { id: string; email?: string }[] = []
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      console.error('❌  Erro ao buscar auth.users:', error.message)
      process.exit(1)
    }
    allUsers.push(...data.users)
    if (data.users.length < 1000) break
    page++
  }

  console.log(`   auth.users encontrados: ${allUsers.length}`)

  // Fetch all existing profile IDs
  const { data: profileRows, error: profilesError } = await admin
    .from('profiles')
    .select('id')

  if (profilesError) {
    console.error('❌  Erro ao buscar profiles:', profilesError.message)
    process.exit(1)
  }

  const existingIds = new Set((profileRows ?? []).map((r: { id: string }) => r.id))
  console.log(`   profiles existentes:    ${existingIds.size}`)

  // Find orphans
  const orphans = allUsers.filter(u => !existingIds.has(u.id))
  console.log(`   profiles ausentes:      ${orphans.length}`)

  if (orphans.length === 0) {
    console.log('\n✅  Nenhum perfil órfão encontrado. Nada a fazer.')
    return
  }

  console.log('\n⚙️   Criando profiles ausentes...')
  let created = 0

  for (const user of orphans) {
    const { error: upsertError } = await admin.from('profiles').upsert({
      id: user.id,
      email: user.email ?? '',
      plano: 'gratuito',
      is_admin: false,
    })

    if (upsertError) {
      console.warn(`   ⚠️  Falha ao criar profile para ${user.id}: ${upsertError.message}`)
    } else {
      created++
      console.log(`   ✓  ${user.email ?? user.id}`)
    }
  }

  console.log(`\n✅  Concluído.`)
  console.log(`   Total auth.users:       ${allUsers.length}`)
  console.log(`   Profiles já existentes: ${existingIds.size}`)
  console.log(`   Profiles criados:       ${created}`)
}

main()
