-- Atualiza o campo descricao de todas as chaves em configuracoes_sistema.
-- Objetivo: tornar cada chave autoexplicativa para admins que calibram o modelo
-- sem precisar consultar o código ou a documentação técnica.

UPDATE configuracoes_sistema SET descricao =
  'Valor mínimo permitido para a meia_vida calculada, em horas. Funciona como clamp inferior: mesmo que os multiplicadores climáticos (calor, vento) ou de trail_type (bikepark aberto) reduzam muito a meia_vida, ela nunca será menor que este valor. Padrão: 4h — representa o mínimo físico razoável de secagem mesmo em condições ideais. Calibrável: reduzir abaixo de 4h pode gerar falsos positivos de trilha seca.'
WHERE chave = 'meia_vida_min';

UPDATE configuracoes_sistema SET descricao =
  'Valor máximo permitido para a meia_vida calculada, em horas. Funciona como clamp superior: mesmo que multiplicadores de trail_type (natural/fechada = ×1.30) ou clima (alta umidade, nebulosidade, frio) elevem muito a meia_vida, ela nunca ultrapassará este valor. Padrão: 72h (3 dias) — limite prático além do qual o acumulo_ef já decaiu a ponto de não influenciar o veredicto. Calibrável: aumentar pode ser útil para trilhas em regiões de secagem extremamente lenta (ex: alta montanha com névoa constante).'
WHERE chave = 'meia_vida_max';

UPDATE configuracoes_sistema SET descricao =
  'Multiplicador do fator de recuperação de aderência. Evita BAIXA ADERÊNCIA quando o solo está se recuperando dentro do padrão sazonal normal. Lógica: se acumulo_ef < threshold_descansado × 2.5, mesmo que o threshold de BAIXA tenha sido ultrapassado, o status sobe para BOA ADERÊNCIA. Exemplo: threshold_descansado de junho em SP = 8mm; com mult=2.5, a recuperação é ativada se acumulo_ef < 20mm — solo ainda úmido mas em secagem controlada. Calibrável: valores maiores = mais conservador (recuperação mais difícil de atingir); valores menores = modelo mais permissivo na saída de BAIXA.'
WHERE chave = 'aderencia_recovery_mult';

UPDATE configuracoes_sistema SET descricao =
  'Altitude mínima em metros para aplicar o bônus de absorção por altitude. Trilhas acima deste valor recebem um acréscimo no fator_absorcao_base, pois solos de altitude tendem a ter mais matéria orgânica e maior capacidade de retenção de umidade. Padrão: 1200m — corte típico para zona de neblina e solos orgânicos em montanhas brasileiras (ex: Serra da Mantiqueira, Serra do Mar serrana). Calibrável: ajustar conforme a região geográfica predominante das trilhas cadastradas.'
WHERE chave = 'altitude_bonus_min';

UPDATE configuracoes_sistema SET descricao =
  'Valor somado ao fator_absorcao_base quando a trilha ultrapassa altitude_bonus_min. Fator maior = mesma chuva gera mais impacto calculado no score. Padrão: +0.05 — incremento suave representando a maior retenção hídrica de solos de altitude. Exemplo: terra em altitude > 1200m: base 0.80 + 0.05 = 0.85. Calibrável: aumentar para regiões com solos muito orgânicos; reduzir se o bônus estiver superestimando o impacto em trilhas de altitude bem drenadas.'
WHERE chave = 'altitude_bonus';

UPDATE configuracoes_sistema SET descricao =
  'Coeficiente aplicado à chuva prevista (rain_mm) quando o solo está descansado (acumulo_ef < threshold) E o pico de 3h está abaixo de pico_threshold. Fórmula: impacto = rain_mm × 0.6. O coeficiente < 1.0 reflete que solo descansado absorve parte da chuva sem saturar — o impacto real é menor que o volume bruto. Calibrável: aumentar (mais conservador) se o modelo estiver subestimando o impacto de chuvas moderadas em solo seco; reduzir se estiver exagerando.'
WHERE chave = 'coef_rain';

UPDATE configuracoes_sistema SET descricao =
  'Coeficiente aplicado ao pico de 3h (pico_3h) quando o solo está descansado E o pico ultrapassa pico_threshold (10mm/3h). Fórmula: impacto = pico_3h × 0.7. Pico é mais impactante que chuva total (concentração temporal importa), mas coeficiente < 1.0 ainda reflete que solo descansado aguenta parte do volume. Calibrável: aproximar de 1.0 se o modelo estiver sendo permissivo demais com picos intensos em solo seco.'
