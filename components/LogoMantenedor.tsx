import Image from 'next/image'

type Props = {
  mantenedor: { nome: string; logo_url: string | null }
  contexto: 'card' | 'pagina'
}

export function LogoMantenedor({ mantenedor, contexto }: Props) {
  const label = (
    <span style={{
      fontSize: 9,
      color: contexto === 'pagina' ? '#6d745f' : '#8a9480',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      whiteSpace: 'nowrap',
    }}>
      mantida por
    </span>
  )

  const logo = mantenedor.logo_url ? (
    <div style={{
      position: 'relative',
      width: contexto === 'card' ? 100 : 120,
      height: contexto === 'card' ? 16 : 20,
      flexShrink: 0,
    }}>
      <Image
        src={mantenedor.logo_url}
        alt={mantenedor.nome}
        fill
        style={{ objectFit: 'contain', objectPosition: 'left center' }}
      />
    </div>
  ) : (
    <span style={{
      fontSize: contexto === 'card' ? 10 : 11,
      fontWeight: 600,
      color: contexto === 'pagina' ? '#c9a010' : '#b8960c',
    }}>
      {mantenedor.nome}
    </span>
  )

  if (contexto === 'pagina') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingTop: 12, borderTop: '0.5px solid #3a3f30',
      }}>
        {label}
        {logo}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginTop: 7, paddingTop: 7, borderTop: '0.5px solid #eaece4',
    }}>
      {label}
      <div style={{
        background: '#1e2018', borderRadius: 4,
        padding: '2px 6px', display: 'inline-flex',
        alignItems: 'center', height: 20,
      }}>
        {logo}
      </div>
    </div>
  )
}
