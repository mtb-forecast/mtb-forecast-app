import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TrilhaComCondicao } from '@/lib/types'
import DashboardTrailCard from '@/components/DashboardTrailCard'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

const RANKING_VEREDICTO: Record<string, number> = {
  'DROP LIBERADO': 0,
  'DROP LIBERADO - Veja os alertas': 1,
  'MELHOR ESPERAR': 2,
}

const RANKING_ADERENCIA: Record<string, number> = {
  'GRIP PERFEITO': 0,
  'SECO': 1,
  'BOA ADERÊNCIA': 2,
  'BAIXA ADERÊNCIA': 3,
}

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Todas as queries rodam em paralelo no servidor
  const [
    { data: profileData },
    { data: favIds },
    { data: frases },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, is_admin, nome, apelido, telefone, regiao, receber_email, telegram_username, telegram_chat_id, telegram_ativo')
      .eq('id', user.id)
      .single(),
    supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
    supabase.from('frases_motivacionais').select('frase').eq('ativo', true),
  ])

  const frase = frases && frases.length > 0
    ? (() => {
        const now = new Date()
        const dayOfYear = Math.floor(
          (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
        )
        return frases[dayOfYear % frases.length].frase
      })()
    : null

  let favoritas: TrilhaComCondicao[] = []
  let avaliacoesPorTrilha: Record<string, { count: number; media: number }> = {}

  if (favIds && favIds.length > 0) {
    const favTrilhaIds = favIds.map((f: { trilha_id: string }) => f.trilha_id)
    const h48atras = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const [{ data: trilhasData }, { data: avaliacoes48h }] = await Promise.all([
      supabase
        .from('trilhas')
        .select(`
          id, name, bioma, trail_type, regiao,
          localidades(cidade, estado, localidade),
          mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,icone,logo_url,site_url),
          condicoes(
            veredicto, veredicto_12h,
            aderencia_status, aderencia_futura_status, aderencia_futura_label,
            pico_3h, wind_ms, acumulo_48h, ultima_chuva_h,
            texto_dinamico, frase_secagem, janela, gerado_em
          )
        `)
        .in('id', favTrilhaIds)
        .eq('aprovada', true)
        .order('gerado_em', { foreignTable: 'condicoes', ascending: false }),
      supabase
        .from('observacoes_trilha')
        .select('trilha_id, estrelas')
        .gte('created_at', h48atras)
        .in('trilha_id', favTrilhaIds),
    ])

    if (trilhasData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (trilhasData as any[]).map((t) => {
        const arr = Array.isArray(t.condicoes) ? t.condicoes : []
        return { ...t, condicao: arr[0] ?? undefined } as TrilhaComCondicao
      })
      favoritas = [...mapped].sort((a, b) => {
        const vA = RANKING_VEREDICTO[a.condicao?.veredicto_12h || a.condicao?.veredicto || ''] ?? 99
        const vB = RANKING_VEREDICTO[b.condicao?.veredicto_12h || b.condicao?.veredicto || ''] ?? 99
        if (vA !== vB) return vA - vB
        const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
        const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
        return aA - aB
      })
    }

    const porTrilha: Record<string, { count: number; media: number }> = {}
    for (const av of avaliacoes48h || []) {
      if (av.trilha_id) {
        if (!porTrilha[av.trilha_id]) porTrilha[av.trilha_id] = { count: 0, media: 0 }
        porTrilha[av.trilha_id].count++
        porTrilha[av.trilha_id].media += av.estrelas
      }
    }
    Object.values(porTrilha).forEach(d => { d.media = Math.round(d.media / d.count * 10) / 10 })
    avaliacoesPorTrilha = porTrilha
  }

  const profile = profileData
  const name = profile?.apelido || profile?.nome?.split(' ')[0] || user.email?.split('@')[0]

  let liberadas = 0, comAlerta = 0, aguardando = 0
  for (const t of favoritas) {
    const v = t.condicao?.veredicto_12h?.trim() || t.condicao?.veredicto?.trim() || ''
    if (v === 'DROP LIBERADO') liberadas++
    else if (v === 'DROP LIBERADO - Veja os alertas' || v === 'MELHOR ESPERAR') comAlerta++
    else aguardando++
  }
  const summary = favoritas.length > 0 ? { liberadas, comAlerta, aguardando } : null

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#2a2e25', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h1 style={{
            fontSize: 42, fontWeight: 800,
            textTransform: 'uppercase', lineHeight: 1.05,
            margin: 0,
          }}>
            {name ? (
              <>
                <span style={{ color: '#FFFFFF' }}>Olá, </span>
                <span style={{ color: '#a8b899' }}>{name}</span>
                <span style={{ color: '#FFFFFF' }}>.</span>
              </>
            ) : (
              <span style={{ color: '#FFFFFF' }}>Dashboard.</span>
            )}
          </h1>

          {frase && (
            <p style={{
              marginTop: 10, marginBottom: 0,
              fontSize: 13, fontStyle: 'italic',
              color: 'rgba(168,184,153,0.85)',
              lineHeight: 1.5, maxWidth: 480,
            }}>
              &ldquo;{frase}&rdquo;
            </p>
          )}

          {summary ? (
            <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
              {summary.liberadas > 0 && (
                <span style={{ fontSize: 13, color: '#4ADE80', fontWeight: 500 }}>
                  ✅ {summary.liberadas} liberada{summary.liberadas !== 1 ? 's' : ''}
                </span>
              )}
              {summary.comAlerta > 0 && (
                <span style={{ fontSize: 13, color: '#FCD34D', fontWeight: 500 }}>
                  ⚠️ {summary.comAlerta} com alerta
                </span>
              )}
              {summary.aguardando > 0 && (
                <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500 }}>
                  ⏳ {summary.aguardando} sem dados
                </span>
              )}
            </div>
          ) : (
            <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 8 }}>
              Confira as condições de hoje nas suas trilhas
            </p>
          )}

          <div style={{ background: '#a8b899', height: 3, marginTop: 20 }} />
        </div>
      </div>

      {/* Banner de perfil incompleto */}
      {!(profile?.nome && profile?.apelido && profile?.telefone && profile?.regiao) && (
        <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 28px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, color: '#92400e' }}>
              ⚠️ Complete seu perfil para aproveitar todos os recursos
            </p>
            <Link
              href="/perfil"
              style={{
                fontSize: 13, fontWeight: 500, color: '#fff',
                background: '#6d745f', border: 'none',
                borderRadius: 4, padding: '6px 16px',
                whiteSpace: 'nowrap', textDecoration: 'none',
              }}
            >
              Completar perfil
            </Link>
          </div>
        </div>
      )}

      {/* Banner de notificações desativadas */}
      {profile && !profile.receber_email && !(profile.telegram_chat_id && profile.telegram_ativo) && (
        <div style={{ background: '#2a2e25', padding: '16px 28px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>🔕</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>
                    Você não está recebendo notificações
                  </p>
                  <p style={{ fontSize: 12, color: '#a8b899', margin: 0, lineHeight: 1.6 }}>
                    Ative o e-mail ou conecte o Telegram para saber quando suas trilhas estão liberadas — antes de acordar cedo à toa.
                  </p>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: '#4ADE80' }}>✓</span> Report diário de condições
                    </span>
                    <span style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: '#4ADE80' }}>✓</span> Alerta de trilha liberada
                    </span>
                    <span style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: '#4ADE80' }}>✓</span> Horário personalizável
                    </span>
                  </div>
                </div>
              </div>
              <Link
                href="/perfil"
                style={{
                  fontSize: 13, fontWeight: 600, color: '#2a2e25',
                  background: '#a8b899', border: 'none',
                  borderRadius: 4, padding: '8px 18px',
                  whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0,
                }}
              >
                Ativar notificações →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#2a2e25' }}>Minhas trilhas favoritas</h2>
            <Link href="/trilhas" style={{ fontSize: 13, color: '#6B7280', fontWeight: 400, textDecoration: 'none' }}>
              Ver todas →
            </Link>
          </div>

          {favoritas.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 16 }}>Você ainda não tem trilhas favoritas.</p>
              <Link href="/trilhas" style={{
                background: '#6d745f', color: '#fff',
                border: 'none', borderRadius: 4,
                padding: '10px 20px', fontSize: 13, fontWeight: 500,
                textDecoration: 'none',
              }}>
                Explorar trilhas
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {favoritas.map(t => (
                <DashboardTrailCard
                  key={t.id}
                  trilha={t}
                  avaliacao={avaliacoesPorTrilha[t.id]}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Banner Pump Tracks ────────────────────────────────────── */}
        <Link
          href="/trilhas"
          style={{ textDecoration: 'none', display: 'block', marginTop: 20 }}
        >
          <div style={{
            background: 'linear-gradient(135deg, #2D1B69 0%, #1E1040 100%)',
            border: '1px solid #3D2A8A',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: '#7C3AED',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>
                🟣
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: '0 0 3px' }}>
                  Pump Tracks no Brasil
                </p>
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                  Locais homologados com previsão do tempo e navegação via Waze
                </p>
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#A78BFA', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
              Ver locais →
            </span>
          </div>
        </Link>

      </div>
      <PWAInstallPrompt />
    </div>
  )
}
