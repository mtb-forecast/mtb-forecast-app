-- Adiciona campo avatar_url à tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Bucket público para fotos de perfil
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Usuário autenticado pode fazer upload apenas na sua própria pasta
CREATE POLICY "upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Usuário autenticado pode atualizar/deletar o próprio avatar
CREATE POLICY "update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Leitura pública (bucket já é público, mas garante acesso via SELECT)
CREATE POLICY "public read avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
