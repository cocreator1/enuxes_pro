alter table public.store_content add column home_settings jsonb not null default '{}';

create function enuxes_private.validate_home_settings() returns trigger language plpgsql set search_path='' as $$
declare setting jsonb:=new.home_settings; slot text; key text;
begin
 if jsonb_typeof(setting)<>'object' or octet_length(setting::text)>2048 then raise exception 'Invalid home settings';end if;
 if setting='{}'::jsonb and old.home_settings='{}'::jsonb then return new;end if;
 if jsonb_typeof(setting->'order') is distinct from 'array' or jsonb_array_length(setting->'order')<>5
  or not (setting->'order' @> '["profile","slideshow","search","categories","featured"]'::jsonb)
  or jsonb_typeof(setting->'locks') is distinct from 'array'
  or not ('["profile","slideshow","search","categories","featured"]'::jsonb @> (setting->'locks'))
  or jsonb_typeof(setting->'colours') is distinct from 'object'
 then raise exception 'Invalid home layout';end if;
 foreach key in array array['primary','accent','background','card','text'] loop
  if coalesce(setting->'colours'->>key,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid store colour';end if;
 end loop;
 for slot in select jsonb_array_elements_text(coalesce(old.home_settings->'locks','[]')) loop
  if setting->'locks' ? slot and
   (select n from jsonb_array_elements_text(old.home_settings->'order') with ordinality x(v,n) where v=slot)
   <> (select n from jsonb_array_elements_text(setting->'order') with ordinality x(v,n) where v=slot)
  then raise exception 'Unlock the section before changing its position.';end if;
 end loop;
 return new;
end $$;
create trigger validate_home_settings before update of home_settings on public.store_content for each row execute function enuxes_private.validate_home_settings();

create function enuxes_private.save_owner_home(p_store uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.business_members where business_id=p_store and user_id=(select auth.uid())) then
  raise exception 'Store owner access required.' using errcode='42501';
 end if;
 update public.store_content set home_settings=p_settings where business_id=p_store;
 if not found then raise exception 'Store settings unavailable.';end if;
end $$;
create function public.save_owner_home(p_store uuid,p_settings jsonb)
returns void language sql security invoker set search_path='' as $$select enuxes_private.save_owner_home(p_store,p_settings)$$;
revoke all on function public.save_owner_home(uuid,jsonb),enuxes_private.save_owner_home(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_owner_home(uuid,jsonb),enuxes_private.save_owner_home(uuid,jsonb) to authenticated;
