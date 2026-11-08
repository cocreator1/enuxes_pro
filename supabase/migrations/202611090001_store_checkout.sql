alter table public.orders add column tip_minor integer not null default 0 check(tip_minor between 0 and 100000);
alter table public.orders alter column total_minor set expression as (subtotal_minor + delivery_fee_minor + tip_minor);
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check(payment_method in ('collection','card','wallet','pay2cell','cash') or (payment_method='demo' and business_id='a0100000-0000-4000-8000-000000000001' and payment_status='PENDING'));

CREATE OR REPLACE FUNCTION enuxes_private.store_checkout(p_business uuid, p_request uuid, p_name text, p_mobile text, p_lines jsonb, p_fulfilment text, p_payment text, p_address text, p_directions text, p_tip integer, p_total bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item record; product public.products%rowtype; order_id uuid; subtotal bigint:=0; unit integer; settings public.business_settings%rowtype; config jsonb; fee integer:=0;
begin
 if p_request is null or coalesce(length(btrim(p_name)),0) not between 1 and 100 or coalesce(length(btrim(p_mobile)),0) not between 5 and 30
 or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Check your checkout details';end if;
 if p_fulfilment is null or p_fulfilment not in ('collection','delivery') or p_payment is null or p_total is null or p_tip is null or p_tip not between 0 and 100000
 or coalesce(length(btrim(p_directions)),0)>500 or (p_fulfilment='delivery' and coalesce(length(btrim(p_address)),0) not between 5 and 250)
 then raise exception 'Check your fulfilment details'; end if;
 select s.* into settings from public.businesses b join public.business_settings s on b.id=s.business_id where b.id=p_business and b.active for share of b,s;
 if not found then raise exception 'Checkout is unavailable'; end if;
 select merchandising->'checkout' into config from public.store_content where business_id=p_business for share;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business::text || p_request::text,0));
 select id into order_id from public.orders where business_id=p_business and request_id=p_request;
 if found then return order_id;end if;
 if p_fulfilment='delivery' then
  if not coalesce(config->'delivery'='true'::jsonb,settings.delivery_enabled) then raise exception 'Drop-off is unavailable';end if;
  fee:=coalesce((config->>'fee')::integer,settings.delivery_fee_minor,0);
 elsif not coalesce(config->'pickup'='true'::jsonb,settings.collection_enabled) then raise exception 'Pick-up is unavailable';end if;
 if fee<0 or (p_tip>0 and config->'tips' is distinct from 'true'::jsonb) then raise exception 'Check delivery fee and tip';end if;
 if not coalesce(case p_payment
  when 'collection' then p_fulfilment='collection' and coalesce(config->'collection'='true'::jsonb,settings.collection_payment_enabled)
  when 'cash' then p_fulfilment='delivery' and config->'cash'='true'::jsonb
  when 'demo' then p_fulfilment='delivery' and config is null and p_business='a0100000-0000-4000-8000-000000000001'
  when 'card' then config->'card'='true'::jsonb and nullif(btrim(config->>'cardInstructions'),'') is not null
  when 'wallet' then config->'wallet'='true'::jsonb and nullif(btrim(config->>'walletInstructions'),'') is not null
  when 'pay2cell' then config->'pay2cell'='true'::jsonb and nullif(btrim(config->>'pay2cellInstructions'),'') is not null
  else false end,false) then raise exception 'Choose an available payment method';end if;
 if exists(select 1 from jsonb_to_recordset(p_lines) as x(id uuid,quantity integer) group by id having sum(quantity)>99) then raise exception 'An item quantity is unavailable';end if;
 insert into public.orders(business_id,request_id,customer_name,mobile,fulfilment,payment_method,payment_status,subtotal_minor,address,notes,delivery_fee_minor,tip_minor)
 values(p_business,p_request,btrim(p_name),btrim(p_mobile),p_fulfilment,p_payment,case when p_payment='collection' then 'PAY_ON_COLLECTION' else 'PENDING' end,0,case when p_fulfilment='delivery' then btrim(p_address) end,nullif(btrim(p_directions),''),fee,p_tip) returning id into order_id;
 for item in select * from jsonb_to_recordset(p_lines) as x(id uuid,size text,colour text,quantity integer) order by id loop
  select * into product from public.products where id=item.id and business_id=p_business and active for update;
  if not found or item.quantity is null or item.quantity not between 1 and 99 or coalesce(product.stock,99)<item.quantity
   or (cardinality(product.sizes)>0 and not coalesce(item.size=any(product.sizes),false))
   or (cardinality(product.colours)>0 and not coalesce(item.colour=any(product.colours),false))
   or (cardinality(product.sizes)=0 and item.size is not null)
   or (cardinality(product.colours)=0 and item.colour is not null)
   then raise exception 'An item, option or quantity is unavailable';end if;
  unit:=coalesce(product.sale_price_minor,product.price_minor);
  update public.products set stock=stock-item.quantity where id=product.id and stock is not null;
  insert into public.order_items(business_id,order_id,product_id,product_name,size,colour,quantity,unit_price_minor)
  values(p_business,order_id,product.id,product.name,item.size,item.colour,item.quantity,unit);
  subtotal:=subtotal+unit::bigint*item.quantity;
 end loop;
 if subtotal+fee+p_tip<>p_total then raise exception 'Your total changed. Reopen the cart and review it before ordering.';end if;
 update public.orders set subtotal_minor=subtotal where id=order_id;
 return order_id;
end $function$
;

create function public.store_checkout(p_business uuid,p_request uuid,p_name text,p_mobile text,p_lines jsonb,p_fulfilment text,p_payment text,p_address text,p_directions text,p_tip integer,p_total bigint)
returns uuid language sql security definer set search_path to '' as $$
 select enuxes_private.store_checkout(p_business,p_request,p_name,p_mobile,p_lines,p_fulfilment,p_payment,p_address,p_directions,p_tip,p_total)
$$;
revoke execute on function public.store_checkout(uuid,uuid,text,text,jsonb,text,text,text,text,integer,bigint) from public,anon,authenticated;
revoke execute on function enuxes_private.store_checkout(uuid,uuid,text,text,jsonb,text,text,text,text,integer,bigint) from public,anon,authenticated;
grant execute on function public.store_checkout(uuid,uuid,text,text,jsonb,text,text,text,text,integer,bigint) to anon,authenticated;

