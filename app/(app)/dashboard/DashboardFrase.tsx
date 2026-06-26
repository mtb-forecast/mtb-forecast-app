import { unstable_cache } from 'next/cache'

const getFrases = unstable_cache(
  async () => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/frases_motivacionais?select=frase&ativo=eq.true`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
      }
    )
    if (!res.ok) return []
    return res.json() as Promise<{ frase: string }[]>
  },
  ['frases-motivacionais'],
  { revalidate: 86400 }
)

export default async function DashboardFrase() {
  const frases = await getFrases()

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
