import React from 'react'

type IconeProps = { cor: string; size: number }

export function IconeVeado({ cor, size }: IconeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 10 L10 7 L8 5 L6 3 M12 10 L14 7 L16 5 L18 3
           M10 7 L8 8 M14 7 L16 8
           M12 10 L11 13 L13 13 L12 10
           M11 13 L10 17 L14 17 L13 13
           M10 17 L9 20 M14 17 L15 20"
        stroke={cor} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M10 13 L8 14 L9 17 M14 13 L16 14 L15 17"
        stroke={cor} strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function resolverIcone(
  icone: string | null,
  cor: string,
  size: number
): React.ReactNode | null {
  if (!icone) return null
  if (icone === 'veado') return <IconeVeado cor={cor} size={size} />
  return null
}
