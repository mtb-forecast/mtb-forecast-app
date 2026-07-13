// Escolha compartilhada entre veredicto_12h e veredicto (48h).
// Regra: mostra sempre o mais severo dos dois (EVITAR/ESPERAR > ALERTA > LIBERADO),
// nunca "prefira o 12h só porque existe" — ver CLAUDE.md, seção de prioridade de veredicto.
export function veredictoSeverity(v: string | null | undefined): number {
  if (!v) return -1
  const u = v.toUpperCase()
  if (u.includes('ESPERAR') || u.includes('EVITAR')) return 2
  if (u.includes('ALERTA')) return 1
  return 0
}

export function selecionarVeredicto(
  veredicto: string | null | undefined,
  veredicto12h: string | null | undefined
): string | null {
  const v48 = veredicto?.trim() || ''
  const v12 = veredicto12h?.trim() || ''
  if (!v12) return v48 || null
  if (!v48) return v12
  return veredictoSeverity(v12) >= veredictoSeverity(v48) ? v12 : v48
}
