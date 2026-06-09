// Mirrors .github/workflows/mtb-forecast-workflow.yml — schedule section.
// Update this file whenever the workflow cron is changed.
//
//   cron: "0 9 * * *"      → 06h BRT — todos os dias (Seg–Dom)
//   cron: "0 15 * * 5,6,0" → 12h BRT — Sex, Sáb, Dom
//   cron: "0 23 * * 5,6"   → 20h BRT — Sex e Sáb

export const REPORT_SCHEDULE = [
  { hora: '06h', dias: 'Seg–Dom', cron: '0 9 * * *'      },
  { hora: '12h', dias: 'Sex–Dom', cron: '0 15 * * 5,6,0' },
  { hora: '20h', dias: 'Sex–Sáb', cron: '0 23 * * 5,6'   },
] as const

// "06h, 12h e 20h"
export const HORARIOS_LABEL = REPORT_SCHEDULE
  .map(s => s.hora)
  .reduce((acc, h, i, arr) => i === arr.length - 1 ? `${acc} e ${h}` : `${acc}, ${h}`)

// "Seg–Dom às 06h · Sex–Dom às 12h · Sex–Sáb às 20h"
export const HORARIOS_DETALHE = REPORT_SCHEDULE
  .map(s => `${s.dias} às ${s.hora}`)
  .join(' · ')

// "06h (diário), 12h e 20h (fins de semana)"
export const HORARIOS_RESUMO = '06h (diário), 12h e 20h (fins de semana)'
