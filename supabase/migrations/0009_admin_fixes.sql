-- ======================================================================
-- SANA — إصلاحات لوحة الإدارة (0009)
-- يتطلب: 0004_admin + 0005_external_orders + 0006_push + 0008_multiitem_orders
-- الصق كاملا في Supabase ← SQL Editor ← Run (آمن للتكرار)
-- ======================================================================

-- ---------------------------------------------------------------- 1) صلاحيات الموظف/المدير
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_members
    where user_id = (select auth.uid()) and role = 'admin'
  ) $$;
revoke all on function private.is_admin() from PUBLIC, anon;
grant execute on function private.is_admin() to authenticated;

create or replace function private.require_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (select private.is_admin()) then
    raise exception 'not-admin' using errcode = 'P0001';
  end if;
end $$;
revoke all on function private.require_admin() from PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- 2) توحيد حالات الطلب (delivered)
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('preparing','ready','cancelled','delivered'));

-- ---------------------------------------------------------------- 3) سجل التدقيق
create table if not exists public.admin_audit_logs (
  id bigserial primary key,
  entity text not null,
  entity_id text not null,
  action text not null,
  from_status text,
  to_status text,
  actor uuid,
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit_logs (created_at desc);
alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from PUBLIC, anon, authenticated;

create or replace function private.log_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select email into v_email from auth.users where id = (select auth.uid());
  insert into public.admin_audit_logs (entity, entity_id, action, from_status, to_status, actor, actor_email)
  values (tg_table_name, coalesce(new.number, old.number, '')::text, 'status-change',
          old.status, new.status, (select auth.uid()), v_email);
  return new;
end $$;
revoke all on function private.log_order_status_change() from PUBLIC, anon, authenticated;

drop trigger if exists trg_ext_order_status on public.external_orders;
create trigger trg_ext_order_status
  after update of status on public.external_orders
  for each row when (old.status is distinct from new.status)
  execute function private.log_order_status_change();

drop trigger if exists trg_order_status on public.orders;
create trigger trg_order_status
  after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function private.log_order_status_change();

-- ---------------------------------------------------------------- 4) قائمة الطلبات الخارجية + عناصر السلة
drop function if exists public.admin_list_external_orders();

create or replace function public.admin_list_external_orders(
  p_status text default null,
  p_search text default null,
  p_limit integer default 200
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select
      o.id::text as id,
      o.number,
      o.customer_name as "customerName",
      o.phone,
      o.item_name as "itemName",
      o.quantity,
      o.delivery_type as "deliveryType",
      coalesce(o.address, '') as address,
      o.lat, o.lng,
      coalesce(o.maps_url, '') as "mapsUrl",
      coalesce(o.notes, '') as notes,
      o.status,
      o.created_at as "createdAt",
      o.updated_at as "updatedAt",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', i.item_name,
          'quantity', i.quantity,
          'allergens', to_jsonb(i.allergens),
          'imageUrl', coalesce(i.image_url, '')
        ) order by i.id)
        from public.external_order_items i where i.order_id = o.id
      ), '[]'::jsonb) as items,
      (select coalesce(sum(i.quantity), 0) from public.external_order_items i where i.order_id = o.id) as "itemsCount"
    from public.external_orders o
    where (p_status is null or btrim(p_status) = '' or o.status = btrim(p_status))
      and (
        p_search is null or btrim(p_search) = ''
        or o.number ilike '%' || btrim(p_search) || '%'
        or o.customer_name ilike '%' || btrim(p_search) || '%'
        or o.phone ilike '%' || btrim(p_search) || '%'
      )
    order by o.created_at desc
    limit greatest(coalesce(p_limit, 200), 1)
  ) t;
  return v_rows;
end $$;
revoke all on function public.admin_list_external_orders(text, text, integer) from PUBLIC, anon;
grant execute on function public.admin_list_external_orders(text, text, integer) to authenticated;

-- ---------------------------------------------------------------- 5) قائمة الطلبات الداخلية
create or replace function public.admin_list_orders(
  p_status text default null,
  p_search text default null,
  p_limit integer default 200
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select o.number, o.status, o.created_at as "createdAt", o.updated_at as "updatedAt"
    from public.orders o
    where (p_status is null or btrim(p_status) = '' or o.status = btrim(p_status))
      and (p_search is null or btrim(p_search) = '' or o.number ilike '%' || btrim(p_search) || '%')
    order by o.created_at desc
    limit greatest(coalesce(p_limit, 200), 1)
  ) t;
  return v_rows;
