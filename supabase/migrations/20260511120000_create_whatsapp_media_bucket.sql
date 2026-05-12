-- Bucket público para mídia de WhatsApp (anexos de chat).
-- Caminho convencionado pelo helper uploadWhatsAppMedia: <tenant_id>/<timestamp>-<filename>
--
-- Tamanho máximo: 100 MB (limite da Meta Cloud API media upload).
-- MIME types restritos aos suportados pelas 3 APIs (Evolution, WAHA, Meta).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  true,
  104857600,
  array[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/3gpp','video/quicktime',
    'audio/mpeg','audio/ogg','audio/mp4','audio/aac','audio/amr','audio/wav','audio/webm',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv'
  ]
)
on conflict (id) do nothing;

-- INSERT: usuário autenticado só pode subir no folder do próprio tenant.
drop policy if exists "whatsapp_media_tenant_upload" on storage.objects;
create policy "whatsapp_media_tenant_upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] in (
      select p.tenant_id::text from public.profiles p where p.user_id = auth.uid()
    )
  );

-- SELECT: leitura pública (bucket é public; policy explícita para clareza).
drop policy if exists "whatsapp_media_public_read" on storage.objects;
create policy "whatsapp_media_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'whatsapp-media');

-- DELETE: tenant só apaga arquivos do próprio folder.
drop policy if exists "whatsapp_media_tenant_delete" on storage.objects;
create policy "whatsapp_media_tenant_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] in (
      select p.tenant_id::text from public.profiles p where p.user_id = auth.uid()
    )
  );

-- UPDATE: também restringido ao tenant.
drop policy if exists "whatsapp_media_tenant_update" on storage.objects;
create policy "whatsapp_media_tenant_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] in (
      select p.tenant_id::text from public.profiles p where p.user_id = auth.uid()
    )
  );
