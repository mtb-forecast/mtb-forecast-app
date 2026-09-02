// Mirrors .github/workflows/mtb-forecast-workflow.yml — schedule section.
// Update this file whenever the workflow cron is changed.
//
//   cron: "7 8 * * *"      → dispara 05h07 BRT, janela de notificação continua "06h" (Seg–Dom)
//                             minuto deslocado p/ evitar congestionamento do :00; ver notif_horarios (CHECK
//                             constraint no banco + mtb_telegram.py/mtb_email_html.py) — não renomear a janela
//   cron: "0 19 * * *"     → 16h BRT — todos os dias (captura chuvas da tarde)
//   cron: "0 15 * * 5,6,0" → 12h BRT — Sex, Sáb, Dom
//   cron: "0 23 * * 5,6"   → 20h BRT — Sex e Sáb

export const REPORT_SCHEDULE = [
  { hora: '06h', dias: 'Seg–Dom', cron: '7 8 * * *'      },
  { hora: '12h', dias: 'Sex–Dom', cron: '0 15 * * 5,6,0' },
  { hora: '16h', dias: 'Seg–Dom', cron: '0 19 * * *'     },
  { hora: '20h', dias: 'Sex–Sáb', cron: '0 23 * * 5,6'   },
] as const

// "06h, 12h, 16h e 20h"
export const HORARIOS_LABEL = (REPORT_SCHEDULE.map(s => s.hora) as string[])
  .reduce((acc, h, i, arr) => i === arr.length - 1 ? `${acc} e ${h}` : `${acc}, ${h}`)

// "Seg–Dom às 06h · Sex–Dom às 12h · Seg–Dom às 16h · Sex–Sáb às 20h"
export const HORARIOS_DETALHE = REPORT_SCHEDULE
  .map(s => `${s.dias} às ${s.hora}`)
  .join(' · ')

// "06h e 16h (diário), 12h e 20h (fins de semana)"
export const HORARIOS_RESUMO = '06h e 16h (diário), 12h e 20h (fins de semana)'
