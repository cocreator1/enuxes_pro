alter table public.businesses add column demo_pack text, add column owner_published_at timestamptz;
grant select(demo_pack,owner_published_at) on public.businesses to anon,authenticated;
alter table public.products add column starter_item boolean not null default false;
alter table public.products drop constraint products_price_minor_check;
alter table public.products add constraint products_price_minor_check check(price_minor>0 or (price_minor=0 and starter_item));
grant delete on public.products to authenticated;
create policy managed_owner_delete on public.products for delete to authenticated using (
 exists(select 1 from public.business_members m join public.businesses b on b.id=m.business_id where m.business_id=products.business_id and m.user_id=(select auth.uid()) and b.demo_pack is not null)
);

create function enuxes_private.demo_image(url text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(url,'') ~* '(^|/)demo-packs(/|%2f)'
$$;
create function enuxes_private.draft_issues(store public.businesses) returns jsonb language plpgsql stable set search_path='' as $$
declare issues jsonb:='[]'; content public.store_content; item public.products; block jsonb; issue text;
begin
 if lower(btrim(store.name)) in ('','store name') then issues:=issues||jsonb_build_object('tab','Business profile','message','Replace Store Name with your business name.');end if;
 if nullif(btrim(store.description),'') is null then issues:=issues||jsonb_build_object('tab','Business profile','message','Add a store description.');end if;
 select * into content from public.store_content where business_id=store.id;
 if coalesce(content.logo,'') !~ '^https://' or enuxes_private.demo_image(content.logo) then issues:=issues||jsonb_build_object('tab','Business profile','message','Upload your own profile image.');end if;
 if not exists(select 1 from public.products where business_id=store.id and active) then issues:=issues||jsonb_build_object('tab','Products','message','Add at least one product and show it in the catalogue.');end if;
 for item in select * from public.products where business_id=store.id order by id loop
  issue:=concat_ws(', ',
    case when lower(btrim(item.name)) in ('','product name') then 'name' end,
    case when coalesce(item.image_url,'') !~ '^https://' or enuxes_private.demo_image(item.image_url) or exists(select 1 from unnest(item.gallery) u where enuxes_private.demo_image(u)) then 'image' end,
    case when item.price_minor<=0 then 'price' end,
    case when nullif(btrim(item.category),'') is null then 'category' end,
    case when nullif(btrim(item.description),'') is null then 'description' end);
  if issue<>'' then issues:=issues||jsonb_build_object('tab','Products','id',item.id,'message',item.name||' needs: '||issue||'.');end if;
 end loop;
 for block in select value from jsonb_array_elements(coalesce(content.blocks,'[]')) loop
  if block->>'kind' in ('image','slideshow') and (jsonb_array_length(coalesce(block->'images','[]'))=0 or exists(select 1 from jsonb_array_elements_text(coalesce(block->'images','[]')) url where url !~ '^https://' or enuxes_private.demo_image(url))) then
   issues:=issues||jsonb_build_object('tab','Store builder','message','Replace or remove the starter banner or image section.');
  elsif block->>'kind'='text' and nullif(btrim(block->>'text'),'') is null then
   issues:=issues||jsonb_build_object('tab','Store builder','message','Complete or remove empty text sections.');
  end if;
 end loop;
 return issues;
end $$;
create function enuxes_private.guard_draft_visibility() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.demo_pack is not null and new.active then
  if new.owner_published_at is null then raise exception 'The store owner must publish this draft first.';end if;
  if enuxes_private.draft_issues(new)<>'[]'::jsonb then raise exception 'Complete the Ready to Publish checklist first.';end if;
 end if;
 return new;
end $$;
create trigger guard_draft_visibility before insert or update on public.businesses for each row execute function enuxes_private.guard_draft_visibility();
create function enuxes_private.guard_live_draft_content() returns trigger language plpgsql security definer set search_path='' as $$
declare store public.businesses;
begin
 select * into store from public.businesses where id=case when tg_op='DELETE' then old.business_id else new.business_id end for update;
 if store.demo_pack is not null and store.active and enuxes_private.draft_issues(store)<>'[]'::jsonb then
  raise exception 'This edit would leave the live store incomplete.';
 end if;
 return null;
end $$;
create trigger guard_live_products after insert or update of name,image_url,gallery,price_minor,category,description,active or delete on public.products for each row execute function enuxes_private.guard_live_draft_content();
create trigger guard_live_store_content after update of logo,blocks or delete on public.store_content for each row execute function enuxes_private.guard_live_draft_content();

create function enuxes_private.owner_draft(p_store uuid,p_publish boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare store public.businesses; issues jsonb;
begin
 if not exists(select 1 from public.business_members where business_id=p_store and user_id=(select auth.uid())) then raise exception 'Store access required' using errcode='42501';end if;
 select * into store from public.businesses where id=p_store for update;
 if store.demo_pack is null then raise exception 'This store does not use the demo checklist.';end if;
 issues:=enuxes_private.draft_issues(store);
 if p_publish and issues='[]'::jsonb then
  if store.owner_published_at is not null or store.lifecycle<>'closed' then raise exception 'This store cannot be published from this status.';end if;
  update public.businesses set active=true,lifecycle='active',owner_published_at=now() where id=p_store;
 end if;
 return issues;
end $$;
create function public.owner_draft(p_store uuid,p_publish boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select enuxes_private.owner_draft(p_store,p_publish)$$;
revoke all on function public.owner_draft(uuid,boolean),enuxes_private.owner_draft(uuid,boolean) from public,anon,authenticated;
grant execute on function public.owner_draft(uuid,boolean),enuxes_private.owner_draft(uuid,boolean) to authenticated;
revoke all on function enuxes_private.draft_issues(public.businesses),enuxes_private.guard_draft_visibility(),enuxes_private.guard_live_draft_content() from public,anon,authenticated;

create function public.provision_store_draft(p_slug text,p_type text,p_package text,p_pack text,p_owner uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare store_id uuid; root text; categories text[];
begin
 if not coalesce(case p_type
  when 'RESTAURANT' then p_pack='restaurant' when 'CAFE' then p_pack='restaurant'
  when 'BAR' then p_pack='bar' when 'HOTEL' then p_pack='fallback'
  when 'ONLINE_STORE' then p_pack in ('general','clothing') when 'RETAIL' then p_pack in ('general','clothing')
  when 'OTHER' then p_pack in ('fallback','barbershop') else false end,false) then raise exception 'Invalid image pack for this category';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('store-draft:'||p_slug,0));
 select b.id into store_id from public.businesses b join public.business_members m on m.business_id=b.id where b.slug=p_slug and b.demo_pack is not null and m.user_id=p_owner;
 if found then return store_id;end if;
 store_id:=public.provision_store_record(p_slug,'Store Name',p_type,p_package,'',false,p_owner);
 root:='https://www.enuxes.com/demo-packs/'||p_pack||'/';
 categories:=case p_pack
  when 'clothing' then array['Hoodies & Sweats','Everyday Basics','Outerwear','Footwear']
  when 'restaurant' then array['Burgers','Meals','Desserts','Drinks']
  when 'bar' then array['Cocktails','Mocktails','Bottles','Snacks']
  when 'barbershop' then array['Tools','Tools','Care','Services']
  else array['Everyday','Accessories','Accessories','Featured'] end;
 update public.businesses set demo_pack=p_pack where id=store_id;
 update public.store_content set logo=root||'profile.webp',blocks=jsonb_build_array(jsonb_build_object('kind','image','images',jsonb_build_array(root||'banner.webp')),jsonb_build_object('kind','catalogue')) where business_id=store_id;
 insert into public.products(business_id,name,category,price_minor,image_url,starter_item,active)
 select store_id,'Product Name',categories[i],0,root||'item-'||i||'.webp',true,true from generate_series(1,4) i;
 return store_id;
end $$;
revoke all on function public.provision_store_draft(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.provision_store_draft(text,text,text,text,uuid) to service_role;
