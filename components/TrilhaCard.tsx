import Link from 'next/link'
import { TrilhaComCondicao, VEREDICTO_CONFIG } from '@/lib/types'

type Props = {
  trilha: TrilhaComCondicao
  isFavorito?: boolean
  onToggleFavorito?: () => void
}

export default function TrilhaCard({ trilha, isFavorito, onToggleFavorito }: Props) {
  const condicao = trilha.condicao

  // Só considera a condição válida se o veredicto existir E mapeiar para um config conhecido.
  // Isso evita mostrar 'ATENÇÃO' quando o agente inseriu um valor padrão com dados zerados.
  const veredicto = condicao?.veredicto?.trim() || null
  const vcfg = veredicto ? (VEREDICTO_CONFIG[veredicto] ?? null) : null
  const hasValidCondicao = condicao != null && vcfg != null

  const borderColor = vcfg?.border ?? 'border-slate-600'
  const bgColor = vcfg?.bg ?? ''
  const textColor = vcfg?.color ?? 'text-slate-400'
  const displayVeredicto = hasValidCondicao ? veredicto! : 'SEM DADOS'

  return (
    <div
      className={`bg-slate-800 border-2 rounded-xl overflow-hidden hover:shadow-lg transition-shadow ${borderColor} ${bgColor}`}
    >
      {/* Top bar with veredicto */}
      <div className={`px-4 py-2.5 flex items-center justify-between border-b border-slate-700`}>
        <span className={`font-bold text-sm ${textColor}`}>
          {displayVeredicto}
        </span>
        {onToggleFavorito && (
          <button
            onClick={(e) => { e.preventDefault(); onToggleFavorito() }}
            className={`text-lg transition-colors ${isFavorito ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}
            title={isFavorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            {isFavorito ? '★' : '☆'}
          </button>
        )}
      </div>

      <Link href={`/trilhas/${trilha.id}`}>
        <div className="p-4">
          {/* Nome e badges */}
          <h3 className="font-bold text-white text-base mb-2 leading-tight">{trilha.name}</h3>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {trilha.bioma && (
              <span className="badge bg-slate-700 text-slate-300 text-xs">{trilha.bioma}</span>
            )}
            <span className="badge bg-slate-700 text-slate-300 text-xs">{trilha.trail_type}</span>
            <span className="badge bg-slate-700 text-slate-300 text-xs">{trilha.regiao}</span>
          </div>

          {/* Métricas da condição — só exibe quando há dados válidos */}
          {hasValidCondicao && condicao ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-700/60 rounded-lg p-2.5">
                  <p className="text-xs text-slate-400 mb-0.5">Chuva 48h</p>
                  <p className="text-white font-semibold text-sm">{condicao.acumulo_48h.toFixed(1)} mm</p>
                </div>
                <div className="bg-slate-700/60 rounded-lg p-2.5">
                  <p className="text-xs text-slate-400 mb-0.5">Pico 3h</p>
                  <p className="text-white font-semibold text-sm">{condicao.pico_3h.toFixed(1)} mm</p>
                </div>
              </div>

              <p className="text-slate-400 text-xs leading-relaxed">{condicao.frase_secagem}</p>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-500">
                  Janela: <span className="text-slate-300">{condicao.janela}</span>
                </span>
                <span className="text-xs text-slate-500">
                  Score: <span className={`font-semibold ${textColor}`}>{condicao.aderencia_score}</span>
                </span>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Condição ainda não calculada.</p>
          )}
        </div>
      </Link>
    </div>
  )
}
