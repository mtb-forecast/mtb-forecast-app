import { memo } from 'react'

type Props = {
  mantenedor: {
    nome: string
    nome_primario: string | null
    nome_secundario: string | null
    cor_primaria: string
    cor_secundaria: string | null
    site_url?: string | null
  }
  contexto: 'card' | 'pagina'
}

function LogoMantenedorInner({ mantenedor, contexto }: Props) {
  const isCard    = contexto === 'card'
  const primario  = mantenedor.nome_primario ?? mantenedor.nome
  const secundario = mantenedor.nome_secundario

  const label = (
    <span style={{
      fontSize: 10,
      color: isCard ? '#8a9480' : '#6d745f',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      whiteSpace: 'nowrap',
    }}>
      mantida por
    </span>
  )

  const logoContent = (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      gap: isCard ? 4 : 6,
    }}>
      <span style={{
        fontSize: isCard ? 9 : 10,
        fontWeight: 700,
        color: mantenedor.cor_primaria,
        letterSpacing: '0.8px',
      }}>
        {primario}
      </span>
      {secundario && (
        <span style={{
          fontSize: isCard ? 10 : 11,
          fontWeight: 600,
          color: mantenedor.cor_secundaria ?? mantenedor.cor_primaria,
          letterSpacing: '0.2px',
        }}>
          {secundario}
        </span>
      )}
    </div>
  )

  if (contexto === 'pagina') {
    const { site_url } = mantenedor
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingTop: 12, borderTop: '0.5px solid #3a3f30',
        flexWrap: 'wrap',
      }}>
        {label}
        {logoContent}
        {site_url && (
          <a
            href={site_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 10, color: '#6d8a60',
              textDecoration: 'none', letterSpacing: '0.3px',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            site
          </a>
        )}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginTop: 7, paddingTop: 7,
      borderTop: '0.5px solid #eaece4',
    }}>
      <div style={{
        background: '#1e2018', borderRadius: 4,
        padding: '2px 7px 2px 5px',
        display: 'inline-flex', alignItems: 'center',
      }}>
        {logoContent}
      </div>
    </div>
  )
}

export const LogoMantenedor = memo(LogoMantenedorInner)
