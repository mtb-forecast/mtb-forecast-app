import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function DashboardFrase() {
  const sb = createSupabaseServerClient()
  const { data: frases } = await sb
    .from('frases_motivacionais')
    .select('frase')
    .eq('ativo', true)

  if (!frases || frases.length === 0) return null

  const now = new Date()
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  )
  const frase = frases[dayOfYear % frases.length].frase

  return (
    <p style={{
      marginTop: 10, marginBottom: 0,
      fontSize: 13, fontStyle: 'italic',
      color: 'rgba(168,184,153,0.85)',
      lineHeight: 1.5, maxWidth: 480,
    }}>
      &ldquo;{frase}&rdquo;
    </p>
  )
}
