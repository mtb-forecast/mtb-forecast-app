import { Condicao, VEREDICTO_CONFIG } from '@/lib/types'

type Props = {
  condicao: Condicao
}

function Metric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="bg-slate-700/60 rounded-lg p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-white font-bold text-sm">
        {value}
        {unit && <span className="text-slate-400 font-normal ml-1">{unit}</span>}
      </p>
    </div>
  )
}

export default function CondicaoCard({ condicao }: Props) {
  const vcfg = VEREDICTO_CONFIG[condicao.veredicto]

  return (
    <div className={`bg-slate-800 border rounded-xl overflow-hidden ${vcfg?.border || 'border-slate-700'}`}>
      <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Condição atual</h3>
        <span className="text-xs text-slate-500">
          {new Date(condicao.gerado_em).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div className="p-5">
        {/* Score visual */}
        <div className="flex items-center gap-4 mb-5">
          <div
            className={`w-16 h-16 rounded-full border-4 flex items-center justify-center flex-shrink-0 ${vcfg?.border || 'border-slate-600'}`}
          >
            <span className={`text-xl font-extrabold ${vcfg?.color || 'text-white'}`}>
              {condicao.aderencia_score}
            </span>
          </div>
          <div>
            <p className={`text-lg font-bold ${vcfg?.color || 'text-white'}`}>{condicao.veredicto}</p>
            <p className="text-slate-400 text-sm">{condicao.aderencia_status}</p>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          <Metric label="Chuva agora" value={condicao.rain_mm.toFixed(1)} unit="mm" />
          <Metric label="Pico 3h" value={condicao.pico_3h.toFixed(1)} unit="mm" />
          <Metric label="Acúmulo 48h" value={condicao.acumulo_48h.toFixed(1)} unit="mm" />
          <Metric label="Acúmulo efetivo" value={condicao.acumulo_ef.toFixed(1)} unit="mm" />
          <Metric label="Meia-vida secagem" value={condicao.meia_vida_h} unit="h" />
          <Metric label="Vento" value={condicao.wind_ms.toFixed(1)} unit="m/s" />
          {condicao.gust_max_kmh && (
            <Metric label="Rajada máx." value={condicao.gust_max_kmh.toFixed(0)} unit="km/h" />
          )}
          {condicao.ultima_chuva_h !== undefined && condicao.ultima_chuva_h !== null && (
            <Metric label="Última chuva" value={`${condicao.ultima_chuva_h}h atrás`} />
          )}
        </div>

        {/* Frase e janela */}
        <div className="bg-slate-700/40 rounded-lg p-4">
          <p className="text-slate-300 text-sm mb-2">{condicao.frase_secagem}</p>
          <p className="text-xs text-slate-500">
            Janela recomendada: <span className="text-slate-300 font-medium">{condicao.janela}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
