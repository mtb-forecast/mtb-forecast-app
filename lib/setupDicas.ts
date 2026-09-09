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

function ajusteTipoBike(tipo: Bicicleta['tipo']): string | null {
  if (tipo === 'EMTB') return 'E-MTB é mais pesada — considere +1 psi em relação a uma bike convencional para compensar o peso extra.'
  if (tipo === 'RIGIDA') return 'Sem suspensão traseira, o pneu faz parte do amortecimento — evite pressões muito baixas mesmo em trilha molhada, para não perder controle.'
  return null
}

export type SetupDica = {
  titulo: string
  itens: string[]
}

export function setupDica(bicicleta: Bicicleta, condicao: Pick<Condicao, 'aderencia_status'>): SetupDica {
  const bucket = bucketDeAderencia(condicao.aderencia_status)
  const base = DICAS_BASE[bicicleta.modalidade][bucket].filter(Boolean)
  const ajuste = ajusteTipoBike(bicicleta.tipo)

  const rotuloBucket = bucket === 'SECO' ? 'solo seco' : bucket === 'UMIDO' ? 'solo úmido' : 'solo com lama'

  return {
    titulo: `Dica de setup para ${rotuloBucket}`,
    itens: ajuste ? [...base, ajuste] : base,
  }
}
