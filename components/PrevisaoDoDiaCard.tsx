import {
  IconSun, IconCloud, IconCloudRain, IconCloudStorm,
  IconDroplet, IconUmbrella, IconWind,
  IconCircleCheck, IconAlertTriangle, IconClockPause,
} from '@tabler/icons-react'

type TablerIcon = React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>

type Props = {
  // 'mtb': dado vem de condicoes.fds_dN (D+1 a D+3) — inclui veredicto do pipeline.
  // 'clima': além de D+3, só previsão do tempo bruta (Open-Meteo) — sem análise de solo/aderência.
  tipo: 'mtb' | 'clima'
  dataLabel: string
  veredicto?: string | null
  rain: number | null
  windKmh: number | null
  pop: number | null
  tmax: number | null
  tmin: number | null
}

function weatherIcon(rain: number | null, pop: number | null): { Icon: TablerIcon; color: string } {
  const r = rain ?? 0
  const p = pop ?? 0
  if (r >= 10 || (r >= 5 && p >= 70)) return { Icon: IconCloudStorm as TablerIcon, color: '#64748B' }
  if (r >= 2 || p >= 60) return { Icon: IconCloudRain as TablerIcon, color: '#64748B' }
  if (r >= 0.5 || p >= 35) return { Icon: IconCloudRain as TablerIcon, color: '#94A3B8' }
  if (p < 20 && r < 0.5) return { Icon: IconSun as TablerIcon, color: '#E6A817' }
  return { Icon: IconCloud as TablerIcon, color: '#94A3B8' }
}

function verdictVisual(v: string | null | undefined): { Icon: TablerIcon | null; color: string; label: string } {
  if (!v) return { Icon: null, color: '#9CA3AF', label: 'Sem previsão ainda' }
  if (v.trim() === 'DROP LIBERADO') return { Icon: IconCircleCheck as TablerIcon, color: '#16A34A', label: 'Drop liberado' }
  if (v.includes('Veja os alertas')) return { Icon: IconAlertTriangle as TablerIcon, color: '#D97706', label: 'Veja os alertas' }
  if (v.includes('MELHOR ESPERAR')) return { Icon: IconClockPause as TablerIcon, color: '#DC2626', label: 'Melhor esperar' }
  return { Icon: null, color: '#9CA3AF', label: v }
}

export default function PrevisaoDoDiaCard({ tipo, dataLabel, veredicto, rain, windKmh, pop, tmax, tmin }: Props) {
  const wi = weatherIcon(rain, pop)
  const vi = tipo === 'mtb' ? verdictVisual(veredicto) : null

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', color: '#1A1D18' }}>
          {dataLabel}
        </span>
        {tipo === 'clima' && (
          <span style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>
            só previsão do tempo — análise de solo aparece a partir de 3 dias antes
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: tipo === 'mtb' ? 10 : 16 }}>
        <wi.Icon size={30} style={{ color: wi.color, opacity: 0.8, flexShrink: 0 }} />
        <div>
          <span style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontWeight: 800, fontSize: 38, lineHeight: 1, color: '#111' }}>
            {tmax != null ? `${Math.round(tmax)}°` : '—'}
          </span>
          <span style={{ fontSize: 15, color: '#9CA3AF', marginLeft: 4 }}>
            / {tmin != null ? `${Math.round(tmin)}°` : '—'}
          </span>
        </div>
      </div>

      {tipo === 'mtb' && vi && (
        <div style={{ fontSize: 13, fontWeight: 700, color: vi.color, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
          {vi.Icon && <vi.Icon size={15} />}
          {vi.label}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconDroplet size={14} style={{ opacity: 0.6 }} />
          {rain != null ? `${rain.toFixed(1)}mm` : '—'}
        </span>
        <span style={{ fontSize: 13, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconUmbrella size={14} style={{ opacity: 0.6 }} />
          {pop != null ? `${Math.round(pop)}%` : '—'}
        </span>
        <span style={{ fontSize: 13, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconWind size={14} style={{ opacity: 0.6 }} />
          {windKmh != null ? `${Math.round(windKmh)} km/h` : '—'}
        </span>
      </div>
    </div>
  )
}
