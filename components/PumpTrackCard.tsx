import { memo } from 'react'
import Link from 'next/link'
import {
  IconDroplet, IconWind, IconTemperature,
  IconBulb, IconParking, IconBrandInstagram, IconArrowRight,
} from '@tabler/icons-react'
import { PumpTrack } from '@/lib/types'
import { rainColor, windColor } from '@/lib/display'

type Props = {
  pt: PumpTrack
}

function surfaceColor(s: string | null): string {
  if (!s) return '#6B7280'
  const lower = s.toLowerCase()
  if (lower.includes('asfalto') || lower.includes('concreto')) return '#374151'
  if (lower.includes('terra') || lower.includes('saibro')) return '#92400E'
  return '#6B7280'
}

function PumpTrackCard({ pt }: Props) {
  const c = pt.condicao
  const wazeUrl = `https://waze.com/ul?ll=${pt.latitude},${pt.longitude}&navigate=yes`
  const isHomologado = pt.status_validacao?.includes('Homologado')

  const hasInstagram = pt.instagram && pt.instagram !== 'N/I'
  const instagramHandle = hasInstagram ? pt.instagram!.replace('@', '') : null

  const pill: React.CSSProperties = {
    fontSize: '0.68rem', color: '#6B7280', background: '#F3F4F6',
    borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap',
  }

  return (
    <div
      style={{
        background: '#FFFFFF', borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        display: 'flex', overflow: 'hidden',
        transition: 'box-shadow 0.2s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.10)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)')}
    >
      {/* Barra vertical — cor fixa de pumptrack */}
      <div style={{ width: 6, flexShrink: 0, background: '#7C3AED' }} />

      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Nome + badge homologado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111111', lineHeight: 1.3, flex: 1, margin: 0 }}>
            {pt.nome}
          </h3>
          {isHomologado && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, color: '#7C3AED',
              background: '#EDE9FE', borderRadius: 999, padding: '2px 8px',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              ✓ Homologado
            </span>
          )}
        </div>

        {/* Pills: cidade/UF, superfície, comprimento */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span style={{ ...pill, background: '#EDE9FE', color: '#7C3AED' }}>
            Pump Track
          </span>
          {pt.cidade && pt.uf && (
            <span style={pill}>{pt.cidade}, {pt.uf}</span>
          )}
          {pt.tipo_superficie && (
            <span style={{ ...pill, color: surfaceColor(pt.tipo_superficie) }}>
              {pt.tipo_superficie}
            </span>
          )}
          {pt.comprimento_estimado && (
            <span style={pill}>{pt.comprimento_estimado}</span>
          )}
        </div>

        {/* Endereço */}
        {pt.endereco && (
          <p style={{ fontSize: 11, color: '#6B7280', margin: 0, lineHeight: 1.4 }}>
            📍 {pt.endereco}
          </p>
        )}

        {/* Forecast */}
        {c ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {c.rain_mm != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '4px 10px' }}>
                <IconDroplet size={12} style={{ color: rainColor(c.rain_mm) }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: rainColor(c.rain_mm) }} className="font-mono">{c.rain_mm.toFixed(1)}mm</span>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>chuva 24h</span>
              </div>
            )}
            {c.wind_kmh != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '4px 10px' }}>
                <IconWind size={12} style={{ color: windColor(c.wind_kmh) }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: windColor(c.wind_kmh) }} className="font-mono">{c.wind_kmh.toFixed(0)} km/h</span>
                <span style={{ fontSize: 10, color: '#9CA3AF' }}>vento 24h</span>
              </div>
            )}
            {c.temp_max != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '4px 10px' }}>
                <IconTemperature size={12} style={{ color: '#F59E0B' }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: '#374151' }} className="font-mono">{Math.round(c.temp_max)}°C</span>
                {c.temp_min != null && <span style={{ fontSize: 10, color: '#9CA3AF' }} className="font-mono">/ {Math.round(c.temp_min)}°</span>}
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: '0.75rem', color: '#9CA3AF', fontStyle: 'italic', margin: 0 }}>
            Previsão ainda não disponível.
          </p>
        )}

        {/* Infos: iluminação + estacionamento */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pt.iluminacao && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280' }}>
              <IconBulb size={12} />
              Iluminação: {pt.iluminacao}
            </span>
          )}
          {pt.estacionamento && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280' }}>
              <IconParking size={12} />
              {pt.estacionamento}
            </span>
          )}
        </div>

        {/* Footer: Waze + Instagram + atualizado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Waze */}
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#05C8F7', color: '#fff',
                borderRadius: 20, padding: '5px 12px',
                fontSize: '0.75rem', fontWeight: 600,
                textDecoration: 'none', flexShrink: 0,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.236 2.636 7.855 6.356 9.312-.08-.717-.148-1.863.027-2.645.158-.7 1.045-4.43 1.045-4.43s-.267-.533-.267-1.322c0-1.24.72-2.168 1.613-2.168.762 0 1.13.572 1.13 1.257 0 .766-.487 1.912-.74 2.977-.21.888.446 1.61 1.32 1.61 1.585 0 2.648-2.025 2.648-4.422 0-1.826-1.234-3.102-2.996-3.102-2.04 0-3.238 1.53-3.238 3.11 0 .614.236 1.272.53 1.632.059.07.067.133.05.205-.054.223-.174.712-.198.81-.032.13-.106.158-.244.095-1.124-.524-1.827-2.17-1.827-3.494 0-2.842 2.065-5.453 5.953-5.453 3.124 0 5.55 2.227 5.55 5.2 0 3.103-1.956 5.597-4.672 5.597-.912 0-1.77-.474-2.063-1.033l-.561 2.096c-.203.78-.75 1.758-1.118 2.353C10.642 21.97 11.314 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
              </svg>
              Como chegar
            </a>

            {/* Instagram */}
            {instagramHandle && (
              <a
                href={`https://instagram.com/${instagramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: '#6B7280', textDecoration: 'none',
                }}
              >
                <IconBrandInstagram size={14} />
                <span>{pt.instagram}</span>
              </a>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {c?.gerado_em && (
              <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                Atualizado às {new Date(c.gerado_em).toLocaleTimeString('pt-BR', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
                })}
              </span>
            )}
            <Link
              href={`/pump-track/${pt.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', marginLeft: 'auto' }}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#111111' }}>Ver detalhes</span>
              <span style={{ background: '#EDE9FE', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconArrowRight size={13} style={{ color: '#7C3AED' }} />
              </span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}

export default memo(PumpTrackCard)
