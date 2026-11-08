do $$begin
 if exists(select 1 from public.businesses where slug='trendora' and id<>'a0100000-0000-4000-8000-000000000001') then raise exception 'Trendora slug already belongs to another store';end if;
end$$;
insert into public.businesses(id,slug,name,type,description,active,lifecycle,marketplace_listed)
 values('a0100000-0000-4000-8000-000000000001','trendora','TRENDORA','ONLINE_STORE','Everyday essentials in earthy tones.',true,'active',false) on conflict(id) do nothing;
insert into public.business_members(user_id,business_id)
 select user_id,'a0100000-0000-4000-8000-000000000001' from public.platform_admins where user_id='6028299e-3e88-46d9-b017-9aaf5fac0dd3'
 on conflict do nothing;
insert into public.business_settings(business_id,delivery_enabled,delivery_fee_minor) values('a0100000-0000-4000-8000-000000000001',true,5000) on conflict do nothing;
insert into public.store_themes(business_id,accent) values('a0100000-0000-4000-8000-000000000001','#075C3A') on conflict do nothing;
update public.store_content set logo='https://www.enuxes.com/trendora-media/profile.webp',category='Clothing' where business_id='a0100000-0000-4000-8000-000000000001' and logo='' and category='';
insert into public.products(id,business_id,name,category,description,sku,image_url,price_minor,sale_price_minor,sizes,colours,stock,active,gallery) values
('a0100000-0000-4000-8000-000000000002','a0100000-0000-4000-8000-000000000001','Olive Pullover Hoodie','Hoodies & Sweats','A soft brushed-fleece pullover with a roomy hood and kangaroo pocket.','TR-1','https://www.enuxes.com/trendora-media/hoodie.webp',49900,null,array['S','M','L','XL'],array['Olive'],24,true,array['https://www.enuxes.com/trendora-media/hoodie-seam.webp','https://www.enuxes.com/trendora-media/hoodie-pocket.webp']),
('a0100000-0000-4000-8000-000000000003','a0100000-0000-4000-8000-000000000001','Essential T-Shirt','Everyday Basics','A relaxed cotton tee with a ribbed crew neck.','TR-2','https://www.enuxes.com/trendora-media/tee.webp',19900,null,array['S','M','L','XL'],array['Cream'],30,true,'{}'),
('a0100000-0000-4000-8000-000000000004','a0100000-0000-4000-8000-000000000001','Crewneck Sweatshirt','Hoodies & Sweats','Midweight fleece with ribbed cuffs and hem.','TR-3','https://www.enuxes.com/trendora-media/crew.webp',39900,34900,array['S','M','L','XL'],array['Olive'],16,true,'{}'),
('a0100000-0000-4000-8000-000000000005','a0100000-0000-4000-8000-000000000001','Utility Overshirt','Outerwear','A twill overshirt with two buttoned chest pockets.','TR-4','https://www.enuxes.com/trendora-media/overshirt.webp',64900,null,array['S','M','L','XL'],array['Khaki'],12,true,'{}'),
('a0100000-0000-4000-8000-000000000006','a0100000-0000-4000-8000-000000000001','Puffer Jacket','Outerwear','A quilted jacket with a high collar and full zip.','TR-5','https://www.enuxes.com/trendora-media/puffer.webp',129900,null,array['S','M','L','XL'],array['Black'],0,true,'{}'),
('a0100000-0000-4000-8000-000000000007','a0100000-0000-4000-8000-000000000001','Jogger Pants','Everyday Basics','Tapered joggers with a soft elastic waist and drawcord.','TR-6','https://www.enuxes.com/trendora-media/joggers.webp',34900,29900,array['S','M','L','XL'],array['Olive'],22,true,'{}')
on conflict(id) do nothing;
grant update(status) on public.orders to authenticated;
create policy order_owner_fulfilment on public.orders for update to authenticated
using(business_id in (select m.business_id from public.business_members m where m.user_id=(select auth.uid())))
with check(business_id in (select m.business_id from public.business_members m where m.user_id=(select auth.uid())));
