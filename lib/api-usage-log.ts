/**
 * logApiUsage — registra uma chamada de API externa na tabela api_usage_log.
 * Nunca lança exceção. Sempre usar `await` no call site (nunca `void`) —
 * em runtime serverless, uma promise não aguardada pode ser cancelada assim
 * que a resposta HTTP é enviada, perdendo o registro silenciosamente.
 */
export async function logApiUsage(
  api: string,
  endpoint: string,
  opts: { chamadas?: number; sucesso?: number; falhas?: number; custo_usd?: number } = {}
): Promise<void> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''
  if (!url || !key) {
    console.warn(`[logApiUsage] SUPABASE_URL/SERVICE_KEY ausente — "${api}/${endpoint}" não registrado`)
    return
  }

  try {
    const res = await fetch(`${url}/rest/v1/api_usage_log`, {
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
    if (!res.ok) {
      console.warn(`[logApiUsage] Supabase recusou o registro de "${api}/${endpoint}": HTTP ${res.status} ${await res.text().catch(() => '')}`)
    }
  } catch (err) {
    // nunca lança — logging não pode derrubar o fluxo principal, mas fica visível nos logs da função
    console.warn(`[logApiUsage] Falha ao registrar "${api}/${endpoint}":`, err)
  }
}
