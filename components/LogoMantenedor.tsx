import { resolverIcone } from '@/lib/mantenedor-icones'

type Props = {
  mantenedor: {
    nome: string
    nome_primario: string | null
    nome_secundario: string | null
    cor_primaria: string
    cor_secundaria: string | null
    icone: string | null
  }
  contexto: 'card' | 'pagina'
}

export function LogoMantenedor({ mantenedor, contexto }: Props) {
  const isCard    = contexto === 'card'
  const iconSize  = isCard ? 12 : 16
  const corIcone  = mantenedor.cor_secundaria ?? mantenedor.cor_primaria
  const primario  = mantenedor.nome_primario ?? mantenedor.nome
  const secundario = mantenedor.nome_secundario
  const iconeEl   = resolverIcone(mantenedor.icone, corIcone, iconSize)

  const label = (
    <span style={{
      fontSize: 9,
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
      {iconeEl}
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
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingTop: 12, borderTop: '0.5px solid #3a3f30',
      }}>
        {label}
        {logoContent}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginTop: 7, paddingTop: 7,
      borderTop: '0.5px solid #eaece4',
    }}>
      {label}
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
