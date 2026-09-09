-- Conecta instagram_dicas ao /feed do app pela primeira vez (até aqui só
-- alimentava scripts/post_instagram_dica.py via rodízio ultima_postagem).
-- created_at marca quando a dica foi cadastrada — usada pelo /feed pra
-- mostrar só a(s) dica(s) do dia, no mesmo padrão de noticias_clima/
-- noticias_externas (broadcast por range de data, não por favoritos/seguidores).
ALTER TABLE public.instagram_dicas ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- Backdata as dicas existentes pra data da migration original que criou a
-- tabela, senão todas apareceriam de uma vez no feed de "hoje".
UPDATE public.instagram_dicas SET created_at = '2026-07-03T00:00:00-03:00' WHERE created_at IS NULL;

ALTER TABLE public.instagram_dicas ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.instagram_dicas ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_instagram_dicas_created ON public.instagram_dicas (created_at DESC);

-- Nova dica: cadastro de bike + dicas de setup, publicada hoje (created_at = now()
-- via default) — aparece no /feed de hoje e entra no rodízio normal do Instagram
-- (ultima_postagem IS NULL = prioridade máxima pro próximo post, NULLS FIRST).
INSERT INTO public.instagram_dicas (id, titulo, subtitulo, itens, rodape, caption, ativo) VALUES
(27,
 'Cadastre sua bike e receba dicas de setup',
 'Novo no app: PSI e suspensão calibrados pra condição da trilha',
 '[{"emoji":"🚵","texto":"Cadastre sua bike no perfil: tipo, modalidade, peso, suspensão e PSI"},{"emoji":"💧","texto":"O app cruza os dados da sua bike com a condição real da trilha"},{"emoji":"🔧","texto":"Dica de setup aparece no card da trilha — PSI, sag, ajuste pra lama ou solo seco"},{"emoji":"⚠️","texto":"O app também avisa se algo digitado foge muito do esperado"}]',
 'Acesse Perfil → Equipamento pra cadastrar sua bike',
 $$🚵 Cadastre sua bike e receba dicas de setup personalizadas

Novidade no MTB Forecaster: agora você pode cadastrar sua bicicleta no perfil (tipo, modalidade, peso, suspensão, PSI) e o app cruza esses dados com a condição real da trilha.

💧 Solo seco, úmido ou com lama? A dica de setup se ajusta pra cada cenário.
🔧 PSI, sag da suspensão e ajustes específicos pra sua bike.
⚠️ O app avisa se algum dado cadastrado foge muito do esperado pra modalidade.

Acesse Perfil → Equipamento e cadastre a sua.

🔗 mtbforecaster.com.br

#mtb #mountainbike #trilha #mtbbrasil #trailconditions$$,
 true)
ON CONFLICT (id) DO NOTHING;
