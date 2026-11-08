alter table public.businesses add column marketplace_listed boolean not null default true;
grant select(marketplace_listed) on public.businesses to anon,authenticated;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.marketplace_search(text)'::regprocedure) into definition;
 execute replace(definition,'where b.active and','where b.active and b.marketplace_listed and');
end $migration$;
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check(payment_method in ('collection','card','wallet') or (payment_method='demo' and business_id='a0100000-0000-4000-8000-000000000001' and payment_status='PENDING'));
create function enuxes_private.trendora_order(p_request uuid,p_name text,p_mobile text,p_address text,p_lines jsonb,p_total bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare store_id constant uuid:='a0100000-0000-4000-8000-000000000001'; order_id uuid; fee integer; subtotal bigint;
begin
 if p_request is null or coalesce(length(btrim(p_address)),0) not between 5 and 250 or p_total is null then raise exception 'Enter valid delivery details.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(store_id::text || p_request::text,0));
 select id into order_id from public.orders where business_id=store_id and request_id=p_request and payment_method='demo';
 if found then return order_id;end if;
 select delivery_fee_minor into fee from public.business_settings where business_id=store_id and delivery_enabled for share;
 if not found then raise exception 'Demo delivery is unavailable.';end if;
 order_id:=enuxes_private.shop_order(store_id,p_request,p_name,p_mobile,p_lines);
 select subtotal_minor into subtotal from public.orders where id=order_id and business_id=store_id;
 if subtotal+fee<>p_total then raise exception 'Your total changed. Reopen the cart and review it before ordering.';end if;
 update public.orders set fulfilment='delivery',address=btrim(p_address),payment_method='demo',payment_status='PENDING',delivery_fee_minor=fee where id=order_id and business_id=store_id;
 return order_id;
end $$;
create function public.trendora_order(p_request uuid,p_name text,p_mobile text,p_address text,p_lines jsonb,p_total bigint)
returns uuid language sql security invoker set search_path='' as $$select enuxes_private.trendora_order(p_request,p_name,p_mobile,p_address,p_lines,p_total)$$;
revoke all on function public.trendora_order(uuid,text,text,text,jsonb,bigint),enuxes_private.trendora_order(uuid,text,text,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.trendora_order(uuid,text,text,text,jsonb,bigint),enuxes_private.trendora_order(uuid,text,text,text,jsonb,bigint) to anon,authenticated;
