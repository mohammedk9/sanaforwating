-- ======================================================================
-- SANA — لوحة الإدارة (0004) — نسخة مُصحَّحة وكاملة
-- الترتيب مهم: is_staff ثم require_staff ثم كل شيء آخر.
-- الصق كاملاً في Supabase ← SQL Editor ← Run (آمن للتكرار)
-- ======================================================================

-- ---------------------------------------------------------------- staff
create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);
alter table public.staff_members enable row level security;
revoke all privileges on table public.staff_members from PUBLIC, anon, authenticated;
grant select on table public.staff_members to authenticated;
drop policy if exists staff_self on public.staff_members;
create policy staff_self on public.staff_members
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.staff_members where user_id = (select auth.uid())) $$;

revoke all on function private.is_staff() from PUBLIC, anon;
grant execute on function private.is_staff() to authenticated;
grant usage on schema private to authenticated;

create or replace function private.require_staff()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (select private.is_staff()) then raise exception 'not-staff' using errcode = 'P0001'; end if;
end $$;
revoke all on function private.require_staff() from PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  venue_id uuid references public.venues(id) on delete set null,
  status text not null default 'preparing' check (status in ('preparing','ready','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
revoke all privileges on table public.orders from PUBLIC, anon, authenticated;
grant select on table public.orders to anon, authenticated;
grant insert, update, delete on table public.orders to authenticated;

drop policy if exists orders_customer_read on public.orders;
create policy orders_customer_read on public.orders for select to anon, authenticated using (true);
drop policy if exists orders_staff_update on public.orders;
create policy orders_staff_update on public.orders for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
drop policy if exists orders_staff_insert on public.orders;
create policy orders_staff_insert on public.orders for insert to authenticated
  with check ((select private.is_staff()));
drop policy if exists orders_staff_delete on public.orders;
create policy orders_staff_delete on public.orders for delete to authenticated
  using ((select private.is_staff()));

-- --------- العميل: حالة الطلب برقم الفاتورة ---------
create or replace function public.get_order_status(p_number text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text; v_updated timestamptz;
begin
  select status, updated_at into v_status, v_updated
  from public.orders where number = btrim(coalesce(p_number,'')) limit 1;
  if v_status is null then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'updatedAt', v_updated);
end $$;
revoke all on function public.get_order_status(text) from PUBLIC, anon;
grant execute on function public.get_order_status(text) to anon, authenticated;

-- --------- الأدمن: رفع/تغيير حالة الطلب ---------
create or replace function public.admin_upsert_order(p_number text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_number text := btrim(coalesce(p_number,''));
  v_status text := coalesce(nullif(btrim(coalesce(p_status,'')),''),'preparing');
  v_venue uuid;
begin
  perform private.require_staff();
  if v_number = '' or v_number !~ '^\d{2,12}$' then return jsonb_build_object('ok', false, 'reason', 'invalid-number'); end if;
  if v_status not in ('preparing','ready','cancelled') then return jsonb_build_object('ok', false, 'reason', 'invalid-status'); end if;
  select id into v_venue from public.venues where code = 'SANA-01' limit 1;
  insert into public.orders (number, venue_id, status) values (v_number, v_venue, v_status)
  on conflict (number) do update set status = excluded.status, updated_at = now();
  return jsonb_build_object('ok', true, 'number', v_number, 'status', v_status);
end $$;
revoke all on function public.admin_upsert_order(text, text) from PUBLIC, anon;
grant execute on function public.admin_upsert_order(text, text) to authenticated;

-- --------- الأدمن: قائمة الأسئلة ---------
create or replace function public.admin_list_questions()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id::text, 'prompt', q.prompt, 'choices', to_jsonb(q.choices),
      'correctIndex', q.correct_index, 'explanation', coalesce(q.explanation,''),
      'mode', q.mode, 'category', coalesce(q.category,''),
      'difficulty', q.difficulty, 'active', q.active
    ) order by q.created_at
  ), '[]'::jsonb) into v_rows from public.questions q;
  return v_rows;
