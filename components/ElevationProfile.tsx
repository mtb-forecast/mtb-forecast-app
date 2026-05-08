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
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

export default function ElevationProfile({ elevationProfileUrl, desnivel_m, extensao_km, altitude_m }: Props) {
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', background: '#f8fafc', border: '1px solid rgba(0,0,0,0.08)' }}>
      {elevationProfileUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={elevationProfileUrl}
          alt="Perfil de elevação"
          style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block', opacity: 0.9 }}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 16px' }}>
        <Stat label="Desnível" value={desnivel_m != null ? `${Math.round(desnivel_m)}m` : '—'} />
        <Stat label="Distância" value={extensao_km != null ? `${extensao_km}km` : '—'} />
        <Stat label="Alt. máx." value={altitude_m != null ? `${altitude_m}m` : '—'} />
      </div>
    </div>
  )
}
