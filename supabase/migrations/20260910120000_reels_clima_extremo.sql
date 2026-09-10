-- Feature: Reels de clima extremo — transforma a notícia externa já existente
-- ([[noticias_externas]], gerada por scripts/post_noticia_externa.py) em um
-- vídeo curto (scripts/post_reels_clima_extremo.py) publicado como Reels no
-- Instagram, em vez de só Stories. Motivação: Stories não têm alcance fora
-- da base de seguidores; Reels é o único formato que o algoritmo empurra pra
-- descoberta.
--
-- Isolado de propósito: reaproveita a linha já gravada por noticia-externa.yml,
-- mas não altera nada da tabela original além de uma coluna de controle pra
-- evitar postar o mesmo Reels duas vezes. Para desligar: desative o workflow
-- reels-clima-extremo.yml — nada mais depende dele.

ALTER TABLE public.noticias_externas
  ADD COLUMN IF NOT EXISTS reels_postado_em timestamptz;

-- Bucket público pra hospedar o MP4 gerado (Graph API exige video_url
-- publicamente acessível pra buscar o arquivo). Mesmo padrão do bucket
-- 'logos' (app/api/admin/upload-logo/route.ts).
INSERT INTO storage.buckets (id, name, public)
VALUES ('reels', 'reels', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'reels_public_read'
  ) THEN
    CREATE POLICY "reels_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'reels');
  END IF;
END $$;

-- Sem policy de INSERT/UPDATE/DELETE pra usuários: só o service role
-- (scripts/post_reels_clima_extremo.py, rodando no GitHub Actions) escreve
-- nesse bucket.
