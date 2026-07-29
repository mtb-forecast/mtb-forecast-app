import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { IconLock } from '@tabler/icons-react'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import FollowButton from '@/components/FollowButton'
import { selecionarVeredicto } from '@/lib/veredicto'
import { formatLocalidade } from '@/lib/geocoding'
import { condicoesArray } from '@/lib/display'

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

function chipStyle(v: string | null): { bg: string; color: string } {
  if (!v) return { bg: '#F3F4F6', color: '#9AA093' }
  const u = v.toUpperCase()
  if (u.includes('EVITAR') || u.includes('ESPERAR') || u.includes('AGUARDAR')) return { bg: '#EF4444', color: '#FFFFFF' }
  if (u.includes('ALERTA')) return { bg: '#F59E0B', color: '#0E0F0D' }
  if (u.includes('LIBERADO')) return { bg: '#22C55E', color: '#0E0F0D' }
  return { bg: '#F3F4F6', color: '#9AA093' }
}

type TrilhaFavorita = {
  id: string
  name: string
  regiao: string
  localidades: { cidade: string; estado: string; localidade: string | null } | null
  condicoes: { veredicto: string | null; veredicto_12h: string | null }[] | null
}

export default async function PerfilPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const sb = await createSupabaseServerClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) redirect('/login')

  const viewerId = session.user.id
  const { id: targetId } = await params

  if (viewerId === targetId) redirect('/perfil')

  const { data: profile } = await sb
    .from('profiles')
    .select('id, apelido, nome, avatar_url')
    .eq('id', targetId)
    .single()

  if (!profile) notFound()

  const { data: seguindoRow } = await sb
    .from('seguidores')
    .select('id')
    .eq('follower_id', viewerId)
    .eq('following_id', targetId)
    .maybeSingle()

  const isFollowing = !!seguindoRow
  const displayName = profile.apelido || profile.nome || 'Rider'
  const initials = displayName[0]?.toUpperCase() ?? '?'

  let trilhas: TrilhaFavorita[] = []

  if (isFollowing) {
    const { data: favRows } = await sb
      .from('favoritos')
      .select('trilha_id')
      .eq('user_id', targetId)

    const trilhaIds = (favRows ?? []).map((f: { trilha_id: string }) => f.trilha_id)

    if (trilhaIds.length > 0) {
      const { data } = await sb
        .from('trilhas')
        .select(`
          id, name, regiao,
          localidades(cidade, estado, localidade),
          condicoes(veredicto, veredicto_12h, gerado_em)
        `)
        .in('id', trilhaIds)
        .eq('aprovada', true)
        .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
        .limit(1, { foreignTable: 'condicoes' })

      trilhas = (data ?? []) as unknown as TrilhaFavorita[]
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: '#0E0F0D',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: '#2a2e25', border: '1.5px solid rgba(244,243,239,.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={displayName} width={64} height={64} style={{ objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 24, fontWeight: 700, color: '#c9cdbf' }}>{initials}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                fontSize: 'clamp(28px, 4vw, 40px)', textTransform: 'uppercase',
                lineHeight: 0.95, color: '#F4F3EF', margin: 0,
              }}>
                {displayName}
              </h1>
            </div>
            <FollowButton targetUserId={targetId} initialFollowing={isFollowing} />
          </div>
          <div style={{ height: 1, background: 'rgba(109,116,95,.25)', marginTop: 22 }} />
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div style={{ padding: '24px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        {!isFollowing ? (
          <div style={{
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
            padding: '48px 24px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
          }}>
            <IconLock size={28} style={{ color: '#9AA093', marginBottom: 12 }} />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', margin: 0 }}>
              Siga {displayName} para ver as trilhas favoritas dele/dela
            </p>
          </div>
        ) : trilhas.length === 0 ? (
          <div style={{
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
            padding: '48px 24px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
          }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', margin: 0 }}>
              Ainda não favoritou nenhuma trilha.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12,
          }}>
            {trilhas.map(t => {
              const cond = condicoesArray(t.condicoes)[0]
              const veredicto = selecionarVeredicto(cond?.veredicto, cond?.veredicto_12h)
              const cs = chipStyle(veredicto)
              return (
                <Link key={t.id} href={`/trilhas/${t.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: '#fff', borderRadius: 12,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: 14,
                  }}>
                    <span style={{
                      display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '3px 9px',
                      borderRadius: 6, background: cs.bg, color: cs.color, marginBottom: 8,
                      textTransform: 'uppercase', letterSpacing: '.4px',
                    }}>
                      {veredicto ?? 'Aguardando'}
                    </span>
                    <p style={{
                      fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                      fontSize: 18, textTransform: 'uppercase', color: '#1A1D18', margin: '0 0 4px',
                    }}>
                      {t.name}
                    </p>
                    <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#6d745f', margin: 0 }}>
                      {formatLocalidade(t.localidades, t.regiao)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
