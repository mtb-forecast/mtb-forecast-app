import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import FollowButton from '@/components/FollowButton'

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

type ProfileMini = { id: string; apelido: string | null; nome: string | null; avatar_url: string | null }

type FavoritoComProfile = {
  id: string
  user_id: string
  profiles: ProfileMini | null
}

export default async function TrilhaFavoritosPage({ params }: { params: Promise<{ id: string }> }) {
  const sb = await createSupabaseServerClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) redirect('/login')

  const { id: trilhaId } = await params

  const { data: trilha } = await sb
    .from('trilhas')
    .select('id, name')
    .eq('id', trilhaId)
    .single()

  if (!trilha) notFound()

  // Busca em duas etapas (favoritos + profiles) em vez de embed aninhado —
  // evita depender de o cache de relacionamento do PostgREST resolver
  // favoritos.user_id -> profiles.id sem ambiguidade.
  const { data: favoritos } = await sb
    .from('favoritos')
    .select('id, user_id')
    .eq('trilha_id', trilhaId)

  const userIds = Array.from(new Set((favoritos ?? []).map(f => f.user_id)))

  const { data: profilesData } = userIds.length > 0
    ? await sb.from('profiles').select('id, apelido, nome, avatar_url').in('id', userIds)
    : { data: [] as ProfileMini[] }

  const profileById = new Map((profilesData ?? []).map(p => [p.id, p as ProfileMini]))

  const rows: FavoritoComProfile[] = (favoritos ?? []).map(f => ({
    id: f.id,
    user_id: f.user_id,
    profiles: profileById.get(f.user_id) ?? null,
  }))

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: '#0E0F0D',
        borderBottom: '1px solid rgba(109,116,95,.25)', padding: '28px 28px 22px',
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
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>
          <Link href={`/trilhas/${trilhaId}`} style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1px',
            color: 'rgba(154,160,147,.7)', textDecoration: 'none',
            display: 'inline-block', marginBottom: 14,
          }}>
            ← {trilha.name}
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(28px, 5vw, 40px)', textTransform: 'uppercase',
            lineHeight: 0.95, color: '#F4F3EF', margin: 0,
          }}>
            {rows.length} favoritado{rows.length !== 1 ? 's' : ''}
          </h1>
          <div style={{ height: 1, background: 'rgba(109,116,95,.25)', marginTop: 20 }} />
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div style={{ padding: '24px 28px 48px', maxWidth: 720, margin: '0 auto' }}>
        {rows.length === 0 ? (
          <div style={{
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
            padding: '40px 24px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
          }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', margin: 0 }}>
              Ninguém favoritou essa trilha ainda.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(row => {
              const p = row.profiles
              const displayName = p?.apelido || p?.nome || 'Rider'
              const initials = displayName[0]?.toUpperCase() ?? '?'
              return (
                <div key={row.id} style={{
                  background: '#fff', borderRadius: 12,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '10px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <Link
                    href={`/perfil/${row.user_id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', minWidth: 0 }}
                  >
                    {p?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt="" style={{
                        width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                      }} />
                    ) : (
                      <span style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: '#eef1e9', color: '#6d745f',
                        fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {initials}
                      </span>
                    )}
                    <span style={{
                      fontSize: 14, fontWeight: 600, color: '#1A1D18',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {displayName}
                    </span>
                  </Link>
                  {p?.id && <FollowButton targetUserId={p.id} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
