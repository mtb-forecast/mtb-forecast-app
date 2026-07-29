
DROP TABLE IF EXISTS instagram_dicas_log;

CREATE TABLE instagram_dicas (
  id              INTEGER PRIMARY KEY,
  titulo          TEXT NOT NULL,
  subtitulo       TEXT NOT NULL,
  itens           JSONB NOT NULL,
  rodape          TEXT,
  caption         TEXT NOT NULL,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  ultima_postagem TIMESTAMPTZ
);

CREATE INDEX instagram_dicas_roundrobin_idx ON instagram_dicas (ultima_postagem ASC NULLS FIRST) WHERE ativo = true;

ALTER TABLE instagram_dicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select" ON instagram_dicas FOR SELECT TO anon USING (true);

INSERT INTO instagram_dicas (id, titulo, subtitulo, itens, rodape, caption) VALUES

(1,
 'Como ler o veredicto',
 'O veredicto resume a condição da trilha em 3 níveis',
 '[{"emoji":"✅","texto":"LIBERADO — solo em boas condições, pode pedalar"},{"emoji":"⚠️","texto":"ALERTA — solo úmido, pedale com atenção"},{"emoji":"⛔","texto":"MELHOR ESPERAR — solo enlameado ou chuva prevista"}]',
 'Atualizado 2× ao dia com dados reais de clima',
 $$🧭 Como ler o veredicto da trilha

✅ LIBERADO — solo em boas condições, pode pedalar
⚠️ ALERTA — solo úmido, pedale com atenção
⛔ MELHOR ESPERAR — solo enlameado ou chuva prevista

O veredicto é calculado em tempo real com dados de chuva das últimas 48h + previsão para as próximas 24h.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(2,
 'Grip e condição do solo',
 'O app classifica o solo em 4 estados de aderência',
 '[{"emoji":"🏆","texto":"GRIP PERFEITO — solo ideal, máxima tração"},{"emoji":"👍","texto":"BOM GRIP — solo firme, condições favoráveis"},{"emoji":"💧","texto":"ÚMIDO — solo mole, cuidado nas curvas"},{"emoji":"🟫","texto":"LAMA — solo encharcado, evite pedalar"}]',
 'O grip considera chuva acumulada e tipo de solo da trilha',
 $$🏔️ Grip e condição do solo — o que cada status significa

🏆 GRIP PERFEITO — solo ideal, máxima tração
👍 BOM GRIP — solo firme, condições favoráveis
💧 ÚMIDO — solo mole, cuidado nas curvas
🟫 LAMA — solo encharcado, evite pedalar

O grip considera chuva acumulada, tipo de solo e bioma de cada trilha.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(3,
 'Como a chuva afeta a trilha',
 'Nem toda chuva chega ao solo da mesma forma',
 '[{"emoji":"🌿","texto":"Dossel fecha: mata fechada absorve até 50% da chuva"},{"emoji":"🏔️","texto":"Altitude importa: solo serrano drena mais devagar"},{"emoji":"⏱️","texto":"Chuva recente pesa mais que chuva de 2 dias atrás"},{"emoji":"🌧️","texto":"Garoa leve pode manter solo úmido por mais tempo"}]',
 'O modelo usa dados horários de chuva das últimas 48h',
 $$🌧️ Como a chuva afeta a trilha — nem toda chuva chega ao solo igual

🌿 Dossel fecha: mata fechada absorve até 50% da chuva
🏔️ Altitude importa: solo serrano drena mais devagar
⏱️ Chuva recente pesa mais que chuva de 2 dias atrás
🌫️ Garoa leve pode manter solo úmido por muito mais tempo

O modelo usa dados horários das últimas 48h para cada trilha.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(4,
 'Meia-vida de secagem',
 'Quanto tempo o solo leva para secar após a chuva',
 '[{"emoji":"☀️","texto":"Sol + vento: solo seca em 12–18h"},{"emoji":"⛅","texto":"Nublado: secagem mais lenta, 24–36h"},{"emoji":"🌫️","texto":"Garoa e frio: solo pode levar 48h ou mais"},{"emoji":"🌲","texto":"Mata fechada: secagem 30–50% mais lenta que campo aberto"}]',
 'O app calcula a meia-vida em tempo real para cada trilha',
 $$⏳ Meia-vida de secagem — quanto tempo a trilha leva para secar

☀️ Sol + vento: solo seca em 12–18h
⛅ Nublado: secagem mais lenta, 24–36h
🌫️ Garoa e frio: solo pode levar 48h ou mais
🌲 Mata fechada: secagem 30–50% mais lenta que campo aberto

O app calcula a meia-vida em tempo real para cada trilha individualmente.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(5,
 'Vento forte na trilha',
 'Quando o vento começa a ser um fator de risco',
 '[{"emoji":"🟡","texto":"Acima de 30 km/h: atenção em descidas técnicas"},{"emoji":"🟠","texto":"Acima de 50 km/h: risco de queda em trechos expostos"},{"emoji":"🔴","texto":"Rajadas acima de 70 km/h: não saia para pedalar"},{"emoji":"🌲","texto":"Mata fechada reduz o vento naturalmente"}]',
 'O app emite alerta automático de vento forte acima de nível 1',
 $$💨 Vento forte na trilha — quando começar a preocupar

🟡 Acima de 30 km/h: atenção em descidas técnicas
🟠 Acima de 50 km/h: risco de queda em trechos expostos
🔴 Rajadas acima de 70 km/h: não saia para pedalar
🌲 Mata fechada reduz o vento naturalmente

O app emite alerta automático de vento forte quando necessário.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(6,
 'Como usar o app',
 'mtbforecaster.com.br — em 4 passos simples',
 '[{"emoji":"🔍","texto":"Busque sua trilha por nome ou região"},{"emoji":"📊","texto":"Veja o veredicto, grip e dados de clima das próximas 24h"},{"emoji":"📍","texto":"Acesse a página da trilha para histórico e detalhes"},{"emoji":"🔔","texto":"Siga o @mtbforecaster para atualizações diárias"}]',
 'Mais de 130 trilhas mapeadas em todo o Brasil',
 $$📱 Como usar o MTB Forecaster — 4 passos simples

🔍 Busque sua trilha por nome ou região
📊 Veja o veredicto, grip e dados de clima das próximas 24h
📍 Acesse a página da trilha para histórico e detalhes
🔔 Siga o @mtbforecaster para atualizações diárias

Mais de 130 trilhas mapeadas em todo o Brasil.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(7,
 'Trilha boa após a chuva?',
 'Sim — e o app explica o porquê',
 '[{"emoji":"🌱","texto":"Solo argiloso escoa rápido em terrenos inclinados"},{"emoji":"🪨","texto":"Trilhas rochosas ficam ótimas horas após a chuva parar"},{"emoji":"📉","texto":"O acúmulo efetivo decai com o tempo — modelo em tempo real"},{"emoji":"✅","texto":"Se o veredicto é LIBERADO, o modelo diz que vale a pena"}]',
 'Confie nos dados, não no achismo — mtbforecaster.com.br',
 $$✅ A trilha pode estar boa mesmo após a chuva — e o app explica o porquê

🌱 Solo argiloso escoa rápido em terrenos inclinados
🪨 Trilhas rochosas ficam ótimas horas após a chuva parar
📉 O acúmulo efetivo decai com o tempo — modelo em tempo real
✅ Se o veredicto é LIBERADO, o modelo diz que vale a pena

Confie nos dados, não no achismo.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(8,
 'Bioma e condição da trilha',
 'O ecossistema define como o solo seca',
 '[{"emoji":"🌿","texto":"Mata Atlântica — dossel denso, solo seca mais devagar"},{"emoji":"🌵","texto":"Cerrado — solo arenoso, drena rápido após a chuva"},{"emoji":"🏔️","texto":"Campos de altitude — expostos ao vento, secagem rápida"},{"emoji":"🌲","texto":"Araucária — umidade alta, modelo mais conservador"}]',
 'O modelo ajusta a meia-vida de secagem por bioma de cada trilha',
 $$🌿 Bioma e condição da trilha — o ecossistema define como o solo seca

🌿 Mata Atlântica — dossel denso, solo seca mais devagar
🌵 Cerrado — solo arenoso, drena rápido após a chuva
🏔️ Campos de altitude — expostos ao vento, secagem rápida
🌲 Araucária — umidade alta, modelo mais conservador

O modelo ajusta a meia-vida de secagem por bioma de cada trilha.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(9,
 'Altitude e secagem',
 'Trilhas altas secam de forma diferente',
 '[{"emoji":"🌡️","texto":"Temperatura mais baixa = evaporação mais lenta"},{"emoji":"🌫️","texto":"Neblina frequente mantém solo úmido por mais tempo"},{"emoji":"💧","texto":"Acima de 600m o modelo aplica fator de secagem reduzido"},{"emoji":"⛰️","texto":"Serra da Mantiqueira e similares: espere mais 12–24h extras"}]',
 'Altitude é considerada individualmente para cada trilha no app',
 $$⛰️ Altitude e secagem — trilhas altas têm regras diferentes

🌡️ Temperatura mais baixa = evaporação mais lenta
🌫️ Neblina frequente mantém solo úmido por mais tempo
💧 Acima de 600m o modelo aplica fator de secagem reduzido
⛰️ Serra da Mantiqueira e similares: espere mais 12–24h extras

Altitude é considerada individualmente para cada trilha no app.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(10,
 'Reporte a condição real',
 'Você pedalou? Ajude a comunidade',
 '[{"emoji":"📍","texto":"Abra a página da trilha no app"},{"emoji":"✍️","texto":"Clique em \"Registrar observação\""},{"emoji":"🌿","texto":"Informe o que encontrou: seco, grip, lama..."},{"emoji":"🤝","texto":"Sua avaliação ajuda outros riders a decidir"}]',
 'Dados reais de campo calibram o modelo preditivo',
 $$✍️ Reporte a condição real — você pedalou? Ajude a comunidade!

📍 Abra a página da trilha no app
✍️ Clique em "Registrar observação"
🌿 Informe o que encontrou: seco, grip, lama...
🤝 Sua avaliação ajuda outros riders a decidir

Dados reais de campo calibram o modelo preditivo.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(11,
 'Previsão vs chuva real',
 'Por que os números às vezes divergem',
 '[{"emoji":"📡","texto":"Previsão usa modelo numérico — estimativa por grade"},{"emoji":"🌧️","texto":"Chuva real pode ser muito mais localizada"},{"emoji":"⏱️","texto":"Modelos levam horas para assimilar dados recentes"},{"emoji":"🔀","texto":"O app cruza Open-Meteo + OpenWeather para minimizar erros"}]',
 'Use o histórico de 48h, não só a previsão, para decidir',
 $$📡 Previsão vs chuva real — por que os números às vezes divergem

📡 Previsão usa modelo numérico — estimativa por grade
🌧️ Chuva real pode ser muito mais localizada
⏱️ Modelos levam horas para assimilar dados recentes
🔀 O app cruza Open-Meteo + OpenWeather para minimizar erros

Use o histórico de 48h, não só a previsão, para decidir.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(12,
 'Arenoso vs Argiloso',
 'O tipo de solo muda tudo na recuperação pós-chuva',
 '[{"emoji":"🏜️","texto":"Arenoso — drena em horas, volta a ficar bom rápido"},{"emoji":"🟫","texto":"Argiloso — retém água, lama persiste por 1–2 dias"},{"emoji":"🪨","texto":"Rochoso — escoa na superfície, seca em poucas horas"},{"emoji":"📊","texto":"O app usa o tipo de solo de cada trilha no cálculo"}]',
 'Solo_type é configurado por trilha e afeta diretamente o veredicto',
 $$🟫 Solo arenoso vs argiloso — como cada um reage à chuva

🏜️ Arenoso — drena em horas, volta a ficar bom rápido
🟫 Argiloso — retém água, lama persiste por 1–2 dias
🪨 Rochoso — escoa na superfície, seca em poucas horas
📊 O app usa o tipo de solo de cada trilha no cálculo

O tipo de solo é um dos principais fatores do veredicto.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(13,
 'Exposição solar da trilha',
 'Sol bate direto? Seca muito mais rápido',
 '[{"emoji":"☀️","texto":"Trilha aberta + sol da tarde: seca em metade do tempo"},{"emoji":"🌲","texto":"Trilha sombreada: sem sol direto, secagem até 2× mais lenta"},{"emoji":"🧭","texto":"Face norte recebe mais sol no hemisfério sul"},{"emoji":"📐","texto":"O app classifica cada trilha como aberta, parcial ou fechada"}]',
 'Exposição solar é um dos fatores da meia-vida de secagem',
 $$☀️ Exposição solar da trilha — sol bate direto? Seca muito mais rápido

☀️ Trilha aberta + sol da tarde: seca em metade do tempo
🌲 Trilha sombreada: secagem até 2× mais lenta
🧭 Face norte recebe mais sol no hemisfério sul
📐 O app classifica cada trilha como aberta, parcial ou fechada

Exposição solar é um dos fatores da meia-vida de secagem.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(14,
 'Como se cadastrar',
 'Crie sua conta em menos de 1 minuto',
 '[{"emoji":"🌐","texto":"Acesse mtbforecaster.com.br no celular ou PC"},{"emoji":"👤","texto":"Clique em \"Entrar\" e depois em \"Criar conta\""},{"emoji":"📧","texto":"Use seu e-mail ou entre com Google"},{"emoji":"✅","texto":"Pronto — acesse favoritos, histórico e notificações"}]',
 'Conta gratuita — sem cartão, sem pegadinha',
 $$👤 Como se cadastrar no MTB Forecaster

🌐 Acesse mtbforecaster.com.br no celular ou PC
👤 Clique em "Entrar" e depois em "Criar conta"
📧 Use seu e-mail ou entre com Google
✅ Pronto — acesse favoritos, histórico e notificações

Conta gratuita — sem cartão, sem pegadinha.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(15,
 'Como favoritar uma trilha',
 'Salve suas trilhas preferidas para acompanhar rápido',
 '[{"emoji":"🔍","texto":"Encontre a trilha pela busca ou lista de regiões"},{"emoji":"⭐","texto":"Clique no ícone de estrela na página da trilha"},{"emoji":"📋","texto":"Acesse \"Minhas trilhas\" para ver todas as favoritas"},{"emoji":"🔔","texto":"Favoritas aparecem em destaque no seu painel"}]',
 'Você precisa estar logado para favoritar trilhas',
 $$⭐ Como favoritar uma trilha — salve as suas preferidas

🔍 Encontre a trilha pela busca ou lista de regiões
⭐ Clique no ícone de estrela na página da trilha
📋 Acesse "Minhas trilhas" para ver todas as favoritas
🔔 Favoritas aparecem em destaque no seu painel

Você precisa estar logado para favoritar trilhas.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(16,
 'Como registrar sua visita',
 'Conte como estava a trilha quando você pedalou',
 '[{"emoji":"📍","texto":"Abra a página da trilha que você visitou"},{"emoji":"📝","texto":"Clique em \"Registrar observação\""},{"emoji":"🌿","texto":"Escolha a condição: seco, grip, boa, baixa ou lama"},{"emoji":"💬","texto":"Adicione um comentário opcional para detalhar"}]',
 'Observações reais ajudam a calibrar o modelo para todos',
 $$📝 Como registrar sua visita à trilha

📍 Abra a página da trilha que você visitou
📝 Clique em "Registrar observação"
🌿 Escolha a condição: seco, grip, boa, baixa ou lama
💬 Adicione um comentário opcional para detalhar

Observações reais ajudam a calibrar o modelo para todos.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(17,
 'Como compartilhar uma trilha',
 'Mande a condição para o grupo de pedal',
 '[{"emoji":"📱","texto":"Abra a página da trilha no app"},{"emoji":"🔗","texto":"Copie o link ou use o botão de compartilhar"},{"emoji":"💬","texto":"Cole no WhatsApp, Telegram ou Instagram"},{"emoji":"📊","texto":"O link já mostra veredicto e condição atualizados"}]',
 'O link é público — qualquer pessoa pode ver sem ter conta',
 $$🔗 Como compartilhar uma trilha com o grupo de pedal

📱 Abra a página da trilha no app
🔗 Copie o link ou use o botão de compartilhar
💬 Cole no WhatsApp, Telegram ou Instagram
📊 O link já mostra veredicto e condição atualizados

O link é público — qualquer pessoa pode ver sem ter conta.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(18,
 'Notificações no Telegram',
 'Receba alertas de condição direto no seu celular',
 '[{"emoji":"📲","texto":"Abra o Telegram e busque @mtbforecaster_bot"},{"emoji":"▶️","texto":"Envie /start para ativar as notificações"},{"emoji":"⭐","texto":"Favorite trilhas no app para receber alertas delas"},{"emoji":"🔔","texto":"Você será avisado quando o veredicto mudar"}]',
 'Gratuito — sem spam, só alertas das suas trilhas favoritas',
 $$🔔 Notificações no Telegram — receba alertas no seu celular

📲 Abra o Telegram e busque @mtbforecaster_bot
▶️ Envie /start para ativar as notificações
⭐ Favorite trilhas no app para receber alertas delas
🔔 Você será avisado quando o veredicto mudar

Gratuito — sem spam, só alertas das suas trilhas favoritas.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(19,
 'Avalie a trilha após pedalar',
 'Você pedalou hoje? Sua avaliação vale muito para a comunidade',
 '[{"emoji":"🤝","texto":"O app prevê — mas quem confirma no campo é você"},{"emoji":"📱","texto":"Abra a trilha e clique em \"Registrar observação\""},{"emoji":"🌿","texto":"Informe o que encontrou: seco, grip, lama..."},{"emoji":"📈","texto":"Avaliações reais calibram o modelo para todos"}]',
 'Leva menos de 30 segundos e ajuda centenas de riders',
 $$🤝 Você pedalou hoje? Avalie a trilha — leva 30 segundos e ajuda toda a comunidade!

O MTB Forecaster prevê as condições com dados de clima, mas quem confirma no campo é você.

📱 Abra a trilha no app
📝 Clique em "Registrar observação"
🌿 Informe o que encontrou: seco, grip, lama...
📈 Cada avaliação real calibra o modelo para os próximos riders

Parece pouco, mas uma observação sua pode evitar que alguém destrua uma trilha — ou perca um dia perfeito de pedal por medo de lama que já secou.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$),

(20,
 'Previsão de chuva hora a hora',
 'Atualização contínua — sem esperar o próximo ciclo',
 '[{"emoji":"⏱️","texto":"A previsão de chuva agora atualiza de hora em hora"},{"emoji":"🌩️","texto":"Tempestade às 14h? O alerta já aparece às 15h"},{"emoji":"📡","texto":"Modelo ICON Seamless — resolução de 2km por hora"},{"emoji":"🚵","texto":"Menos surpresa na trilha, mais decisão consciente"}]',
 'Nowcast atualizado a cada hora para 130+ trilhas',
 $$⏱️ Previsão de chuva atualizada toda hora — novidade no app!

Você sabia que a previsão de chuva no MTB Forecaster agora atualiza de hora em hora? ⏱️

Se uma tempestade aparecer no radar às 14h, você já vê o alerta às 15h — sem esperar o próximo ciclo.

Menos surpresa na trilha, mais decisão consciente. 🚵

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$);
