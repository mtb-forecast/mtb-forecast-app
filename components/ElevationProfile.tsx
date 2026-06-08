import Image from 'next/image'

type Props = {
  elevationProfileUrl: string | null
  desnivel_m?: number | null
  extensao_km?: number | null
  altitude_m?: number | null
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#2a2e25' }}>{value}</div>
    </div>
  )
}

export default function ElevationProfile({ elevationProfileUrl, desnivel_m, extensao_km, altitude_m }: Props) {
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', background: '#f8fafc', border: '1px solid rgba(0,0,0,0.08)' }}>
      {elevationProfileUrl && (
        <div style={{ position: 'relative', width: '100%', height: 90 }}>
          <Image
            src={elevationProfileUrl}
            alt="Perfil de elevação"
            fill
            sizes="(max-width: 768px) 100vw, 600px"
            style={{ objectFit: 'cover', opacity: 0.9 }}
          />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 16px' }}>
        <Stat label="Desnível" value={desnivel_m != null ? `${Math.round(desnivel_m)}m` : '—'} />
        <Stat label="Distância" value={extensao_km != null ? `${extensao_km}km` : '—'} />
        <Stat label="Alt. máx." value={altitude_m != null ? `${altitude_m}m` : '—'} />
      </div>
    </div>
  )
}
