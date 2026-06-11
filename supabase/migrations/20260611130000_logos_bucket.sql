-- Bucket público para logos de mantenedores
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  true,
  2097152,  -- 2 MB (raster comprimido p/ WebP no browser; SVG pode ser maior)
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do nothing;

create policy "logos_public_read"
  on storage.objects for select
  using (bucket_id = 'logos');
