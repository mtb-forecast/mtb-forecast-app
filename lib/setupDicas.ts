// Dicas de setup por bicicleta x condição da trilha.
// Regra determinística — sem chamada de IA, sem custo de API, sem tocar no
// pipeline Python. Textos calibrados manualmente, não vêm do banco.
import { Bicicleta, Condicao, Modalidade, MODALIDADES } from './types'

type CondicaoBucket = 'SECO' | 'UMIDO' | 'LAMA'

function bucketDeAderencia(aderencia_status: string): CondicaoBucket {
  if (aderencia_status === 'BAIXA ADERÊNCIA') return 'LAMA'
  if (aderencia_status === 'BOA ADERÊNCIA - ÚMIDO') return 'UMIDO'
  return 'SECO' // SECO, GRIP PERFEITO
}

const DICAS_BASE: Record<Modalidade, Record<CondicaoBucket, string[]>> = {
  DOWNHILL: {
    SECO: ['Pneu na pressão padrão de pista seca — priorize grip lateral.', 'Suspensão no setup normal, sem precisar enrijecer.'],
    UMIDO: ['Reduza ~1-2 psi para aumentar a área de contato do pneu.', 'Se tiver pneu intercambiável, considere um composto mais macio.'],
    LAMA: ['Reduza a pressão e, se possível, troque para um pneu de cravos mais espaçados (lameira).', 'Abra um pouco o rebound da suspensão — solo mole absorve parte do impacto.'],
  },
  ENDURO: {
    SECO: ['Pressão padrão de trilha seca, sem ajustes especiais.', 'Suspensão no setup de referência para o seu peso.'],
    UMIDO: ['Reduza ~1-2 psi para melhorar tração em curva.', 'Fique atento a raízes e pedras — ficam escorregadias mesmo com pneu bom.'],
    LAMA: ['Reduza a pressão para ganhar grip; risco de fura sobe, ande com atenção em pedras.', 'Se o trecho tiver muita lama grudenta, considere pneu de cravo alto.'],
  },
  TRAIL: {
    SECO: ['Pressão padrão de trilha seca, equilíbrio entre rolamento e grip.', 'Suspensão no setup de referência para o seu peso.'],
    UMIDO: ['Reduza ~1 psi pra melhorar tração sem perder rolamento.', 'Cuidado extra em raízes, pedras e madeira molhada.'],
    LAMA: ['Reduza a pressão para ganhar grip em subida e curva; risco de fura sobe.', 'Prefira linhas mais firmes do trajeto para evitar atoleiro.'],
  },
  XC: {
    SECO: ['Pressão mais alta favorece rolamento — mantenha o setup padrão.', 'Sem necessidade de ajuste de suspensão.'],
    UMIDO: ['Reduza levemente a pressão (~1 psi) para não perder tração nas subidas.', 'Cuidado extra em raízes e pedras molhadas.'],
    LAMA: ['Reduza a pressão para melhorar tração; aceite perder um pouco de rolamento.', 'Prefira linhas mais firmes do trajeto para evitar atoleiro.'],
  },
  DIRT_JUMP: {
    SECO: ['Pressão alta e suspensão firme (pouco sag) — pista seca é o cenário ideal pra saltos.', 'Sem ajuste necessário.'],
    UMIDO: ['Pista de terra batida molhada perde muito grip pra aterrissagem — reduza a pressão levemente e ande com cautela nas curvas.', 'Evite saltar em pouso molhado e escorregadio.'],
    LAMA: ['Não recomendado andar de dirt jump/pumptrack com pista enlameada — risco alto de derrapagem no pouso.', 'Se for pumptrack de concreto, a lama não afeta a pista, só o acesso.'],
  },
  MTB_ESTRADA: {
    SECO: ['Pressão padrão de estrada/cascalho, sem ajuste.', ''],
    UMIDO: ['Reduza um pouco a pressão em trechos de terra molhada para mais tração.', ''],
    LAMA: ['Evite trechos de barro profundo se possível — pneu de estrada tem pouco grip em lama.', 'Reduza a pressão nos trechos de terra para não derrapar.'],
  },
  CICLOTURISMO: {
    SECO: ['Pressão padrão de acordo com a carga da bagagem.', ''],
    UMIDO: ['Reduza levemente a pressão para mais estabilidade em piso molhado.', ''],
    LAMA: ['Evite atalhos de terra batida com bagagem pesada — prefira rota alternativa se houver.', 'Reduza a pressão nos trechos de terra molhada.'],
  },
}

