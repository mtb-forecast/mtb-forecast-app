import Link from 'next/link'
import DashboardTrailCard from '@/components/DashboardTrailCard'
import type { TrilhaComCondicao } from '@/lib/types'

type Props = {
  initialTrilhas: TrilhaComCondicao[]
}

export default function FavoritasGrid({ initialTrilhas }: Props) {
  if (initialTrilhas.length === 0) {
    return (
      <div style={{
        background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
        padding: '40px 24px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)',
      }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', marginBottom: 16 }}>
          Você ainda não tem trilhas favoritas.
        </p>
        <Link href="/trilhas" style={{
          background: '#1A1D18', color: '#F4F3EF', fontWeight: 700,
          borderRadius: 999, padding: '8px 20px', fontSize: 13,
          textDecoration: 'none', display: 'inline-block',
        }}>
          Explorar trilhas
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {initialTrilhas.map(t => (
        <DashboardTrailCard key={t.id} trilha={t} />
      ))}
    </div>
  )
}