end $$;
revoke all on function public.admin_list_orders(text, text, integer) from PUBLIC, anon;
grant execute on function public.admin_list_orders(text, text, integer) to authenticated;

-- ---------------------------------------------------------------- 6) تحديث حالة الطلب الداخلي (يقبل delivered)
create or replace function public.admin_upsert_order(p_number text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_number text := btrim(coalesce(p_number, ''));
  v_status text := coalesce(nullif(btrim(coalesce(p_status, '')), ''), 'preparing');
  v_venue uuid;
begin
  perform private.require_staff();
  if v_number = '' or v_number !~ '^\d{2,12}$' then return jsonb_build_object('ok', false, 'reason', 'invalid-number'); end if;
  if v_status not in ('preparing','ready','cancelled','delivered') then return jsonb_build_object('ok', false, 'reason', 'invalid-status'); end if;
  select id into v_venue from public.venues where code = 'SANA-01' limit 1;
  insert into public.orders (number, venue_id, status)
  values (v_number, v_venue, v_status)
  on conflict (number) do update set status = excluded.status, updated_at = now();
  return jsonb_build_object('ok', true, 'number', v_number, 'status', v_status);
end $$;
revoke all on function public.admin_upsert_order(text, text) from PUBLIC, anon;
grant execute on function public.admin_upsert_order(text, text) to authenticated;

-- ---------------------------------------------------------------- 7) سجل التدقيق (للموظف)
create or replace function public.admin_list_audit(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select entity, entity_id as "entityId", action, from_status as "fromStatus",
           to_status as "toStatus", actor_email as "actorEmail", created_at as "createdAt"
    from public.admin_audit_logs
    order by created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) t;
  return v_rows;
end $$;
revoke all on function public.admin_list_audit(integer) from PUBLIC, anon;
grant execute on function public.admin_list_audit(integer) to authenticated;

-- ---------------------------------------------------------------- 8) إدارة الموظفين (للمدير فقط)
create or replace function public.admin_list_staff()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', u.id::text, 'email', u.email, 'role', s.role, 'createdAt', s.created_at
  ) order by s.created_at), '[]'::jsonb) into v_rows
  from public.staff_members s
  join auth.users u on u.id = s.user_id;
  return v_rows;
end $$;
revoke all on function public.admin_list_staff() from PUBLIC, anon;
grant execute on function public.admin_list_staff() to authenticated;

create or replace function public.admin_add_staff(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_email text := btrim(coalesce(p_email, ''));
begin
  perform private.require_admin();
  if v_email = '' then return jsonb_build_object('ok', false, 'reason', 'invalid-email'); end if;
  select id into v_uid from auth.users where lower(email) = lower(v_email) limit 1;
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'user-not-found'); end if;
  insert into public.staff_members (user_id, role) values (v_uid, 'staff')
  on conflict (user_id) do nothing;
  return jsonb_build_object('ok', true, 'userId', v_uid::text);
end $$;
revoke all on function public.admin_add_staff(text) from PUBLIC, anon;
grant execute on function public.admin_add_staff(text) to authenticated;

