-- ======================================================================
-- SANA — الطلبات الخارجية + المنيو (0005) — نسخة مُصحَّحة وكاملة
-- يتطلب تشغيل 0004_admin.sql أولاً.
-- الصق كاملاً في Supabase ← SQL Editor ← Run (آمن للتكرار)
-- ======================================================================

-- ---------------------------------------------------------------- menu_items
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  allergens text[] not null default '{}',
  price numeric(10,2) not null default 0 check (price >= 0),
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;

drop policy if exists menu_public_read on public.menu_items;
create policy menu_public_read on public.menu_items
  for select to anon, authenticated using (active = true);
drop policy if exists menu_staff_all on public.menu_items;
create policy menu_staff_all on public.menu_items for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

revoke all privileges on table public.menu_items from PUBLIC, anon, authenticated;
grant select on table public.menu_items to anon, authenticated;
grant insert, update, delete on table public.menu_items to authenticated;

-- ---------------------------------------------------------------- external_orders
create table if not exists public.external_orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  customer_name text not null default 'مستخدم',
  phone text not null,
  item_id uuid references public.menu_items(id) on delete set null,
  item_name text not null,
  quantity integer not null default 1 check (quantity between 1 and 20),
  delivery_type text not null default 'delivery' check (delivery_type in ('delivery','pickup')),
  address text, lat double precision, lng double precision, maps_url text, notes text,
  status text not null default 'preparing'
    check (status in ('preparing','ready','cancelled','delivered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.external_orders enable row level security;

drop policy if exists ext_customer_read on public.external_orders;
create policy ext_customer_read on public.external_orders
  for select to anon, authenticated using (true);
drop policy if exists ext_staff_update on public.external_orders;
create policy ext_staff_update on public.external_orders for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
drop policy if exists ext_staff_insert on public.external_orders;
create policy ext_staff_insert on public.external_orders
  for insert to authenticated with check ((select private.is_staff()));
drop policy if exists ext_customer_insert on public.external_orders;
create policy ext_customer_insert on public.external_orders
  for insert to anon, authenticated with check (true);

revoke all privileges on table public.external_orders from PUBLIC, anon, authenticated;
grant select, insert on table public.external_orders to anon, authenticated;
grant update, delete on table public.external_orders to authenticated;

-- ---------------------------------------------------------------- external_order_items
create table if not exists public.external_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.external_orders(id) on delete cascade,
  item_name text not null,
  quantity integer not null default 1 check (quantity between 1 and 20),
  allergens text[] not null default '{}',
  image_url text
);
alter table public.external_order_items enable row level security;

drop policy if exists ext_items_read on public.external_order_items;
create policy ext_items_read on public.external_order_items
  for select to anon, authenticated using (true);
drop policy if exists ext_items_insert on public.external_order_items;
create policy ext_items_insert on public.external_order_items
  for insert to anon, authenticated with check (true);

revoke all privileges on table public.external_order_items from PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- RPCs
create or replace function public.list_menu()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id::text, 'name', m.name, 'imageUrl', coalesce(m.image_url,''),
      'allergens', to_jsonb(m.allergens), 'price', m.price, 'description', coalesce(m.description,'')
    ) order by m.sort_order, m.created_at
  ), '[]'::jsonb) from public.menu_items m where m.active = true;
$$;
revoke all on function public.list_menu() from PUBLIC, anon;
grant execute on function public.list_menu() to anon, authenticated;

create or replace function public.create_external_order(
  p_customer_name text default 'مستخدم', p_phone text default null, p_item_id text default null,
  p_item_name text default null, p_quantity integer default 1, p_delivery_type text default 'delivery',
  p_address text default null, p_lat double precision default null, p_lng double precision default null,
  p_maps_url text default null, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_phone text := btrim(coalesce(p_phone,''));
  v_name  text := btrim(coalesce(p_customer_name,''));
  v_item  text := btrim(coalesce(p_item_name,''));
  v_qty   integer := coalesce(p_quantity, 1);
  v_type  text := coalesce(nullif(btrim(coalesce(p_delivery_type,'')),''),'delivery');
  v_item_id uuid; v_number text; v_order uuid;
  v_allergens text[] := '{}'; v_image text;
begin
  if v_phone !~ '^(05\d{8}|\+9665\d{8})$' then return jsonb_build_object('ok', false, 'reason', 'invalid-phone'); end if;
  if v_name = '' then v_name := 'مستخدم'; end if;
  if v_item = '' then return jsonb_build_object('ok', false, 'reason', 'invalid-item'); end if;
  if v_qty < 1 or v_qty > 20 then return jsonb_build_object('ok', false, 'reason', 'invalid-quantity'); end if;
  if v_type not in ('delivery','pickup') then return jsonb_build_object('ok', false, 'reason', 'invalid-delivery-type'); end if;
  if v_type = 'delivery' and btrim(coalesce(p_address,'')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing-address');
  end if;
  if p_item_id is not null and btrim(p_item_id) <> '' then
    begin v_item_id := p_item_id::uuid;
    exception when others then v_item_id := null; end;
    if v_item_id is not null then
      select name, allergens, image_url into v_item, v_allergens, v_image
      from public.menu_items where id = v_item_id and active = true;
    end if;
  end if;
  loop
    v_number := (floor(random()*900000 + 100000))::int::text;
    exit when not exists (select 1 from public.external_orders where number = v_number);
  end loop;
  insert into public.external_orders
    (number, customer_name, phone, item_id, item_name, quantity, delivery_type, address, lat, lng, maps_url, notes)
  values (v_number, v_name, v_phone, v_item_id, v_item, v_qty, v_type,
    nullif(btrim(coalesce(p_address,'')),''),
    p_lat, p_lng,
    nullif(btrim(coalesce(p_maps_url,'')),''),
    nullif(btrim(coalesce(p_notes,'')), ''))
  returning id into v_order;
  insert into public.external_order_items (order_id, item_name, quantity, allergens, image_url)
  values (v_order, v_item, v_qty, v_allergens, v_image);
  return jsonb_build_object('ok', true, 'number', v_number, 'orderId', v_order::text);
end $$;
revoke all on function public.create_external_order(text, text, text, text, integer, text, text, double precision, double precision, text, text) from PUBLIC, anon;
grant execute on function public.create_external_order(text, text, text, text, integer, text, text, double precision, double precision, text, text) to anon, authenticated;

create or replace function public.get_external_order(p_number text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_number text := btrim(coalesce(p_number,''));
  v_phone  text := btrim(coalesce(p_phone,''));
  v_status text; v_updated timestamptz;
  v_name text; v_item text; v_qty integer; v_type text;
begin
  select status, updated_at, customer_name, item_name, quantity, delivery_type
    into v_status, v_updated, v_name, v_item, v_qty, v_type
  from public.external_orders
  where number = v_number and (v_phone = '' or phone = v_phone) limit 1;
  if v_status is null then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'updatedAt', v_updated,
    'customerName', v_name, 'itemName', v_item, 'quantity', v_qty, 'deliveryType', v_type);
end $$;
revoke all on function public.get_external_order(text, text) from PUBLIC, anon;
grant execute on function public.get_external_order(text, text) to anon, authenticated;


create or replace function public.admin_list_external_orders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id::text, 'number', o.number, 'customerName', o.customer_name, 'phone', o.phone,
      'itemName', o.item_name, 'quantity', o.quantity, 'deliveryType', o.delivery_type,
      'address', coalesce(o.address,''), 'lat', o.lat, 'lng', o.lng,
      'mapsUrl', coalesce(o.maps_url,''), 'notes', coalesce(o.notes,''),
      'status', o.status, 'createdAt', o.created_at, 'updatedAt', o.updated_at
    ) order by o.created_at desc
  ), '[]'::jsonb) into v_rows from public.external_orders o;
  return v_rows;
