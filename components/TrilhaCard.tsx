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
      className="rounded-xl overflow-hidden border-l-4 flex flex-col transition-shadow hover:shadow-lg"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(4px)',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        borderRight: '1px solid rgba(0,0,0,0.08)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        borderLeft: `4px solid ${vcfg?.cor ?? '#94a3b8'}`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
      }}
    >
      <div className="p-4 flex-1">
        {/* Nome + favoritar */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-[#1e293b] text-sm leading-tight flex-1 line-clamp-2">
            {trilha.name}
          </h3>
          {onToggleFavorito && (
            <button
              onClick={(e) => { e.preventDefault(); onToggleFavorito() }}
              className={`text-lg flex-shrink-0 leading-none transition-colors ${
                isFavorito ? 'text-yellow-500' : 'text-slate-300 hover:text-yellow-500'
              }`}
            >
              {isFavorito ? '★' : '☆'}
            </button>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {trilha.bioma && (
            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {trilha.bioma}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
            {trilha.trail_type === 'bikepark' ? '🏟 Bike Park' : '🏔 Natural'}
          </span>
          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
            {trilha.regiao}
          </span>
        </div>

        {hasData && c ? (
          <>
            {/* Pills: aderência + veredicto 12h */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {acfg && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ color: acfg.cor, background: acfg.cor + '18', border: `1px solid ${acfg.cor}33` }}
                >
                  {acfg.emoji} {c.aderencia_status}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{ color: vcfg.cor, background: vcfg.bg, border: `1px solid ${vcfg.cor}33` }}
              >
                {vcfg.emoji} {veredictoText}
              </span>
            </div>

            {/* Métricas em linha */}
            <div className="flex items-center gap-2 text-xs text-[#64748b] mb-2 flex-wrap">
              <span>🌧 <b>{c.acumulo_48h?.toFixed(1) ?? '—'}mm</b></span>
              {c.pico_3h != null && c.pico_3h > 0 && (
                <span className="text-red-500">⚡ <b>{c.pico_3h.toFixed(1)}mm</b> pico</span>
              )}
              <span>💨 <b>{c.wind_ms?.toFixed(1) ?? '—'}m/s</b></span>
            </div>

            {/* Frase — 1 linha */}
            {c.frase_secagem && (
              <p className="text-xs text-[#64748b] truncate mb-2">{c.frase_secagem}</p>
            )}

            {/* Janela */}
            {c.janela && (
              <p className="text-xs text-slate-500">
                🕐 Janela: <span className="text-[#1e293b] font-medium">{c.janela}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-slate-400 text-xs italic">Condição ainda não calculada.</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <Link
          href={`/trilhas/${trilha.id}`}
          className="block w-full text-center text-xs font-semibold text-green-600 hover:text-green-500 transition-colors"
        >
          Ver detalhes →
        </Link>
      </div>
    </div>
  )
}
