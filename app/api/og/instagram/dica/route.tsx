import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

interface Dica {
  titulo: string
  subtitulo: string
  itens: { emoji: string; texto: string }[]
  rodape?: string
}

const DICAS: Record<number, Dica> = {
  1: {
    titulo: 'Como ler o veredicto',
    subtitulo: 'O veredicto resume a condição da trilha em 3 níveis',
    itens: [
      { emoji: '✅', texto: 'LIBERADO — solo em boas condições, pode pedalar' },
      { emoji: '⚠️', texto: 'ALERTA — solo úmido, pedale com atenção' },
      { emoji: '⛔', texto: 'MELHOR ESPERAR — solo enlameado ou chuva prevista' },
    ],
    rodape: 'Atualizado 2× ao dia com dados reais de clima',
  },
  2: {
    titulo: 'Grip e condição do solo',
    subtitulo: 'O app classifica o solo em 4 estados de aderência',
    itens: [
      { emoji: '🏆', texto: 'GRIP PERFEITO — solo ideal, máxima tração' },
      { emoji: '👍', texto: 'BOM GRIP — solo firme, condições favoráveis' },
      { emoji: '💧', texto: 'ÚMIDO — solo mole, cuidado nas curvas' },
      { emoji: '🟫', texto: 'LAMA — solo encharcado, evite pedalar' },
    ],
    rodape: 'O grip considera chuva acumulada e tipo de solo da trilha',
  },
  3: {
    titulo: 'Como a chuva afeta a trilha',
    subtitulo: 'Nem toda chuva chega ao solo da mesma forma',
    itens: [
      { emoji: '🌿', texto: 'Dossel fecha: mata fechada absorve até 50% da chuva' },
      { emoji: '🏔️', texto: 'Altitude importa: solo serrano drena mais devagar' },
      { emoji: '⏱️', texto: 'Chuva recente pesa mais que chuva de 2 dias atrás' },
      { emoji: '🌧️', texto: 'Garoa leve pode manter solo úmido por mais tempo' },
    ],
    rodape: 'O modelo usa dados horários de chuva das últimas 48h',
  },
  4: {
    titulo: 'Meia-vida de secagem',
    subtitulo: 'Quanto tempo o solo leva para secar após a chuva',
    itens: [
      { emoji: '☀️', texto: 'Sol + vento: solo seca em 12–18h' },
      { emoji: '⛅', texto: 'Nublado: secagem mais lenta, 24–36h' },
      { emoji: '🌫️', texto: 'Garoa e frio: solo pode levar 48h ou mais' },
      { emoji: '🌲', texto: 'Mata fechada: secagem 30–50% mais lenta que campo aberto' },
    ],
    rodape: 'O app calcula a meia-vida em tempo real para cada trilha',
  },
  5: {
    titulo: 'Vento forte na trilha',
    subtitulo: 'Quando o vento começa a ser um fator de risco',
    itens: [
      { emoji: '💨', texto: 'Acima de 30 km/h: atenção em descidas técnicas' },
      { emoji: '🌬️', texto: 'Acima de 50 km/h: risco de queda em trechos expostos' },
      { emoji: '⚡', texto: 'Rajadas acima de 70 km/h: não recomendado pedalar' },
      { emoji: '🌳', texto: 'Trilhas em mata fechada têm vento reduzido naturalmente' },
    ],
    rodape: 'O app emite alerta automático de vento forte acima de nível 1',
  },
  6: {
    titulo: 'Como usar o app',
    subtitulo: 'mtbforecaster.com.br — em 4 passos simples',
    itens: [
      { emoji: '🔍', texto: 'Busque sua trilha por nome ou região' },
      { emoji: '📊', texto: 'Veja o veredicto, grip e dados de clima das próximas 24h' },
      { emoji: '📍', texto: 'Acesse a página da trilha para histórico e detalhes' },
      { emoji: '🔔', texto: 'Siga o @mtbforecaster para atualizações diárias' },
    ],
    rodape: 'Mais de 130 trilhas mapeadas em todo o Brasil',
  },
  7: {
    titulo: 'Trilha boa após a chuva?',
    subtitulo: 'Sim — e o app explica o porquê',
    itens: [
      { emoji: '🌱', texto: 'Solo argiloso escoa rápido em terrenos inclinados' },
      { emoji: '🪨', texto: 'Trilhas rochosas ficam ótimas horas após a chuva parar' },
      { emoji: '📉', texto: 'O acúmulo efetivo decai com o tempo — modelo em tempo real' },
      { emoji: '✅', texto: 'Se o veredicto é LIBERADO, o modelo diz que vale a pena' },
    ],
    rodape: 'Confie nos dados, não no achismo — mtbforecaster.com.br',
  },
}

