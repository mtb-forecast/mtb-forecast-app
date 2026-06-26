/**
 * logApiUsage — registra uma chamada de API externa na tabela api_usage_log.
 * Fire-and-forget: nunca lança exceção, não bloqueia o caller.
 */
export async function logApiUsage(
  api: string,
  endpoint: string,
  opts: { chamadas?: number; sucesso?: number; falhas?: number; custo_usd?: number } = {}
): Promise<void> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''
  if (!url || !key) return

  try {
    await fetch(`${url}/rest/v1/api_usage_log`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        execucao_id:  crypto.randomUUID(),
        api_name:     api,
        endpoint,
        chamadas:     opts.chamadas  ?? 1,
        sucesso:      opts.sucesso   ?? 1,
        falhas:       opts.falhas    ?? 0,
        custo_usd:    opts.custo_usd ?? 0,
      }),
    })
  } catch {
    // intencionalmente silencioso — log nunca deve quebrar o fluxo principal
  }
}
