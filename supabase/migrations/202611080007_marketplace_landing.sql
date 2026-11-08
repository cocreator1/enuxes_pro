create table public.marketplace_landing (
  id integer primary key check (id = 1),
  content jsonb not null default '{}' check (
    jsonb_typeof(content) = 'object' and octet_length(content::text) <= 64000
  )
);
insert into public.marketplace_landing (id) values (1);
alter table public.marketplace_landing enable row level security;
revoke all on public.marketplace_landing from public, anon, authenticated;
grant select on public.marketplace_landing to anon, authenticated;
grant update (content) on public.marketplace_landing to authenticated;
create policy landing_read on public.marketplace_landing for select to anon, authenticated using (true);
create policy landing_admin_update on public.marketplace_landing for update to authenticated
  using (exists (select 1 from public.platform_admins where user_id = (select auth.uid())))
  with check (exists (select 1 from public.platform_admins where user_id = (select auth.uid())));
