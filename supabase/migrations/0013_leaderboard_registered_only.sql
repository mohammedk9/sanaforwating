-- ============================================================================
-- SANA — إصلاح الترتيب: المسجّلون فقط (0013)
-- يتطلب: 0010 (weekly_leaderboard الحالية)
-- الصق كاملاً في Supabase ← SQL Editor ← Run (آمن للتكرار)
--
-- المشكلة:
--   الترتيب الحالي يجمع نقاط كل اللاعبين (answers + casual_game_scores)
--   بما فيهم الجلسات المجهولة (anonymous) ومن ليس لديهم اسم معروض.
--
-- الحل:
--   نُظهر فقط المستخدمين الذين:
--     • ليسوا جلسات مجهولة (auth.users.is_anonymous = false)
--     • لديهم ملف شخصي باسم غير فارغ (profiles.display_name)
-- ============================================================================

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
  with match_pts as (
    select a.player_id, sum(a.points)::int as pts
    from public.answers a
    where a.created_at >= date_trunc('week', now())
    group by a.player_id
  ),
  casual_pts as (
    select c.player_id, sum(c.points)::int as pts
    from public.casual_game_scores c
    where c.created_at >= date_trunc('week', now())
    group by c.player_id
  ),
  totals as (
    select coalesce(m.player_id, c.player_id) as player_id,
           coalesce(m.pts, 0) + coalesce(c.pts, 0) as week_points
    from match_pts m
    full outer join casual_pts c on c.player_id = m.player_id
  )
  select
    rank() over (order by totals.week_points desc) as place,
    totals.player_id,
    p.display_name as display_name,
    totals.week_points
  from totals
  -- ملف شخصي برمز (id) موجود
  join public.profiles p on p.id = totals.player_id
  -- مستخدم حقيقي (غير مجهول) في نظام المصادقة
  join auth.users u on u.id = totals.player_id
  where coalesce(u.is_anonymous, false) = false
    and btrim(coalesce(p.display_name, '')) <> ''
  order by totals.week_points desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

revoke all on function public.weekly_leaderboard(integer) from PUBLIC, anon;
grant execute on function public.weekly_leaderboard(integer) to authenticated;

-- ------------------------------------------------------------- تحقق سريع
-- أعد تشغيل هذا الاستعلام: يجب ألا يظهر أي صف بـ display_name = 'لاعب' أو فارغ
select place, player_id, display_name, week_points
from public.weekly_leaderboard(100);