end $$;
revoke all on function public.admin_list_external_orders() from PUBLIC, anon;
grant execute on function public.admin_list_external_orders() to authenticated;

create or replace function public.admin_set_external_status(p_number text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_number text := btrim(coalesce(p_number,''));
  v_status text := coalesce(nullif(btrim(coalesce(p_status,'')),''),'preparing');
begin
  perform private.require_staff();
  if v_number = '' then return jsonb_build_object('ok', false, 'reason', 'invalid-number'); end if;
  if v_status not in ('preparing','ready','cancelled','delivered') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-status');
  end if;
  update public.external_orders set status = v_status, updated_at = now() where number = v_number;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  return jsonb_build_object('ok', true, 'number', v_number, 'status', v_status);
end $$;
revoke all on function public.admin_set_external_status(text, text) from PUBLIC, anon;
grant execute on function public.admin_set_external_status(text, text) to authenticated;

create or replace function public.admin_list_menu()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id::text, 'name', m.name, 'imageUrl', coalesce(m.image_url,''),
      'allergens', to_jsonb(m.allergens), 'price', m.price, 'description', coalesce(m.description,''),
      'active', m.active, 'sortOrder', m.sort_order
    ) order by m.sort_order, m.created_at
  ), '[]'::jsonb) into v_rows from public.menu_items m;
  return v_rows;
end $$;
revoke all on function public.admin_list_menu() from PUBLIC, anon;
grant execute on function public.admin_list_menu() to authenticated;

create or replace function public.admin_upsert_menu_item(
  p_id text default null, p_name text default null, p_image_url text default null,
  p_allergens text[] default null, p_price numeric default null,
  p_description text default null, p_active boolean default null, p_sort integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name,''));
  v_image text := nullif(btrim(coalesce(p_image_url,'')), '');
  v_allergens text[] := coalesce(p_allergens, '{}');
  v_price numeric := coalesce(p_price, 0);
  v_desc text := nullif(btrim(coalesce(p_description,'')), '');
  v_active boolean := coalesce(p_active, true);
  v_sort integer := coalesce(p_sort, 0);
begin
  perform private.require_staff();
  if v_name = '' then return jsonb_build_object('ok', false, 'reason', 'invalid-name'); end if;
  if v_image is not null and v_image !~ '^https?://' and v_image !~ '^\./assets/' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-image');
  end if;
  if v_price < 0 then return jsonb_build_object('ok', false, 'reason', 'invalid-price'); end if;
  if p_id is null or btrim(p_id) = '' then
    insert into public.menu_items (name, image_url, allergens, price, description, active, sort_order)
    values (v_name, v_image, v_allergens, v_price, v_desc, v_active, v_sort) returning id into v_id;
  else
    begin v_id := p_id::uuid;
    exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
    update public.menu_items set
      name = v_name, image_url = v_image, allergens = v_allergens,
      price = v_price, description = v_desc, active = v_active, sort_order = v_sort, updated_at = now()
    where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id::text);
end $$;
revoke all on function public.admin_upsert_menu_item(text, text, text, text[], numeric, text, boolean, integer) from PUBLIC, anon;
grant execute on function public.admin_upsert_menu_item(text, text, text, text[], numeric, text, boolean, integer) to authenticated;

create or replace function public.admin_delete_menu_item(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_staff();
  begin v_id := p_id::uuid;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
  delete from public.menu_items where id = v_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_delete_menu_item(text) from PUBLIC, anon;
grant execute on function public.admin_delete_menu_item(text) to authenticated;

select (select count(*) from public.menu_items) as menu_count,
       (select count(*) from public.external_orders) as external_orders_count;

grant select, insert on table public.external_order_items to anon, authenticated;