function loadFont(filename: string): ArrayBuffer | null {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'fonts', filename))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = parseInt(searchParams.get('id') ?? '1', 10)
    const dica = DICAS[id] ?? DICAS[1]
    const total = Object.keys(DICAS).length

    const notoSans  = loadFont('noto-sans-regular.ttf')
    const dmSansBold = loadFont('dm-sans-800.ttf')
    const dmMono    = loadFont('dm-mono-400.ttf')
    const fontList: { name: string; data: ArrayBuffer; weight: 400 | 800 }[] = []
    if (notoSans)   fontList.push({ name: 'Noto Sans', data: notoSans,   weight: 400 })
    if (dmSansBold) fontList.push({ name: 'DM Sans',   data: dmSansBold, weight: 800 })
    if (dmMono)     fontList.push({ name: 'DM Mono',   data: dmMono,     weight: 400 })

    const fontSans = dmSansBold ? 'DM Sans'   : (notoSans ? 'Noto Sans' : 'sans-serif')
    const fontMono = dmMono     ? 'DM Mono'   : (notoSans ? 'Noto Sans' : 'monospace')

    return new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1080,
            display: 'flex',
            flexDirection: 'column',
            background: '#1e2218',
            paddingTop: 0,
            paddingLeft: 0,
            paddingRight: 0,
            paddingBottom: 0,
            position: 'relative',
          }}
        >
          {/* Faixa verde topo */}
          <div style={{ display: 'flex', height: 5, background: '#a8b899' }} />

          {/* Conteúdo */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              paddingTop: 64,
              paddingLeft: 80,
              paddingRight: 80,
              paddingBottom: 56,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontSize: 24, fontFamily: fontSans, fontWeight: 800, color: '#a8b899', letterSpacing: 3 }}>
                MTB FORECASTER
              </div>
              <div style={{ display: 'flex', fontSize: 20, fontFamily: fontMono, color: 'rgba(168,184,153,0.4)', letterSpacing: 2 }}>
                DICA {String(id).padStart(2, '0')}/{String(total).padStart(2, '0')}
              </div>
            </div>

            {/* Separador */}
            <div style={{ display: 'flex', height: 1, background: 'rgba(168,184,153,0.15)', marginTop: 32 }} />

            {/* Tag */}
            <div style={{ display: 'flex', marginTop: 40 }}>
              <div
                style={{
                  display: 'flex',
                  paddingTop: 8,
                  paddingBottom: 8,
                  paddingLeft: 20,
                  paddingRight: 20,
                  background: 'rgba(168,184,153,0.10)',
                  fontSize: 18,
                  fontFamily: fontSans,
                  fontWeight: 800,
                  color: '#a8b899',
                  letterSpacing: 3,
                }}
              >
                GUIA DO APP
              </div>
            </div>

            {/* Título */}
            <div
              style={{
                display: 'flex',
                fontSize: 72,
                fontFamily: fontSans,
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.1,
                marginTop: 24,
              }}
            >
              {dica.titulo}
            </div>

            {/* Subtítulo */}
            <div
              style={{
                display: 'flex',
                fontSize: 28,
                fontFamily: fontSans,
                fontWeight: 400,
                color: 'rgba(168,184,153,0.6)',
                marginTop: 16,
                lineHeight: 1.4,
              }}
            >
              {dica.subtitulo}
            </div>

            {/* Spacer */}
            <div style={{ display: 'flex', flex: 1 }} />

            {/* Itens */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {dica.itens.map((item, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 20 }}>
                  <div style={{ display: 'flex', fontSize: 32, width: 44, flexShrink: 0 }}>
                    {item.emoji}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 30,
                      fontFamily: fontSans,
                      fontWeight: 400,
                      color: '#e8ede3',
                      lineHeight: 1.35,
                      flex: 1,
                    }}
                  >
                    {item.texto}
                  </div>
                </div>
              ))}
            </div>

            {/* Separador rodapé */}
            <div style={{ display: 'flex', height: 1, background: 'rgba(168,184,153,0.15)', marginTop: 40 }} />

            {/* Rodapé */}
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
              <div style={{ display: 'flex', fontSize: 22, fontFamily: fontMono, color: 'rgba(168,184,153,0.35)' }}>
                mtbforecaster.com.br
              </div>
              {dica.rodape ? (
                <div
                  style={{
                    display: 'flex',
                    fontSize: 18,
                    fontFamily: fontSans,
                    fontWeight: 400,
                    color: 'rgba(168,184,153,0.35)',
                    maxWidth: 500,
                    textAlign: 'right',
                  }}
                >
                  {dica.rodape}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1080, fonts: fontList }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message + '\n' + err.stack : String(err)
    return new Response('OG Dica error: ' + msg, { status: 500 })
  }
}
