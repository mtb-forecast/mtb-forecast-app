import Link from 'next/link'
import { TrilhaComCondicao, VEREDICTO_CONFIG, SEM_DADOS_STYLE } from '@/lib/types'

type Props = {
  trilha: TrilhaComCondicao
  isFavorito?: boolean
  onToggleFavorito?: () => void
}

export default function TrilhaCard({ trilha, isFavorito, onToggleFavorito }: Props) {
  const c = trilha.condicao

  // veredicto_12h tem prioridade; cai em veredicto se não existir ainda
  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const hasData = c != null && vcfg != null
  const style = vcfg ?? SEM_DADOS_STYLE

  return (
    <div
      className={`bg-slate-800 rounded-xl overflow-hidden border border-slate-700 border-l-4 ${style.leftBorder} hover:border-slate-600 transition-colors flex flex-col`}
    >
      {/* Body */}
      <div className="p-4 flex-1">
        {/* Nome + favoritar */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-white text-sm leading-tight flex-1 line-clamp-2">
            {trilha.name}
          </h3>
          {onToggleFavorito && (
            <button
              onClick={(e) => { e.preventDefault(); onToggleFavorito() }}
              className={`text-lg flex-shrink-0 leading-none transition-colors ${
                isFavorito ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'
              }`}
              title={isFavorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              {isFavorito ? '★' : '☆'}
            </button>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {trilha.bioma && (
            <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-400 rounded-full">
              {trilha.bioma}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-400 rounded-full">
            {trilha.trail_type}
          </span>
          <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-400 rounded-full">
            {trilha.regiao}
          </span>
        </div>

        {hasData && c ? (
          <>
            {/* Veredicto 12h pill */}
            <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold mb-1 ${style.pill}`}>
              {veredictoText}
            </div>

            {/* Aderência */}
            {c.aderencia_status && (
              <p className="text-slate-400 text-xs mb-3 leading-snug">{c.aderencia_status}</p>
            )}

            {/* Métricas */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              <div className="bg-slate-700/60 rounded-lg p-2">
                <p className="text-xs text-slate-500 leading-none mb-1">Chuva 48h</p>
                <p className="text-white font-semibold text-xs">
                  {c.acumulo_48h != null ? `${c.acumulo_48h.toFixed(1)} mm` : '—'}
                </p>
              </div>
              <div className="bg-slate-700/60 rounded-lg p-2">
                <p className="text-xs text-slate-500 leading-none mb-1">Pico 3h</p>
                <p className="text-white font-semibold text-xs">
                  {c.pico_3h != null ? `${c.pico_3h.toFixed(1)} mm` : '—'}
                </p>
              </div>
              <div className="bg-slate-700/60 rounded-lg p-2">
                <p className="text-xs text-slate-500 leading-none mb-1">Vento</p>
                <p className="text-white font-semibold text-xs">
                  {c.wind_ms != null ? `${c.wind_ms.toFixed(1)} m/s` : '—'}
                </p>
              </div>
            </div>

            {/* Frase secagem — 1 linha */}
            {c.frase_secagem && (
              <p className={`text-xs truncate mb-2 ${style.color}`}>
                {c.frase_secagem}
              </p>
            )}

            {/* Janela */}
            {c.janela && (
              <p className="text-xs text-slate-500">
                Janela: <span className="text-slate-300">{c.janela}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-slate-500 text-xs italic">Condição ainda não calculada.</p>
        )}
      </div>

      {/* Footer — Ver detalhes */}
      <div className="px-4 py-2.5 border-t border-slate-700/60">
        <Link
          href={`/trilhas/${trilha.id}`}
          className="block w-full text-center text-xs font-semibold text-green-400 hover:text-green-300 transition-colors"
        >
          Ver detalhes →
        </Link>
      </div>
    </div>
  )
}
