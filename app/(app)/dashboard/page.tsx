import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { IconAlertTriangle, IconBellOff, IconCheck, IconSun } from '@tabler/icons-react'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import DashboardFavoritas from './DashboardFavoritas'
import DashboardFrase from './DashboardFrase'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

const TOPO_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='900' height='500' viewBox='0 0 900 500'>
  <g fill='none' stroke='%236d745f' stroke-opacity='0.18' stroke-width='1.3'>
    <path d='M700,60 C820,50 900,140 900,250 C900,360 830,440 720,455 C610,470 520,420 500,320 C480,220 540,120 630,80 C660,67 680,63 700,60 Z'/>
    <path d='M700,10 C860,0 950,120 950,250 C950,380 850,470 720,490 C590,510 470,440 445,320 C420,200 500,90 620,40 C650,25 675,15 700,10 Z'/>
    <path d='M700,-40 C900,-55 1000,100 1000,250 C1000,400 870,500 720,525 C570,550 420,460 390,320 C360,180 460,55 610,0 C640,-13 670,-35 700,-40 Z'/>
    <path d='M700,-90 C940,-110 1050,80 1050,250 C1050,420 890,530 720,560 C550,590 370,480 335,320 C300,160 420,20 600,-40 C630,-53 665,-83 700,-90 Z'/>
  </g>
</svg>
`.replace(/\s+/g, ' ').trim()

const TOPO_DATA_URI = `url("data:image/svg+xml,${TOPO_SVG}")`

const BONE_BUTTON_STYLE: React.CSSProperties = {
  background: '#F4F3EF', color: '#0E0F0D',
  fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 13,
  borderRadius: 999, padding: '5px 14px', textDecoration: 'none', whiteSpace: 'nowrap',
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
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
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* ── Hero — h1 é o elemento LCP; pinta antes dos cards carregarem ── */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: '#141612',
        borderBottom: '1px solid rgba(109,116,95,.25)', padding: '32px 28px 28px',
      }}>
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            backgroundImage: TOPO_DATA_URI,
            backgroundSize: 'cover',
            backgroundPosition: 'right center',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto' }}>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(40px, 6vw, 60px)', textTransform: 'uppercase',
            lineHeight: 0.95, margin: 0, color: '#F4F3EF',
          }}>
            {name ? (
              <>
                Olá,<br />
                <span style={{ color: '#6d745f' }}>{name}.</span>
              </>
            ) : (
              'Dashboard.'
            )}
          </h1>

          <Suspense fallback={null}>
            <DashboardFrase />
          </Suspense>

          <div style={{ height: 1, background: 'rgba(109,116,95,.25)', marginTop: 22 }} />
        </div>
      </div>

      {/* Banner de perfil incompleto */}
      {!(profile?.nome && profile?.apelido && profile?.telefone && profile?.regiao) && (
        <div style={{ background: 'rgba(245,158,11,.06)', borderBottom: '1px solid rgba(245,158,11,.2)', padding: '11px 28px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: 'rgba(245,158,11,.9)',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <IconAlertTriangle size={14} stroke={2} />
              Complete seu perfil para aproveitar todos os recursos
            </span>
            <Link href="/perfil" style={BONE_BUTTON_STYLE}>
              Completar perfil
            </Link>
          </div>
        </div>
      )}

      {/* Banner de notificações desativadas */}
      {profile && !profile.receber_email && !(profile.telegram_chat_id && profile.telegram_ativo) && (
        <div style={{ background: '#171914', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '12px 28px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
              <span style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(244,243,239,.06)', border: '1px solid rgba(109,116,95,.25)',
                display: 'grid', placeItems: 'center',
              }}>
                <IconBellOff size={15} stroke={2} color="#9AA093" />
              </span>
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 600, color: '#F4F3EF', margin: '0 0 4px' }}>
                  Você não está recebendo notificações
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 11, color: '#9AA093', margin: 0, lineHeight: 1.5 }}>
                  Ative o e-mail ou conecte o Telegram para saber quando suas trilhas estão liberadas — antes de acordar cedo à toa.
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                  {['Report diário de condições', 'Alerta de trilha liberada', 'Horário personalizável'].map(txt => (
                    <span key={txt} style={{ fontSize: 11, color: '#9AA093', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <IconCheck size={11} strokeWidth={2.5} color="#22C55E" />
                      {txt}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Link href="/perfil" style={BONE_BUTTON_STYLE}>
              Ativar notificações →
            </Link>
          </div>
        </div>
      )}

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1.5px',
              textTransform: 'uppercase', color: '#6d745f',
            }}>
              Minhas trilhas favoritas
            </span>
            <Link href="/favoritas" style={BONE_BUTTON_STYLE}>
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
            border: '1px solid rgba(124,58,237,.28)',
            borderRadius: 12, padding: '15px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(124,58,237,.22)', border: '1px solid rgba(124,58,237,.38)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <IconSun size={16} stroke={2} color="#A78BFA" />
              </span>
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 700, color: '#fff', margin: '0 0 3px' }}>
                  Pump Tracks no Brasil
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 11, color: 'rgba(156,163,175,.8)', margin: 0 }}>
                  Locais homologados com previsão do tempo e navegação via Waze
                </p>
              </div>
            </div>
            <span style={{
              fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#A78BFA',
              fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              Ver locais →
            </span>
          </div>
        </Link>

      </div>

      <PWAInstallPrompt />
    </div>
  )
}
