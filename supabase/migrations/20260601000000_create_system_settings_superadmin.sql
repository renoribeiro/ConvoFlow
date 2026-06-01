-- Configurações globais do sistema (key/value), gerenciadas apenas por superadmin.
-- Usada, p.ex., para definir a instância de WhatsApp de envio do sistema (relatórios).
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.system_settings enable row level security;

drop policy if exists "system_settings superadmin select" on public.system_settings;
create policy "system_settings superadmin select"
  on public.system_settings for select
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'superadmin'
  ));

drop policy if exists "system_settings superadmin write" on public.system_settings;
create policy "system_settings superadmin write"
  on public.system_settings for all
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'superadmin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'superadmin'
  ));
