import { Trilha } from '@/lib/types'

type Props = {
  trilhas: Trilha[]
  onAprovar: (id: string) => Promise<void>
  onRejeitar: (id: string) => Promise<void>
}

export default function AdminPanel({ trilhas, onAprovar, onRejeitar }: Props) {
  if (trilhas.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
        <div className="text-4xl mb-3">✅</div>
        <p className="text-slate-400">Nenhuma trilha pendente de aprovação.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Trilhas pendentes</h2>

      {trilhas.map((trilha) => (
        <div
          key={trilha.id}
          className="bg-slate-800 border border-yellow-500/30 rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-yellow-500/10 px-5 py-3 border-b border-yellow-500/20 flex items-center justify-between">
            <h3 className="font-bold text-white">{trilha.name}</h3>
            <span className="badge bg-yellow-500/20 text-yellow-400">Pendente</span>
          </div>

          {/* Dados */}
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Região', value: trilha.regiao },
                { label: 'Tipo de trilha', value: trilha.trail_type },
                { label: 'Tipo de solo', value: trilha.solo_type },
                { label: 'Exposição', value: trilha.exposicao },
                { label: 'Altitude', value: `${trilha.altitude_m}m` },
                { label: 'Bioma', value: trilha.bioma || '—' },
                { label: 'Latitude', value: trilha.lat.toFixed(5) },
                { label: 'Longitude', value: trilha.lon.toFixed(5) },
                ...(trilha.desnivel_m ? [{ label: 'Desnível', value: `${trilha.desnivel_m}m` }] : []),
                ...(trilha.extensao_km ? [{ label: 'Extensão', value: `${trilha.extensao_km}km` }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className="text-white text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>

            <a
              href={`https://www.google.com/maps?q=${trilha.lat},${trilha.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 text-sm inline-flex items-center gap-1 mb-5"
            >
              📍 Ver no mapa
            </a>

            {/* Ações */}
            <div className="flex gap-3 pt-3 border-t border-slate-700">
              <button
                onClick={() => onAprovar(trilha.id)}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                ✓ Aprovar
              </button>
              <button
                onClick={() => onRejeitar(trilha.id)}
                className="flex-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                ✕ Rejeitar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