WHERE chave = 'coef_pico_descansado';

UPDATE configuracoes_sistema SET descricao =
  'Coeficiente aplicado ao pico de 3h quando o solo já está saturado (acumulo_ef >= threshold) E o pico ultrapassa pico_threshold. Fórmula: impacto = pico_3h × 1.0. Valor 1.0 significa que cada mm de pico se converte diretamente em impacto — solo saturado não absorve mais, qualquer chuva intensa agrava linearmente. Calibrável: aumentar acima de 1.0 para regiões com solos muito argilosos onde picos intensos causam erosão superficial rápida.'
WHERE chave = 'coef_pico_molhado';

UPDATE configuracoes_sistema SET descricao =
  'Coeficiente do acumulo_ef na fórmula de impacto quando o solo está saturado E o pico está abaixo do threshold. Fórmula: impacto = rain_mm + acumulo_ef × 0.3. O acúmulo histórico contribui com 30% do seu valor ao impacto — solo úmido amplifica o efeito da chuva prevista, mas não linearmente. Calibrável: aumentar se o modelo estiver subestimando trilhas que ficam ruins mesmo com pouca chuva nova mas alto acúmulo histórico.'
WHERE chave = 'coef_acumulo';

UPDATE configuracoes_sistema SET descricao =
  'Fator de escala que converte o impacto calculado (número interno) para o score final de 0 a 100. Fórmula: score = impacto × 10.0. Com coef_base=10, impacto=5.0 → score=50; impacto=10.0 → score=100 (clampado). Não representa grandeza física — é apenas escala de apresentação. Alterar reescala todos os scores proporcionalmente sem mudar a ordem relativa entre trilhas. Calibrável: raramente precisa ser ajustado; preferir calibrar coef_rain, coef_pico_* e coef_acumulo.'
WHERE chave = 'coef_base';

UPDATE configuracoes_sistema SET descricao =
  'Limiar de precipitação em 3 horas consecutivas (mm) que ativa a lógica de pico. Abaixo: score usa rain_mm × coef_rain ou rain_mm + acumulo_ef × coef_acumulo. Acima: usa pico_3h × coef_pico_descansado/molhado. Padrão: 10mm/3h — representa chuva moderada a intensa, capaz de saturar rapidamente mesmo solos descansados. Calibrável: reduzir para tornar o modelo mais sensível a picos menores (regiões com solos muito argilosos); aumentar se picos de 10mm não estiverem causando problemas reais observados.'
WHERE chave = 'pico_threshold';

UPDATE configuracoes_sistema SET descricao =
  'Gatilho de saturação que decide se o desconto de score do bikepark é aplicado. Se acumulo_ef < 5.0mm: drenagem projetada ainda funciona → aplica score_mult de trail_type_config (0.90), reduzindo 10% do impacto calculado. Se acumulo_ef >= 5.0mm: bikepark saturado, drenagem perdeu eficácia → desconto suprimido, score cheio como trilha natural. Calibrável: reduzir para dar desconto só em bikeparks muito secos; aumentar para ser mais liberal com o desconto.'
WHERE chave = 'bikepark_acumulo_threshold';

UPDATE configuracoes_sistema SET descricao =
  'OBSOLETO — migrado para trail_type_config.score_mult. Este valor (0.90) ainda está no banco mas não é mais lido pelo Python. O desconto de 10% no score para bikepark não saturado agora vem da tabela trail_type_config, que permite calibração por trail_type × exposição. Mantido no banco para referência histórica.'
WHERE chave = 'bikepark_score_mult';

UPDATE configuracoes_sistema SET descricao =
  'Limiar de saturação de emergência para bikepark (mm), usado somente quando a tabela threshold_sazonal está indisponível no Supabase. Quando acumulo_ef > 10.0mm, o bikepark é considerado saturado: libera BAIXA ADERÊNCIA (normalmente bloqueada para bikeparks não saturados) e adiciona pontos extras de risco no veredicto. Em operação normal este fallback nunca é ativado, pois threshold_sazonal fornece o limiar real ajustado por mês e região. Calibrável: ajustar apenas se threshold_sazonal for removido permanentemente.'
WHERE chave = 'bikepark_saturado_threshold';
