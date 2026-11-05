-- ============================================================================
--  SANA — رقعة إصلاح سريعة (شغّلها بدل إعادة الترحيل الكامل)
--  الصق هذا الملف كاملاً في Supabase ← SQL Editor ← Run
--
--  يصلح أمرين:
--   1) create_room: كانت تفشل بـ "function gen_random_bytes(integer) does not exist"
--      لأن pgcrypto في Supabase داخل مخطط extensions بينما الدالة تعمل بـ search_path=public.
--   2) weekly_leaderboard: تحويلها من View (كان Supabase يحذّر أنه UNRESTRICTED)
--      إلى دالة صلاحياتها مضبوطة ولا تُنفَّذ من anon.
-- ============================================================================

-- ---------------------------------------------------------------- 1) الغرف
create or replace function public.create_room(p_max_players integer default 8)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_room  uuid;
  v_match uuid;
  v_try   integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if p_max_players is null or p_max_players < 1 or p_max_players > 8 then
    return jsonb_build_object('ok', false, 'reason', 'player-count-out-of-range');
  end if;

  loop
    v_try := v_try + 1;
    -- رمز من معرّف UUID المدمج (لا نحتاج pgcrypto)
    v_code := upper(substr(translate(gen_random_uuid()::text, '-', ''), 1, 5));
    exit when not exists (select 1 from public.rooms where code = v_code);
    if v_try > 25 then
      return jsonb_build_object('ok', false, 'reason', 'code-generation-failed');
    end if;
  end loop;

  insert into public.rooms (code, host_id, max_players)
  values (v_code, v_uid, p_max_players)
  returning id into v_room;

  insert into public.room_players (room_id, player_id, display_name)
  values (v_room, v_uid,
    coalesce((select display_name from public.profiles where id = v_uid), 'المضيف'));

  insert into public.matches (room_id, phase)
  values (v_room, 'lobby')
  returning id into v_match;

  return jsonb_build_object('ok', true, 'roomId', v_room, 'code', v_code, 'matchId', v_match);
end $$;

-- ------------------------------------------------------ 2) الترتيب الأسبوعي
drop view if exists public.weekly_leaderboard;

create or replace function public.weekly_leaderboard(p_limit integer default 20)
returns table (
  place        bigint,
  player_id    uuid,
  display_name text,
  week_points  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rank() over (order by sum(a.points) desc) as place,
    a.player_id,
    coalesce(nullif(p.display_name, ''), 'لاعب') as display_name,
    sum(a.points)::int as week_points
  from public.answers a
  join public.profiles p on p.id = a.player_id
  where a.created_at >= date_trunc('week', now())
  group by a.player_id, p.display_name
  order by week_points desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

revoke all on function public.weekly_leaderboard(integer) from PUBLIC, anon;
grant execute on function public.weekly_leaderboard(integer) to authenticated;

-- ---------------------------------------------------------------- تحقق سريع
select
  has_function_privilege('anon', 'public.weekly_leaderboard(integer)', 'EXECUTE') as anon_can_read_leaderboard,
  has_function_privilege('authenticated', 'public.weekly_leaderboard(integer)', 'EXECUTE') as member_can_read_leaderboard,
  has_table_privilege('anon', 'public.questions', 'SELECT') as anon_can_read_questions;