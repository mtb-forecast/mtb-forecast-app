// Dicas de setup por bicicleta x condição da trilha.
// Regra determinística — sem chamada de IA, sem custo de API, sem tocar no
// pipeline Python. Textos calibrados manualmente, não vêm do banco.
import { Bicicleta, Condicao, Modalidade } from './types'

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
  XC: {
    SECO: ['Pressão mais alta favorece rolamento — mantenha o setup padrão.', 'Sem necessidade de ajuste de suspensão.'],
    UMIDO: ['Reduza levemente a pressão (~1 psi) para não perder tração nas subidas.', 'Cuidado extra em raízes e pedras molhadas.'],
    LAMA: ['Reduza a pressão para melhorar tração; aceite perder um pouco de rolamento.', 'Prefira linhas mais firmes do trajeto para evitar atoleiro.'],
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
  ENDURO: [0.25, 0.30],
  DOWNHILL: [0.30, 0.35],
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

// Dica cruzando a bike com a condição atual da trilha (usada no CondicaoCard).
export function setupDica(bicicleta: Bicicleta, condicao: Pick<Condicao, 'aderencia_status'>): SetupDica {
  const bucket = bucketDeAderencia(condicao.aderencia_status)
  const rotuloBucket = bucket === 'SECO' ? 'solo seco' : bucket === 'UMIDO' ? 'solo úmido' : 'solo com lama'
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
        ? `Pra hoje (~${alvoD} psi dianteiro / ~${alvoT} psi traseiro): ${ajustes.join('; ')}.`
        : `Seu PSI atual já está próximo do ideal pra hoje (~${alvoD} dianteiro / ~${alvoT} traseiro).`)
    } else {
      itens.push(`PSI recomendado pra hoje: ~${alvoD} psi dianteiro / ~${alvoT} psi traseiro (baseado no seu peso).`)
    }
  } else {
    itens.push(...DICAS_BASE[bicicleta.modalidade][bucket].filter(Boolean))
  }

  const ajusteTipo = ajusteTipoBike(bicicleta.tipo)
  if (ajusteTipo) itens.push(ajusteTipo)

  const mullet = mulletNote(bicicleta)
  if (mullet) itens.push(mullet)

  return {
    titulo: `Dica de setup para ${rotuloBucket}`,
    itens,
  }
}

export type AnaliseCadastro = {
  itens: string[]
}

// Análise mostrada logo após o cadastro/edição da bike — independente da condição
// da trilha, usa só os dados da própria bike (peso, curso, PSI, aros).
export function analiseCadastroBicicleta(bicicleta: Bicicleta): AnaliseCadastro {
  const itens: string[] = []

  if (bicicleta.peso_atleta_kg) {
    const rec = psiRecomendadoBase(bicicleta.peso_atleta_kg)
    itens.push(`PSI de referência para o seu peso: ~${rec.dianteiro} psi dianteiro / ~${rec.traseiro} psi traseiro (ponto de partida — ajuste fino conforme a sensação na trilha).`)

    if (bicicleta.psi_dianteiro != null && Math.abs(bicicleta.psi_dianteiro - rec.dianteiro) >= 3) {
      itens.push(`Seu PSI dianteiro atual (${bicicleta.psi_dianteiro}) está bem ${bicicleta.psi_dianteiro > rec.dianteiro ? 'acima' : 'abaixo'} da referência para o seu peso — vale reavaliar.`)
    }
    if (bicicleta.psi_traseiro != null && Math.abs(bicicleta.psi_traseiro - rec.traseiro) >= 3) {
      itens.push(`Seu PSI traseiro atual (${bicicleta.psi_traseiro}) está bem ${bicicleta.psi_traseiro > rec.traseiro ? 'acima' : 'abaixo'} da referência para o seu peso — vale reavaliar.`)
    }
  }

  if (bicicleta.tipo !== 'RIGIDA') {
    if (bicicleta.curso_dianteiro_mm) {
      const [min, max] = sagAlvoMm(bicicleta.curso_dianteiro_mm, bicicleta.modalidade)
      itens.push(`Sag alvo na suspensão dianteira (${bicicleta.curso_dianteiro_mm}mm de curso): ${min}-${max}mm parado sobre a bike.`)
    }
    if (bicicleta.curso_traseiro_mm) {
      const [min, max] = sagAlvoMm(bicicleta.curso_traseiro_mm, bicicleta.modalidade)
      itens.push(`Sag alvo na suspensão traseira (${bicicleta.curso_traseiro_mm}mm de curso): ${min}-${max}mm parado sobre a bike.`)
    }
  }

  const mullet = mulletNote(bicicleta)
  if (mullet) itens.push(mullet)

  return { itens }
}
