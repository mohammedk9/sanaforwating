-- ============================================================================
-- SANA — احتساب نقاط الألعاب الخفيفة (0010)
-- الصق كاملاً في: Supabase Dashboard ← SQL Editor ← New query ← Run
-- آمن للتكرار (if not exists / or replace).
--
-- الفكرة:
--   الألعاب الخفيفة (برج الأكواب، ادمج القهوة، وردية الباريستا، اصطد الحبوب،
--   اللغز، الذاكرة) تعمل محلياً في المتصفح ولا تمر عبر submit_answer.
--   هذه الهجرة تضيف جدولاً لتسجيل نقاطها عبر دالة خادم آمنة (record_casual_score)
--   تتحقق من الجلسة وتضع سقفاً لكل لعبة، ثم:
--     • تمنح XP (10 نقاط = 1 XP، نفس قاعدة المباريات).
--     • تُدرج نقاطها في الرانك الأسبوعي (weekly_leaderboard).
-- ============================================================================

-- ------------------------------------------------------- جدول نقاط الألعاب
create table if not exists public.casual_game_scores (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references auth.users(id) on delete cascade,
  game        text not null check (game in
                  ('cupTower','mergeCoffee','baristaRush','beanHunt','riddle','memory')),
  points      integer not null check (points > 0),
  created_at  timestamptz not null default now()
);

create index if not exists casual_game_scores_player_idx
  on public.casual_game_scores (player_id);
create index if not exists casual_game_scores_created_idx
  on public.casual_game_scores (created_at);
create index if not exists casual_game_scores_game_pts_idx
  on public.casual_game_scores (game, points);

alter table public.casual_game_scores enable row level security;

-- لا قراءة/كتابة مباشرة من المتصفح: كل شيء عبر الدالة الآمنة.
revoke all privileges on table public.casual_game_scores from PUBLIC, anon, authenticated;

-- ------------------------------------------------- دالة تسجيل النقاط (آمنة)
-- سقف النقاط لكل لعبة يمنع الغش الفادح (اللعبة محلية لكن السقف يحدّ الاحتمال).
create or replace function public.record_casual_score(p_game text, p_points integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_game   text := btrim(coalesce(p_game, ''));
  v_points integer := coalesce(p_points, 0);
  v_cap    integer;
  v_xp     integer;
  v_name   text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  -- سقف النقاط لكل لعبة (نقطة لعب)
  v_cap := case v_game
    when 'cupTower'    then 200   -- عدد الأكواب (واقعي: < 100)
    when 'mergeCoffee' then 20000 -- نقاط الدمج (2048 = 20480)
    when 'baristaRush' then 100   -- نسبة الجودة (0..100)
    when 'beanHunt'    then 500   -- الحبوب الملتقطة
    when 'riddle'      then 10    -- لغز واحد صحيح
    when 'memory'      then 30    -- إكمال الذاكرة
    else 0
  end;

  if v_cap <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-game');
  end if;

  -- قصّ النقاط إلى [0, v_cap] (الخادم لا يثق بالمتصفح)
  if v_points < 0 then v_points := 0; end if;
  if v_points > v_cap then v_points := v_cap; end if;

  if v_points <= 0 then
    return jsonb_build_object('ok', true, 'points', 0, 'xp', 0);
  end if;

  insert into public.casual_game_scores (player_id, game, points)
  values (v_uid, v_game, v_points);

  -- XP من الخادم فقط: 10 نقاط لعب = 1 XP
  v_xp := greatest(0, round(v_points / 10.0)::int);

  -- إنشاء/تحديث صف الملف الشخصي (لا يُفقد أي XP)
  select display_name into v_name from public.profiles where id = v_uid;

  insert into public.profiles (id, display_name, xp)
  values (v_uid, coalesce(nullif(btrim(coalesce(v_name, '')), ''), 'لاعب'), v_xp)
  on conflict (id) do update
    set xp = public.profiles.xp + excluded.xp;

  return jsonb_build_object('ok', true, 'points', v_points, 'xp', v_xp);
end $$;

revoke all on function public.record_casual_score(text, integer) from PUBLIC, anon;
grant execute on function public.record_casual_score(text, integer) to authenticated;
-- ------------------------------------------- الرانك الأسبوعي (مباريات + ألعاب)
-- يجمع نقاط المباريات (answers) ونقاط الألعاب الخفيفة (casual_game_scores)
-- لنفس اللاعب في الأسبوع الحالي، ثم يرتّب.
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
    coalesce(nullif(btrim(p.display_name), ''), 'لاعب') as display_name,
    totals.week_points
  from totals
  left join public.profiles p on p.id = totals.player_id
  order by totals.week_points desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

revoke all on function public.weekly_leaderboard(integer) from PUBLIC, anon;
grant execute on function public.weekly_leaderboard(integer) to authenticated;

-- ------------------------------------------------------------- تحقق سريع
select
  has_function_privilege('anon', 'public.record_casual_score(text, integer)', 'EXECUTE')
      as anon_can_record_casual,            -- متوقع: false
  has_function_privilege('authenticated', 'public.record_casual_score(text, integer)', 'EXECUTE')
      as member_can_record_casual,          -- متوقع: true
  has_function_privilege('authenticated', 'public.weekly_leaderboard(integer)', 'EXECUTE')
      as member_can_read_leaderboard;       -- متوقع: true