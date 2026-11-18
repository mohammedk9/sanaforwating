-- ============================================================================
-- SANA — نظام الجوائز الأسبوعية (0011)
-- يتطلب: 0009 (require_staff / require_admin) + 0010 (casual scores)
-- الصق كاملاً في Supabase ← SQL Editor ← Run (آمن للتكرار)
--
-- الفكرة:
--   لكل أسبوع (ISO week) يحدد المدير جائزة لأول 3 مراكز في الرانك الأسبوعي.
--   - جدول weekly_prizes: صف لكل (أسبوع، مركز 1..3) مع نص الجائزة.
--   - القراءة عامة لكل مستخدم authenticated (يرى جوائز الأسبوع الحالي).
--   - الكتابة للمدير فقط (admin) عبر دوال RPC.
--   - الرانك الأسبوعي نفسه يُصفّر تلقائياً كل أسبوع (date_trunc('week')).
-- ============================================================================

create table if not exists public.weekly_prizes (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,                       -- بداية الأسبوع (date_trunc week)
  place       smallint not null check (place between 1 and 3),
  title       text not null default '',            -- نص الجائزة (مثال: خصم 50%، فنجان مجاني)
  note        text,
  created_at  timestamptz not null default now(),
  unique (week_start, place)
);

create index if not exists weekly_prizes_week_idx on public.weekly_prizes (week_start);

alter table public.weekly_prizes enable row level security;
revoke all privileges on table public.weekly_prizes from PUBLIC, anon, authenticated;
-- الوصول عبر الدوال فقط (read_public_prizes / admin_*)

-- ---------------------------------------------------- قراءة عامة للجوائز
-- الجوائز الحالية (الأسبوع الحالي) — متاحة لأي مستخدم مسجّل.
create or replace function public.read_public_prizes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.place), '[]'::jsonb)
  from (
    select
      wp.place,
      coalesce(nullif(btrim(wp.title), ''), '—') as title,
      coalesce(wp.note, '') as note
    from public.weekly_prizes wp
    where wp.week_start = date_trunc('week', now())::date
  ) t
$$;
revoke all on function public.read_public_prizes() from PUBLIC, anon;
grant execute on function public.read_public_prizes() to authenticated;

-- ---------------------------------------------------- إدارة الجوائز (للمدير)
-- عرض جوائز أسبوع معيّن (افتراضياً الحالي) — للموظف/المدير.
create or replace function public.admin_list_prizes(p_week date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := coalesce(p_week, date_trunc('week', now())::date);
  v_rows jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.place), '[]'::jsonb) into v_rows
  from (
    select place, coalesce(nullif(btrim(title), ''), '') as title, coalesce(note, '') as note
    from public.weekly_prizes
    where week_start = v_week
  ) t;
  return jsonb_build_object('ok', true, 'week', v_week, 'prizes', v_rows);
end $$;
revoke all on function public.admin_list_prizes(date) from PUBLIC, anon;
grant execute on function public.admin_list_prizes(date) to authenticated;

-- تعيين/تحديث جائزة مركز (1..3) لأسبوع. (إضافة المدير فقط).
create or replace function public.admin_set_prize(
  p_week date,
  p_place smallint,
  p_title text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := coalesce(p_week, date_trunc('week', now())::date);
  v_place smallint := coalesce(p_place, 1);
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
begin
  perform private.require_admin();
  if v_place < 1 or v_place > 3 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-place');
  end if;
  if char_length(v_title) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'title-too-long');
  end if;

  insert into public.weekly_prizes (week_start, place, title, note)
  values (v_week, v_place, v_title, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (week_start, place) do update
    set title = excluded.title, note = excluded.note, created_at = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'week', v_week, 'place', v_place);
end $$;
revoke all on function public.admin_set_prize(date, smallint, text, text) from PUBLIC, anon;
grant execute on function public.admin_set_prize(date, smallint, text, text) to authenticated;

-- حذف جائزة مركز (لإلغائها).
create or replace function public.admin_delete_prize(p_week date, p_place smallint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := coalesce(p_week, date_trunc('week', now())::date);
  v_place smallint := coalesce(p_place, 1);
begin
  perform private.require_admin();
  delete from public.weekly_prizes where week_start = v_week and place = v_place;
  return jsonb_build_object('ok', true, 'week', v_week, 'place', v_place);
end $$;
revoke all on function public.admin_delete_prize(date, smallint) from PUBLIC, anon;
grant execute on function public.admin_delete_prize(date, smallint) to authenticated;

-- ------------------------------------------------------------- تحقق سريع
select
  has_function_privilege('anon', 'public.read_public_prizes()', 'EXECUTE')
      as anon_can_read_prizes,                 -- متوقع: false
  has_function_privilege('authenticated', 'public.read_public_prizes()', 'EXECUTE')
      as member_can_read_prizes,               -- متوقع: true
  has_function_privilege('authenticated', 'public.admin_set_prize(date, smallint, text, text)', 'EXECUTE')
      as staff_can_set_prize;                  -- متوقع: true (والفحص الفعلي للمدير داخل الدالة)