create or replace function public.admin_remove_staff(p_user_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  perform private.require_admin();
  begin v_uid := p_user_id::uuid; exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
  if exists (select 1 from public.staff_members where user_id = v_uid and role = 'admin')
     and (select count(*) from public.staff_members where role = 'admin') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last-admin');
  end if;
  delete from public.staff_members where user_id = v_uid;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_remove_staff(text) from PUBLIC, anon;
grant execute on function public.admin_remove_staff(text) to authenticated;

-- ---------------------------------------------------------------- 9) إحصاءات سريعة
create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform private.require_staff();
  select jsonb_build_object(
    'pending', (select count(*) from public.external_orders where status = 'preparing'),
    'ready', (select count(*) from public.external_orders where status = 'ready'),
    'today', (select count(*) from public.external_orders where created_at >= date_trunc('day', now())),
    'itemsToday', (
      select coalesce(sum(i.quantity), 0) from public.external_order_items i
      join public.external_orders o on o.id = i.order_id
      where o.created_at >= date_trunc('day', now())
    ),
    'topItems', (
      select coalesce(jsonb_agg(jsonb_build_object('name', s.n, 'qty', s.q) order by s.q desc), '[]'::jsonb)
      from (
        select i.item_name as n, sum(i.quantity) as q
        from public.external_order_items i
        join public.external_orders o on o.id = i.order_id
        where o.created_at >= now() - interval '7 days'
        group by i.item_name order by q desc limit 5
      ) s
    )
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.admin_stats() from PUBLIC, anon;
grant execute on function public.admin_stats() to authenticated;

-- ---------------------------------------------------------------- 10) تبديل توفر المنتج (نفد المخزون)
create or replace function public.admin_set_menu_active(p_id text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_staff();
  begin v_id := p_id::uuid; exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
  update public.menu_items set active = coalesce(p_active, true) where id = v_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_set_menu_active(text, boolean) from PUBLIC, anon;
grant execute on function public.admin_set_menu_active(text, boolean) to authenticated;

-- ---------------------------------------------------------------- 11) create_external_order: رقم فريد + تحقق العنوان
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
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer text := btrim(coalesce(p_customer_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_item text := btrim(coalesce(p_item_name, ''));
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
  v_try integer := 0;
begin
  if v_customer = '' then return jsonb_build_object('ok', false, 'reason', 'invalid-customer-name'); end if;
  if v_phone !~ '^(05[0-9]{8}|\+9665[0-9]{8})$' then return jsonb_build_object('ok', false, 'reason', 'invalid-phone'); end if;
  if v_qty < 1 or v_qty > 20 then return jsonb_build_object('ok', false, 'reason', 'invalid-quantity'); end if;
  if v_type not in ('delivery','pickup') then return jsonb_build_object('ok', false, 'reason', 'invalid-delivery-type'); end if;
  if v_type = 'delivery' and btrim(coalesce(p_address, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing-address');
  end if;

  if p_item_id is not null and btrim(p_item_id) <> '' then
    begin v_item_id := p_item_id::uuid; exception when others then v_item_id := null; end;
    if v_item_id is not null then
      select name, allergens, image_url into v_item, v_allergens, v_image
      from public.menu_items where id = v_item_id and active = true;
    end if;
  end if;

  if v_extra is not null and jsonb_typeof(v_extra) = 'array' then
    v_extra_arr := v_extra;
  else
    v_extra_arr := '[]'::jsonb;
  end if;

  if v_item = '' and jsonb_array_length(v_extra_arr) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-item-name');
  end if;

  -- رقم طلب فريد: تحقق من عدم التكرار قبل الإدراج (مع محاولات بديلة)
  loop
    v_number := (floor(random() * 900000) + 100000)::text;
    exit when not exists (select 1 from public.external_orders where number = v_number);
    v_try := v_try + 1;
    if v_try >= 20 then
      return jsonb_build_object('ok', false, 'reason', 'number-generation-failed');
    end if;
  end loop;

  insert into public.external_orders
    (number, customer_name, phone, item_id, item_name, quantity, delivery_type, address, lat, lng, maps_url, notes)
  values (v_number, v_customer, v_phone, v_item_id, v_item,
          v_qty, v_type,
          nullif(btrim(coalesce(p_address, '')), ''),
          p_lat, p_lng,
          nullif(btrim(coalesce(p_maps_url, '')), ''),
          nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_order;

  insert into public.external_order_items (order_id, item_name, quantity, allergens, image_url)
  values (v_order, v_item, v_qty, v_allergens, v_image);

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
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate-number');
end $$;

revoke all on function public.create_external_order(text, text, text, text, integer, jsonb, text, text, double precision, double precision, text, text) from PUBLIC, anon;
grant execute on function public.create_external_order(text, text, text, text, integer, jsonb, text, text, double precision, double precision, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- 12) تشديد الخصوصية
-- لا قراءة مباشرة لجداول الطلبات من المتصفح: كل شيء عبر RPC
revoke select on public.external_orders from anon, authenticated;
revoke select on public.orders from anon, authenticated;
revoke select on public.external_order_items from anon, authenticated;
revoke select on public.push_subscriptions from anon, authenticated;

drop policy if exists ext_customer_read on public.external_orders;
drop policy if exists orders_customer_read on public.orders;
drop policy if exists ext_items_read on public.external_order_items;
drop policy if exists push_customer on public.push_subscriptions;

-- الإشتراكات: يسمح بالإضافة فقط (الحذف للخادم)
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to anon, authenticated with check (true);
grant insert on public.push_subscriptions to anon, authenticated;
