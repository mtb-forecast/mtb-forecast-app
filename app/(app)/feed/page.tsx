import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import FeedEventCard from '@/components/FeedEventCard'
import type { FeedItem, FeedEvento, Observacao } from '@/lib/types'

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

export default async function FeedPage() {
  const sb = await createSupabaseServerClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) redirect('/login')

  const userId = session.user.id

  const [{ data: favRows }, { data: followingRows }] = await Promise.all([
    sb.from('favoritos').select('trilha_id').eq('user_id', userId),
    sb.from('seguidores').select('following_id').eq('follower_id', userId),
  ])

  const trilhaIds = (favRows ?? []).map((f: { trilha_id: string }) => f.trilha_id)
  const followingIds = (followingRows ?? []).map((f: { following_id: string }) => f.following_id)

  let items: FeedItem[] = []

  if (trilhaIds.length > 0 || followingIds.length > 0) {
    const eventosPromise = trilhaIds.length > 0
      ? sb
          .from('feed_eventos')
          .select('id, trilha_id, tipo, texto, veredicto, created_at')
          .in('trilha_id', trilhaIds)
          .order('created_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as FeedEvento[] })

    // Avaliações de trilhas favoritadas OU de usuários seguidos (mesmo em trilhas não favoritadas)
    let obsQuery = sb
      .from('observacoes_trilha')
      .select('id, trilha_id, user_id, estrelas, texto, condicao_encontrada, veredicto_sistema, created_at, profiles (apelido, nome, email)')

    if (trilhaIds.length > 0 && followingIds.length > 0) {
      obsQuery = obsQuery.or(`trilha_id.in.(${trilhaIds.join(',')}),user_id.in.(${followingIds.join(',')})`)
    } else if (trilhaIds.length > 0) {
      obsQuery = obsQuery.in('trilha_id', trilhaIds)
    } else {
      obsQuery = obsQuery.in('user_id', followingIds)
    }

    const [{ data: eventos }, { data: observacoes }] = await Promise.all([
      eventosPromise,
      obsQuery.order('created_at', { ascending: false }).limit(30),
    ])

    const trilhaIdsParaNome = Array.from(new Set([
      ...(eventos ?? []).map((e: FeedEvento) => e.trilha_id),
      ...((observacoes ?? []) as unknown as Observacao[]).map(o => o.trilha_id).filter(Boolean) as string[],
    ]))

    const { data: trilhasData } = trilhaIdsParaNome.length > 0
      ? await sb.from('trilhas').select('id, name').in('id', trilhaIdsParaNome)
      : { data: [] as { id: string; name: string }[] }

    const nomeById = new Map((trilhasData ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

    const eventoItems: FeedItem[] = ((eventos ?? []) as FeedEvento[]).map(e => ({
      kind: 'pipeline',
      ...e,
      trilha_nome: nomeById.get(e.trilha_id),
    }))

    const obsItems: FeedItem[] = ((observacoes ?? []) as unknown as Observacao[]).map(o => ({
      kind: 'avaliacao',
      ...o,
      trilha_nome: o.trilha_id ? nomeById.get(o.trilha_id) : undefined,
    }))

    items = [...eventoItems, ...obsItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: '#141612',
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
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto' }}>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(36px, 5vw, 50px)', textTransform: 'uppercase',
            lineHeight: 0.95, color: '#F4F3EF', margin: 0,
          }}>
            Feed
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', marginTop: 8, marginBottom: 0 }}>
            Atividade das suas trilhas favoritas e de quem você segue
          </p>
          <div style={{ height: 1, background: 'rgba(109,116,95,.25)', marginTop: 20 }} />
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div style={{ padding: '24px 28px 48px', maxWidth: 760, margin: '0 auto' }}>
        {items.length === 0 ? (
          <div style={{
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
            padding: '40px 24px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
          }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', marginBottom: 16 }}>
              {trilhaIds.length === 0 && followingIds.length === 0
                ? 'Favorite trilhas ou siga outros riders para acompanhar a atividade deles por aqui.'
                : 'Nenhuma atividade ainda.'}
            </p>
            <Link href="/trilhas" style={{
              background: '#1A1D18', color: '#F4F3EF', fontWeight: 700,
              fontFamily: 'var(--font-barlow-condensed)', textTransform: 'uppercase',
              letterSpacing: '.5px', fontSize: 14, borderRadius: 999,
              padding: '9px 22px', textDecoration: 'none', display: 'inline-block',
            }}>
              Explorar trilhas →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(item => (
              <FeedEventCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
