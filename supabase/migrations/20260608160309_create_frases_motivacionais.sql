
-- Tabela de frases motivacionais para o dashboard
CREATE TABLE IF NOT EXISTS frases_motivacionais (
  id        SERIAL PRIMARY KEY,
  frase     TEXT        NOT NULL,
  autor     TEXT,
  ativo     BOOLEAN     NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: leitura pública, escrita apenas autenticada
ALTER TABLE frases_motivacionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frases_read_public"
  ON frases_motivacionais FOR SELECT
  USING (ativo = true);

-- Inserir frases motivacionais
INSERT INTO frases_motivacionais (frase, autor) VALUES
  ('A trilha não é o destino — é onde você se encontra.', NULL),
  ('Planeje sua trilha com cuidado. A montanha sempre estará lá.', NULL),
  ('O barro na bota é o ingresso para o melhor show da natureza.', NULL),
  ('Respeite o solo molhado hoje para pedalar amanhã.', NULL),
  ('Cada subida difícil leva a uma descida inesquecível.', NULL),
  ('A natureza não tem pressa — e você também não precisa ter.', NULL),
  ('Trilhar é ouvir o que o asfalto nunca te contaria.', NULL),
  ('Um dia de chuva hoje é uma trilha perfeita na próxima semana.', NULL),
  ('O melhor equipamento é o respeito pela floresta.', NULL),
  ('Conheça seus limites pedalando além deles — com segurança.', NULL),
  ('A bike leva o corpo; a trilha leva a mente.', NULL),
  ('Solo seco, grip perfeito, coração livre.', NULL),
  ('Cada trilha tem seu próprio ritmo. Aprenda a ouvi-lo.', NULL),
  ('A previsão do tempo boa hoje foi porque alguém cuidou da floresta ontem.', NULL),
  ('Pedalar em grupo é dividir o esforço e multiplicar a alegria.', NULL),
  ('A janela ideal não é meteorológica — é a que você cria pedalando.', NULL),
  ('Floresta preservada é trilha garantida para as próximas gerações.', NULL),
  ('Não existe mal tempo, apenas roupa inadequada — e solo mal avaliado.', NULL),
  ('O vento contra na subida é aliado na descida.', NULL),
  ('Menos velocidade, mais presença. A trilha recompensa quem presta atenção.', NULL),
  ('Bike limpa, trilha preservada, volta feliz.', NULL),
  ('A adrenalina dura minutos; a memória da trilha dura anos.', NULL),
  ('Respeite as marcas de trail. Elas foram abertas com suor e amor.', NULL),
  ('O maior obstáculo de uma trilha não é a pedra — é a preguiça de sair de casa.', NULL),
  ('Natureza não é cenário — é parceira de trilha.', NULL);
