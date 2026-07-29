
-- Fotos do pump track
CREATE TABLE fotos_pumptrack (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pumptrack_id text NOT NULL REFERENCES trilhas_pumptrack(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url         text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE fotos_pumptrack ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fotos_pumptrack_read"   ON fotos_pumptrack FOR SELECT USING (true);
CREATE POLICY "fotos_pumptrack_insert" ON fotos_pumptrack FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fotos_pumptrack_delete" ON fotos_pumptrack FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Observações / veredicto do rider
CREATE TABLE observacoes_pumptrack (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pumptrack_id text NOT NULL REFERENCES trilhas_pumptrack(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  estrelas     integer CHECK (estrelas BETWEEN 1 AND 5),
  texto        text CHECK (char_length(texto) <= 200),
  veredicto_rider text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE observacoes_pumptrack ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obs_pumptrack_read"   ON observacoes_pumptrack FOR SELECT USING (true);
CREATE POLICY "obs_pumptrack_insert" ON observacoes_pumptrack FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "obs_pumptrack_update" ON observacoes_pumptrack FOR UPDATE TO authenticated USING (auth.uid() = user_id AND created_at > now() - interval '24 hours');
CREATE POLICY "obs_pumptrack_delete" ON observacoes_pumptrack FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Bucket de fotos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pumptrack-photos', 'pumptrack-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pumptrack_photo_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pumptrack-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pumptrack_photo_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'pumptrack-photos');

CREATE POLICY "pumptrack_photo_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pumptrack-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
