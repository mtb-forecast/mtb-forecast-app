import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      flowType: 'implicit',
    },
  }
)

// Lê a sessão do cache local (sem chamada de rede).
// O middleware já validou o token server-side — client-side não precisa de getUser().
export async function getClientUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}
