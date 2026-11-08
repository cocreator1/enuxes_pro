alter table public.store_content add column merchandising jsonb not null default '{}' check(jsonb_typeof(merchandising)='object' and octet_length(merchandising::text)<24000);
grant update(merchandising) on public.store_content to authenticated;
