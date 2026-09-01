import Link from 'next/link'
import { IconRoute } from '@tabler/icons-react'
import { selecionarVeredicto } from '@/lib/veredicto'

// Badge por trecho — mesma paleta/regra de prioridade EVITAR > ALERTA > LIBERADO
// usada em TrilhaCard/DashboardTrailCard (CLAUDE.md: nunca comparação exata de
// string para veredicto, sempre .includes() case-insensitive).
function badge(v: string | null): { bg: string; color: string; label: string } {
  if (!v) return { bg: '#F3F4F6', color: '#9CA3AF', label: 'Sem dados' }
  const u = v.toUpperCase()
  if (u.includes('EVITAR') || u.includes('ESPERAR')) return { bg: '#FEE2E2', color: '#B91C1C', label: 'Evitar' }
  if (u.includes('ALERTA'))                          return { bg: '#FEF9C3', color: '#A16207', label: 'Alerta' }
  if (u.includes('LIBERADO'))                        return { bg: '#DCFCE7', color: '#15803D', label: 'Liberado' }
  return { bg: '#F3F4F6', color: '#9CA3AF', label: v }
}

export type SegmentoTrilha = {
  id: string
  name: string
  veredicto: string | null
  veredicto_12h?: string | null
}

type Props = {
  segmentos: SegmentoTrilha[]
  origemTrecho?: string | null
}

export default function TrilhaSegmentosBreakdown({ segmentos, origemTrecho }: Props) {
  if (!segmentos.length) return null

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16,
      padding: 18, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <IconRoute size={15} strokeWidth={2} color="#6d745f" />
        <p style={{
          fontFamily: 'var(--font-dm-mono)', fontSize: 10, fontWeight: 500,
          letterSpacing: '1.5px', color: '#9CA3AF', textTransform: 'uppercase', margin: 0,
        }}>
          Este percurso passa por {segmentos.length} trecho{segmentos.length !== 1 ? 's' : ''}
        </p>
      </div>

      {origemTrecho && (
        <p style={{ fontSize: 12.5, color: '#6B7280', margin: '0 0 12px', lineHeight: 1.5 }}>
          O veredicto acima considera o trecho <strong style={{ color: '#1A1D18' }}>{origemTrecho}</strong>, que está pior que o restante do percurso.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segmentos.map(s => {
          const veredictoText = selecionarVeredicto(s.veredicto, s.veredicto_12h)
          const b = badge(veredictoText)
          return (
            <Link
              key={s.id}
              href={`/trilhas/${s.id}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
                background: '#F8F9F5', border: '1px solid rgba(0,0,0,.06)',
              }}
            >
              <span style={{ fontSize: 13.5, color: '#1A1D18', fontWeight: 600 }}>
                {s.name}
              </span>
              <span style={{
                fontFamily: 'var(--font-dm-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.5px', textTransform: 'uppercase',
                background: b.bg, color: b.color, borderRadius: 999, padding: '3px 9px',
                flexShrink: 0,
              }}>
                {b.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
