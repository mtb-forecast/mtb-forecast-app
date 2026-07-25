import Link from 'next/link'
import { IconBolt, IconStar, IconStarFilled, IconUserPlus, IconArrowRight } from '@tabler/icons-react'
import type { FeedItem, FeedPerfilMini } from '@/lib/types'
import { statusTrilhaLabel } from '@/lib/statusTrilha'

const CONDICOES: Record<string, { label: string; bg: string; color: string }> = {
  seco:  { label: 'Seco',            bg: '#e0f2fe', color: '#0369a1' },
  grip:  { label: 'Grip Perfeito',   bg: '#dcfce7', color: '#166534' },
  boa:   { label: 'Boa Aderência',   bg: '#d1fae5', color: '#065f46' },
  baixa: { label: 'Baixa Aderência', bg: '#fef9c3', color: '#854d0e' },
  lama:  { label: 'Lama / Barro',    bg: '#fee2e2', color: '#991b1b' },
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

function Avatar({ name, avatarUrl, size = 26 }: { name: string; avatarUrl?: string | null; size?: number }) {
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" style={{
      width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
    }} />
  ) : (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#eef1e9', color: '#6d745f',
      fontSize: 11, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {getInitials(name)}
    </span>
  )
}

function Stars({ count }: { count: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {Array.from({ length: 5 }, (_, i) =>
        i < count
          ? <IconStarFilled key={i} size={13} style={{ color: '#6d745f' }} />
          : <IconStar key={i} size={13} style={{ color: '#e5e5e5' }} />
      )}
    </span>
  )
}

function CardFooter({ createdAt, trilhaId }: { createdAt: string; trilhaId?: string | null }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0',
    }}>
      <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#9AA093' }}>
        {formatDateTime(createdAt)}
      </span>
      {trilhaId && (
        <Link
          href={`/trilhas/${trilhaId}`}
          style={{ fontSize: 12, fontWeight: 600, color: '#6d745f', textDecoration: 'none' }}
        >
          Ver trilha ›
        </Link>
      )}
    </div>
  )
}

function nomePerfil(p?: FeedPerfilMini): string {
  return p?.apelido || p?.nome || 'Rider'
}

export default function FeedEventCard({ item, viewerId }: { item: FeedItem; viewerId?: string }) {
  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: 14,
  }

  if (item.kind === 'seguida') {
    const followerNome = nomePerfil(item.follower_perfil)
    const followingNome = nomePerfil(item.following_perfil)
    const souOFollower = viewerId != null && item.follower_id === viewerId
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: '#eef1e9', display: 'grid', placeItems: 'center',
          }}>
            <IconUserPlus size={14} style={{ color: '#6d745f' }} />
          </span>
          <span style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 10, letterSpacing: '1px',
            textTransform: 'uppercase', color: '#9AA093',
          }}>
            {souOFollower ? 'Você seguiu' : 'Novo seguidor'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link
            href={`/perfil/${item.follower_id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <Avatar name={followerNome} avatarUrl={item.follower_perfil?.avatar_url} size={22} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D18' }}>{followerNome}</span>
          </Link>
          <IconArrowRight size={13} style={{ color: '#9AA093' }} />
          <Link
            href={`/perfil/${item.following_id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <Avatar name={followingNome} avatarUrl={item.following_perfil?.avatar_url} size={22} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D18' }}>{followingNome}</span>
          </Link>
        </div>
        <p style={{ fontSize: 12, color: '#9AA093', margin: '4px 0 0' }}>
          {followerNome} começou a seguir {followingNome}
        </p>

        <CardFooter createdAt={item.created_at} />
      </div>
    )
  }

  if (item.kind === 'pipeline') {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: '#eef1e9', display: 'grid', placeItems: 'center',
          }}>
            <IconBolt size={14} style={{ color: '#6d745f' }} />
          </span>
          <span style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 10, letterSpacing: '1px',
            textTransform: 'uppercase', color: '#9AA093',
          }}>
            Atualização automática
          </span>
        </div>

        {item.trilha_nome && (
          <p style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 18, textTransform: 'uppercase', color: '#1A1D18', margin: '0 0 4px',
          }}>
            {item.trilha_nome}
          </p>
        )}

        {item.texto && (
          <p style={{ fontSize: 13, color: '#444', lineHeight: 1.5, margin: 0 }}>
            {item.texto}
          </p>
        )}

        <CardFooter createdAt={item.created_at} trilhaId={item.trilha_id} />
      </div>
    )
  }

  const nome = item.profiles?.apelido || item.profiles?.nome || item.profiles?.email?.split('@')[0] || 'Rider'
  const condicao = item.condicao_encontrada ? CONDICOES[item.condicao_encontrada] : null

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Link
          href={`/perfil/${item.user_id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
        >
          <Avatar name={nome} avatarUrl={item.profiles?.avatar_url} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D18' }}>{nome}</span>
          <span style={{ fontSize: 12, color: '#9AA093' }}>comentou</span>
        </Link>
        <Stars count={item.estrelas} />
      </div>

      {item.trilha_nome && (
        <p style={{
          fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
          fontSize: 18, textTransform: 'uppercase', color: '#1A1D18', margin: '0 0 6px',
        }}>
          {item.trilha_nome}
        </p>
      )}

      {(condicao || item.status_trilha?.length) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {condicao && (
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 10, background: condicao.bg, color: condicao.color,
            }}>
              Condição: {condicao.label}
            </span>
          )}
          {item.status_trilha?.map(s => {
            const st = statusTrilhaLabel(s)
            return st ? (
              <span key={s} style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px',
                borderRadius: 10, background: st.bg, color: st.color,
              }}>
                {st.label}
              </span>
            ) : null
          })}
        </div>
      )}

      {item.texto && (
        <p style={{ fontSize: 13, color: '#444', lineHeight: 1.5, margin: 0 }}>
          {item.texto}
        </p>
      )}

      <CardFooter createdAt={item.created_at} trilhaId={item.trilha_id!} />
    </div>
  )
}
