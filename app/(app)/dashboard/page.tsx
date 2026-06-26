import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import DashboardFavoritas from './DashboardFavoritas'
import DashboardFrase from './DashboardFrase'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
  // getSession() lê do cookie sem round-trip de rede — o middleware já validou
  // o token contra o servidor de Auth (getUser()) para esta mesma requisição.
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  // Rodada 1 — apenas perfil + favoritos (críticos para o LCP).
  // frases_motivacionais é buscada em DashboardFrase via Suspense, sem bloquear o LCP.
  const [{ data: profileData }, { data: favIds }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, is_admin, nome, apelido, telefone, regiao, receber_email, telegram_username, telegram_chat_id, telegram_ativo')
      .eq('id', user.id)
      .single(),
    supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
  ])

  const profile = profileData
  const name = profile?.apelido || profile?.nome?.split(' ')[0] || user.email?.split('@')[0]
  const favTrilhaIds = (favIds ?? []).map((f: { trilha_id: string }) => f.trilha_id)

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* ── Hero — h1 é o elemento LCP; pinta antes dos cards carregarem ── */}
      <div className="hero-dark" style={{ background: '#2a2e25', padding: '32px 28px 28px' }}>
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

          <Suspense fallback={null}>
            <DashboardFrase />
          </Suspense>

          <div style={{ background: '#a8b899', height: 3, marginTop: 20 }} />
        </div>
      </div>

      {/* Banner de perfil incompleto */}
      {!(profile?.nome && profile?.apelido && profile?.telefone && profile?.regiao) && (
        <div className="hero-banner" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 28px' }}>
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
        <div className="hero-banner" style={{ background: '#2a2e25', padding: '16px 28px' }}>
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
      <div className="page-main-content" style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#2a2e25' }}>Minhas trilhas favoritas</h2>
            <Link href="/favoritas" style={{
              fontSize: 12, fontWeight: 700, color: '#1A1A1A',
              background: '#FFE000', borderRadius: 999,
              padding: '4px 12px', textDecoration: 'none',
            }}>
              Ver todas →
            </Link>
          </div>

          {/* Cards streamados — o browser já pintou o h1 (LCP) antes de chegar aqui */}
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <div className="spin-indicator" />
            </div>
          }>
            <DashboardFavoritas
              favTrilhaIds={favTrilhaIds}
              userEstado={profile?.regiao ?? undefined}
              userId={user.id}
            />
          </Suspense>
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
