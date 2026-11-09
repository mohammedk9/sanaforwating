-- ======================================================================
-- SANA — طلبات متعددة المنتجات (سلة) — 0008
-- يتطلب: 0005_external_orders.sql (create_external_order + external_order_items)
-- يضيف: p_extra_items إلى create_external_order فيحفظ كل عناصر السلة
-- ======================================================================

create or replace function public.create_external_order(
  p_customer_name text default null,
  p_phone text default null,
  p_item_id text default null,
  p_item_name text default null,
  p_quantity integer default 1,
  p_extra_items jsonb default '[]',
  p_delivery_type text default 'delivery',
  p_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_maps_url text default null,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer text := btrim(coalesce(p_customer_name,''));
  v_phone text := btrim(coalesce(p_phone,''));
  v_item text := btrim(coalesce(p_item_name,''));
  v_qty integer := coalesce(p_quantity, 1);
  v_type text := coalesce(p_delivery_type, 'delivery');
  v_item_id uuid;
  v_number text;
  v_order uuid;
  v_extra jsonb := coalesce(p_extra_items, '[]');
  v_extra_arr jsonb;
  v_el jsonb;
  v_el_id uuid;
  v_el_name text;
  v_el_qty integer;
  v_allergens text[];
  v_image text;
  v_i integer;
begin
  if v_customer = '' then return jsonb_build_object('ok', false, 'reason', 'invalid-customer-name'); end if;
  if v_phone !~ '^(05[0-9]{8}|\+9665[0-9]{8})$' then return jsonb_build_object('ok', false, 'reason', 'invalid-phone'); end if;
  if v_qty < 1 or v_qty > 20 then return jsonb_build_object('ok', false, 'reason', 'invalid-quantity'); end if;
  if v_type not in ('delivery','pickup') then return jsonb_build_object('ok', false, 'reason', 'invalid-delivery-type'); end if;

  -- المنتج الرئيسي (السطر الأول من السلة)
  if p_item_id is not null and btrim(p_item_id) <> '' then
    begin v_item_id := p_item_id::uuid;
    exception when others then v_item_id := null; end;
    if v_item_id is not null then
      select name, allergens, image_url into v_item, v_allergens, v_image
      from public.menu_items where id = v_item_id and active = true;
    end if;
  end if;

  -- عناصر إضافية من السلة (كل منتج مع كميته)
  if v_extra is not null and jsonb_typeof(v_extra) = 'array' then
    v_extra_arr := v_extra;
  else
    v_extra_arr := '[]'::jsonb;
  end if;

  if v_item = '' and jsonb_array_length(v_extra_arr) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-item-name');
  end if;

  v_number := (floor(random()*900000) + 100000)::text;
  insert into public.external_orders
    (number, customer_name, phone, item_id, item_name, quantity, delivery_type, address, lat, lng, maps_url, notes)
  values (v_number, v_customer, v_phone, v_item_id, v_item,
          v_qty, v_type,
          nullif(btrim(coalesce(p_address,'')), ''),
          p_lat, p_lng,
          nullif(btrim(coalesce(p_maps_url,'')), ''),
          nullif(btrim(coalesce(p_notes,'')), ''))
  returning id into v_order;

  -- السطر الرئيسي
  insert into public.external_order_items (order_id, item_name, quantity, allergens, image_url)
  values (v_order, v_item, v_qty, v_allergens, v_image);

  -- بنود إضافية (سلة متعددة)
  v_i := 0;
  while v_i < jsonb_array_length(v_extra_arr) loop
    v_el := v_extra_arr -> v_i;
    v_el_name := btrim(coalesce(v_el->>'name', ''));
    if v_el_name <> '' then
      v_el_qty := coalesce((v_el->>'quantity')::integer, 1);
      if v_el_qty < 1 or v_el_qty > 20 then v_el_qty := 1; end if;
      begin
        v_el_id := (v_el->>'id')::uuid;
      exception when others then
        v_el_id := null;
      end;
      if v_el_id is not null then
        select name, allergens, image_url into v_el_name, v_allergens, v_image
        from public.menu_items where id = v_el_id and active = true;
      end if;
      insert into public.external_order_items (order_id, item_name, quantity, allergens, image_url)
      values (v_order, v_el_name, v_el_qty, v_allergens, v_image);
    end if;
    v_i := v_i + 1;
  end loop;

  return jsonb_build_object('ok', true, 'number', v_number, 'orderId', v_order::text);
end $$;

revoke all on function public.create_external_order(text, text, text, text, integer, text, text, text, double precision, double precision, text, text) from PUBLIC, anon;
grant execute on function public.create_external_order(text, text, text, text, integer, text, text, double precision, double precision, text, text) to anon, authenticated;