end $$;
revoke all on function public.admin_list_questions() from PUBLIC, anon;
grant execute on function public.admin_list_questions() to authenticated;


-- --------- الأدمن: إضافة/تعديل سؤال ---------
create or replace function public.admin_upsert_question(
  p_id text default null, p_prompt text default null, p_choices text[] default null,
  p_correct_index integer default null, p_explanation text default null,
  p_mode text default null, p_category text default null,
  p_difficulty text default null, p_active boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_venue uuid; v_id uuid;
  v_prompt text := btrim(coalesce(p_prompt,''));
  v_choices text[] := coalesce(p_choices, array[]::text[]);
  v_correct integer := coalesce(p_correct_index, 0);
  v_mode text := coalesce(nullif(btrim(coalesce(p_mode,'')),''),'any');
  v_difficulty text := coalesce(nullif(btrim(coalesce(p_difficulty,'')),''),'medium');
  v_active boolean := coalesce(p_active, true);
begin
  perform private.require_staff();
  if v_prompt = '' then return jsonb_build_object('ok', false, 'reason', 'invalid-prompt'); end if;
  if coalesce(array_length(v_choices,1),0) < 2 or coalesce(array_length(v_choices,1),0) > 6 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-choices');
  end if;
  if exists (select 1 from unnest(v_choices) c where btrim(c) = '') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-choices');
  end if;
  if v_correct < 0 or v_correct >= array_length(v_choices,1) then
    return jsonb_build_object('ok', false, 'reason', 'invalid-correct-index');
  end if;
  if v_mode not in ('solo','team','any') then return jsonb_build_object('ok', false, 'reason', 'invalid-mode'); end if;
  if v_difficulty not in ('easy','medium','hard') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-difficulty');
  end if;
  select id into v_venue from public.venues where code = 'SANA-01' limit 1;
  if p_id is null or btrim(p_id) = '' then
    insert into public.questions
      (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty, active)
    values (v_venue, v_prompt, v_choices, v_correct,
            nullif(btrim(coalesce(p_explanation,'')),''), v_mode,
            nullif(btrim(coalesce(p_category,'')),''), v_difficulty, v_active)
    returning id into v_id;
  else
    begin v_id := p_id::uuid;
    exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
    update public.questions set
      prompt = v_prompt, choices = v_choices, correct_index = v_correct,
      explanation = nullif(btrim(coalesce(p_explanation,'')),''), mode = v_mode,
      category = nullif(btrim(coalesce(p_category,'')),''), difficulty = v_difficulty, active = v_active
    where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id::text);
end $$;
revoke all on function public.admin_upsert_question(text, text, text[], integer, text, text, text, text, boolean) from PUBLIC, anon;
grant execute on function public.admin_upsert_question(text, text, text[], integer, text, text, text, text, boolean) to authenticated;

-- --------- الأدمن: حذف سؤال ---------
create or replace function public.admin_delete_question(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_staff();
  begin v_id := p_id::uuid;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
  delete from public.questions where id = v_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_delete_question(text) from PUBLIC, anon;
grant execute on function public.admin_delete_question(text) to authenticated;

-- --------- الأدمن: تفعيل/تعطيل سؤال ---------
create or replace function public.admin_set_question_active(p_id text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_staff();
  begin v_id := p_id::uuid;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
  update public.questions set active = coalesce(p_active, true) where id = v_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  return jsonb_build_object('ok', true, 'active', coalesce(p_active, true));
end $$;
revoke all on function public.admin_set_question_active(text, boolean) from PUBLIC, anon;
grant execute on function public.admin_set_question_active(text, boolean) to authenticated;

select (select count(*) from public.orders) as orders_count,
       (select count(*) from public.questions) as questions_count,
       (select count(*) from public.staff_members) as staff_count;