// Ajuste de PSI por condição em relação à referência de peso (psi)
const AJUSTE_PSI_BUCKET: Record<CondicaoBucket, number> = { SECO: 0, UMIDO: -1, LAMA: -2 }

// Sag alvo (% do curso) por modalidade — referência geral de trilha, não substitui manual do fabricante
const SAG_ALVO_PCT: Record<Modalidade, [number, number]> = {
  XC: [0.20, 0.25],
  MTB_ESTRADA: [0.20, 0.25],
  CICLOTURISMO: [0.15, 0.20],
  TRAIL: [0.22, 0.28],
  ENDURO: [0.25, 0.30],
  DOWNHILL: [0.30, 0.35],
  DIRT_JUMP: [0.10, 0.20],
}

// Faixa típica de curso de suspensão (mm) por modalidade, dianteira x traseira —
// referência de mercado (fontes: revistabicicleta.com, treepbiker.com.br, ativo.com,
// pedal.com.br), usada só pra sinalizar valor digitado que foge muito do comum
// (não bloqueia o cadastro). XC aceita 0 na traseira (hardtail é comum na modalidade).
const CURSO_TIPICO_MM: Record<Modalidade, { dianteiro: [number, number]; traseiro: [number, number] }> = {
  XC: { dianteiro: [80, 120], traseiro: [0, 120] },
  TRAIL: { dianteiro: [120, 140], traseiro: [120, 140] },
  ENDURO: { dianteiro: [150, 170], traseiro: [140, 165] },
  DOWNHILL: { dianteiro: [180, 200], traseiro: [180, 250] },
  DIRT_JUMP: { dianteiro: [80, 100], traseiro: [0, 80] },
  MTB_ESTRADA: { dianteiro: [0, 100], traseiro: [0, 100] },
  CICLOTURISMO: { dianteiro: [0, 100], traseiro: [0, 100] },
}

function modalidadeLabel(v: Modalidade) {
  return MODALIDADES.find(m => m.value === v)?.label ?? v
}

