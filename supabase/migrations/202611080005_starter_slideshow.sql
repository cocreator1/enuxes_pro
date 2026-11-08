do $$declare d text; begin
 select pg_get_functiondef('public.provision_store_draft(text,text,text,text,uuid)'::regprocedure) into d;
 execute replace(d,'jsonb_build_object(''kind'',''image'',''images''','jsonb_build_object(''kind'',''slideshow'',''interval'',3,''images''');
end$$;
