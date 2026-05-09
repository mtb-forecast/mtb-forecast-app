import Link from 'next/link'
import { TrilhaComCondicao, VEREDICTO_CONFIG, ADERENCIA_CONFIG } from '@/lib/types'

type Props = {
  trilha: TrilhaComCondicao
  isFavorito?: boolean
  onToggleFavorito?: () => void
}

export default function TrilhaCard({ trilha, isFavorito, onToggleFavorito }: Props) {
  const c = trilha.condicao

  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const acfg = c?.aderencia_status ? (ADERENCIA_CONFIG[c.aderencia_status] ?? null) : null
  const hasData = c != null && vcfg != null

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: '#ffffff',
        border: '1px solid #E0E0E0',
        borderLeft: `3px solid ${vcfg?.cor ?? '#E0E0E0'}`,
      }}
    >
      <div className="p-4 flex-1">
        {/* Nome + favoritar */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-[#111111] text-sm leading-tight flex-1 line-clamp-2">
            {trilha.name}
          </h3>
          {onToggleFavorito && (
            <button
              onClick={(e) => { e.preventDefault(); onToggleFavorito() }}
              className="text-lg flex-shrink-0 leading-none transition-colors"
              style={{ color: isFavorito ? '#FFE000' : '#CCCCCC' }}
            >
              {isFavorito ? '★' : '☆'}
            </button>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {trilha.bioma && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#F5F5F5', color: '#555555', border: '1px solid #E0E0E0' }}>
              {trilha.bioma}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#F5F5F5', color: '#555555', border: '1px solid #E0E0E0' }}>
            {trilha.trail_type === 'bikepark' ? '🏟 Bike Park' : '🏔 Natural'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#F5F5F5', color: '#555555', border: '1px solid #E0E0E0' }}>
            {trilha.regiao}
          </span>
        </div>

        {hasData && c ? (
          <>
            {/* Pills: aderência + veredicto 12h */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {acfg && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold"
                  style={{ color: acfg.cor, background: acfg.cor + '18', border: `1px solid ${acfg.cor}33` }}
                >
                  {acfg.emoji} {c.aderencia_status}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold"
                style={{ color: vcfg.cor, background: vcfg.bg, border: `1px solid ${vcfg.cor}33` }}
              >
                {vcfg.emoji} {veredictoText}
              </span>
            </div>

            {/* Métricas */}
            <div className="flex items-center gap-2 text-xs mb-2 flex-wrap" style={{ color: '#555555' }}>
              <span>🌧 <b>{c.acumulo_48h?.toFixed(1) ?? '—'}mm</b></span>
              {c.pico_3h != null && c.pico_3h > 0 && (
                <span className="text-red-500">⚡ <b>{c.pico_3h.toFixed(1)}mm</b> pico</span>
              )}
              <span>💨 <b>{c.wind_ms?.toFixed(1) ?? '—'}m/s</b></span>
            </div>

            {c.frase_secagem && (
              <p className="text-xs truncate mb-2" style={{ color: '#555555' }}>{c.frase_secagem}</p>
            )}

            {c.janela && (
              <p className="text-xs" style={{ color: '#555555' }}>
                🕐 Janela: <span className="font-medium text-[#111111]">{c.janela}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-xs italic" style={{ color: '#999999' }}>Condição ainda não calculada.</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5" style={{ borderTop: '1px solid #E0E0E0' }}>
        <Link
          href={`/trilhas/${trilha.id}`}
          className="block w-full text-center text-xs font-semibold transition-colors"
          style={{ color: '#111111' }}
        >
          Ver detalhes →
        </Link>
      </div>
    </div>
  )
}