function ajusteTipoBike(tipo: Bicicleta['tipo']): string | null {
  if (tipo === 'EMTB') return 'E-MTB é mais pesada — considere +1 psi em relação a uma bike convencional para compensar o peso extra.'
  if (tipo === 'RIGIDA') return 'Sem suspensão traseira, o pneu faz parte do amortecimento — evite pressões muito baixas mesmo em trilha molhada, para não perder controle.'
  return null
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

// Heurística clássica de MTB tubeless (não é cálculo de engenharia, é ponto de partida):
// psi ≈ peso corporal (lb) / 7 na dianteira, / 6.5 na traseira.
function psiRecomendadoBase(pesoKg: number): { dianteiro: number; traseiro: number } {
  const pesoLb = pesoKg * 2.20462
  return {
    dianteiro: round1(pesoLb / 7),
    traseiro: round1(pesoLb / 6.5),
  }
}

function sagAlvoMm(cursoMm: number, modalidade: Modalidade): [number, number] {
  const [min, max] = SAG_ALVO_PCT[modalidade]
  return [Math.round(cursoMm * min), Math.round(cursoMm * max)]
}

function aroLabel(aro: string) {
  return aro === '27.5' ? '27,5"' : `${aro}"`
}

function mulletNote(bicicleta: Bicicleta): string | null {
  if (bicicleta.aro_dianteiro && bicicleta.aro_traseiro && bicicleta.aro_dianteiro !== bicicleta.aro_traseiro) {
    return `Configuração mullet (${aroLabel(bicicleta.aro_dianteiro)} dianteira / ${aroLabel(bicicleta.aro_traseiro)} traseira) — o aro traseiro menor tem menos volume de ar; mantenha o PSI traseiro um pouco mais alto do que indicaria uma bike com os dois aros iguais.`
  }
  return null
}

export type SetupDica = {
  titulo: string
  itens: string[]
}

function nomeBicicleta(bicicleta: Bicicleta): string {
  return [bicicleta.marca, bicicleta.modelo].filter(Boolean).join(' ')
}

// Dica cruzando a bike com a condição atual da trilha (usada no CondicaoCard).
export function setupDica(bicicleta: Bicicleta, condicao: Pick<Condicao, 'aderencia_status'>): SetupDica {
  const bucket = bucketDeAderencia(condicao.aderencia_status)
  const rotuloBucket = bucket === 'SECO' ? 'solo seco' : bucket === 'UMIDO' ? 'solo úmido' : 'solo com lama'
  const nomeBike = nomeBicicleta(bicicleta)
  const itens: string[] = []

  if (bicicleta.peso_atleta_kg) {
    const rec = psiRecomendadoBase(bicicleta.peso_atleta_kg)
    const delta = AJUSTE_PSI_BUCKET[bucket]
    const alvoD = round1(rec.dianteiro + delta)
    const alvoT = round1(rec.traseiro + delta)

    const temAtual = bicicleta.psi_dianteiro != null || bicicleta.psi_traseiro != null
    if (temAtual) {
      const ajustes: string[] = []
      if (bicicleta.psi_dianteiro != null) {
        const diff = round1(alvoD - bicicleta.psi_dianteiro)
        if (Math.abs(diff) >= 0.5) ajustes.push(`dianteiro ${diff > 0 ? 'suba' : 'reduza'} ~${Math.abs(diff)} psi (está em ${bicicleta.psi_dianteiro})`)
      }
      if (bicicleta.psi_traseiro != null) {
        const diff = round1(alvoT - bicicleta.psi_traseiro)
        if (Math.abs(diff) >= 0.5) ajustes.push(`traseiro ${diff > 0 ? 'suba' : 'reduza'} ~${Math.abs(diff)} psi (está em ${bicicleta.psi_traseiro})`)
      }
      itens.push(ajustes.length
        ? `Estimativa de ponto de partida pra hoje (~${alvoD} psi dianteiro / ~${alvoT} psi traseiro, baseado no seu peso): ${ajustes.join('; ')}.`
        : `Seu PSI atual já está perto da estimativa de ponto de partida pra hoje (~${alvoD} dianteiro / ~${alvoT} traseiro) — ajuste fino conforme a sensação na trilha.`)
    } else {
      itens.push(`Estimativa de ponto de partida pra hoje, baseada no seu peso: ~${alvoD} psi dianteiro / ~${alvoT} psi traseiro — não é uma recomendação precisa, ajuste conforme a sensação na trilha.`)
    }
  } else {
    itens.push(...DICAS_BASE[bicicleta.modalidade][bucket].filter(Boolean))
  }

  const ajusteTipo = ajusteTipoBike(bicicleta.tipo)
  if (ajusteTipo) itens.push(ajusteTipo)

  const mullet = mulletNote(bicicleta)
  if (mullet) itens.push(mullet)

  return {
    titulo: nomeBike ? `Dica de setup para ${rotuloBucket} · ${nomeBike}` : `Dica de setup para ${rotuloBucket}`,
    itens,
  }
}

export type AnaliseCadastro = {
  itens: string[]
  avisos: string[]
}

// Verifica se o que foi digitado é coerente com a própria sugestão calculada
// (peso → PSI de referência, modalidade → curso típico). Não bloqueia o
// cadastro — só sinaliza pro usuário revisar um valor que foge muito do comum.
function verificarCoerencia(bicicleta: Bicicleta): string[] {
  const avisos: string[] = []

  if (bicicleta.peso_atleta_kg) {
    const rec = psiRecomendadoBase(bicicleta.peso_atleta_kg)
    if (bicicleta.psi_dianteiro != null && Math.abs(bicicleta.psi_dianteiro - rec.dianteiro) >= 3) {
      avisos.push(`PSI dianteiro informado (${bicicleta.psi_dianteiro}) está bem ${bicicleta.psi_dianteiro > rec.dianteiro ? 'acima' : 'abaixo'} da estimativa pro seu peso (~${rec.dianteiro}) — confira se não é engano de digitação.`)
    }
    if (bicicleta.psi_traseiro != null && Math.abs(bicicleta.psi_traseiro - rec.traseiro) >= 3) {
      avisos.push(`PSI traseiro informado (${bicicleta.psi_traseiro}) está bem ${bicicleta.psi_traseiro > rec.traseiro ? 'acima' : 'abaixo'} da estimativa pro seu peso (~${rec.traseiro}) — confira se não é engano de digitação.`)
    }
  }

  if (bicicleta.tipo !== 'RIGIDA') {
    const faixas = CURSO_TIPICO_MM[bicicleta.modalidade]
    const modLabel = modalidadeLabel(bicicleta.modalidade)
    const [minD, maxD] = faixas.dianteiro
    const [minT, maxT] = faixas.traseiro
    if (bicicleta.curso_dianteiro_mm != null && (bicicleta.curso_dianteiro_mm < minD - 10 || bicicleta.curso_dianteiro_mm > maxD + 10)) {
      avisos.push(`Curso dianteiro de ${bicicleta.curso_dianteiro_mm}mm é incomum pra ${modLabel} (bikes dessa modalidade costumam ter ${minD}-${maxD}mm na dianteira) — confira se o valor está certo.`)
    }
    if (bicicleta.curso_traseiro_mm != null && (bicicleta.curso_traseiro_mm < minT - 10 || bicicleta.curso_traseiro_mm > maxT + 10)) {
      avisos.push(`Curso traseiro de ${bicicleta.curso_traseiro_mm}mm é incomum pra ${modLabel} (bikes dessa modalidade costumam ter ${minT}-${maxT}mm na traseira) — confira se o valor está certo.`)
    }
  } else if (bicicleta.curso_dianteiro_mm != null || bicicleta.curso_traseiro_mm != null) {
    avisos.push('Bike marcada como Rígida mas com curso de suspensão preenchido — confira o tipo cadastrado.')
  }

  return avisos
}

// Análise mostrada logo após o cadastro/edição da bike — independente da condição
// da trilha, usa só os dados da própria bike (peso, curso, PSI, aros).
export function analiseCadastroBicicleta(bicicleta: Bicicleta): AnaliseCadastro {
  const itens: string[] = []

  if (bicicleta.peso_atleta_kg) {
    const rec = psiRecomendadoBase(bicicleta.peso_atleta_kg)
    itens.push(`Estimativa de ponto de partida pro seu peso (não é uma recomendação precisa): ~${rec.dianteiro} psi dianteiro / ~${rec.traseiro} psi traseiro — use só como referência inicial e ajuste conforme a sensação na trilha.`)
  }

  if (bicicleta.tipo !== 'RIGIDA') {
    if (bicicleta.curso_dianteiro_mm) {
      const [min, max] = sagAlvoMm(bicicleta.curso_dianteiro_mm, bicicleta.modalidade)
      itens.push(`Estimativa de sag na suspensão dianteira (${bicicleta.curso_dianteiro_mm}mm de curso): ${min}-${max}mm parado sobre a bike — referência geral, o manual do fabricante pode indicar outra faixa.`)
    }
    if (bicicleta.curso_traseiro_mm) {
      const [min, max] = sagAlvoMm(bicicleta.curso_traseiro_mm, bicicleta.modalidade)
      itens.push(`Estimativa de sag na suspensão traseira (${bicicleta.curso_traseiro_mm}mm de curso): ${min}-${max}mm parado sobre a bike — referência geral, o manual do fabricante pode indicar outra faixa.`)
    }
  }

  const mullet = mulletNote(bicicleta)
  if (mullet) itens.push(mullet)

  return { itens, avisos: verificarCoerencia(bicicleta) }
}
