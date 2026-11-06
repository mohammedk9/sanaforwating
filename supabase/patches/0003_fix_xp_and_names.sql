-- ============================================================================
--  SANA — إصلاح: منح XP للاعبين الجدد + ضبط الاسم في الغرفة
--  الصق كاملاً في SQL Editor ← Run (آمن للتكرار)
--
--  المشكلة التي يحلها:
--   1) finalize_match كانت تعدّل صفوف profiles الموجودة فقط.
--      اللاعب الجديد (زائر بلا صف شخصي) كان يلعب ولا يحصل على أي XP.
--      الحل: إنشاء الصف إن لم يوجد ثم إضافة XP (insert ... on conflict do update).
--   2) الاسم: create_room كان يضع 'المضيف' إن لم يوجد صف شخصي.
--      الآن ينشئ الصف باسم اللاعب مباشرة، ويحفظ اسمه الحقيقي.
-- ============================================================================

-- ------------------------------------------------- 1) منح XP لكل لاعب
create or replace function public.finalize_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room uuid;
begin
  select room_id into v_room from public.matches where id = p_match_id;
  if v_room is null then return; end if;

  delete from public.match_results where match_id = p_match_id;

  insert into public.match_results (match_id, player_id, name, solo_points, team_points)
  select p_match_id, rp.player_id, rp.display_name,
         coalesce((
           select sum(a.points) from public.answers a
           where a.match_id = p_match_id and a.player_id = rp.player_id and a.team_id is null
         ), 0),
         coalesce((
           select sum(a.points)
           from public.answers a
           join public.match_team_members tm on tm.match_id = a.match_id and tm.team_id = a.team_id
           where a.match_id = p_match_id and tm.player_id = rp.player_id
         ), 0)
  from public.room_players rp
  where rp.room_id = v_room;

  -- XP من الخادم فقط: 10 نقاط لعب = 1 XP
  -- insert ... on conflict ⇒ تُنشأ صفوف اللاعبين الجدد ولا يُفقد أي XP
  insert into public.profiles (id, display_name, xp)
  select r.player_id,
         coalesce((select rp.display_name from public.room_players rp
                    where rp.room_id = v_room and rp.player_id = r.player_id), 'لاعب'),
         greatest(0, round(r.total / 10.0)::int)
    from public.match_results r
   where r.match_id = p_match_id
  on conflict (id) do update
    set xp = public.profiles.xp + excluded.xp;

  update public.rooms set status = 'finished' where id = v_room;
end $$;

-- ------------------------------------------------- 2) اسم اللاعب في الغرفة
create or replace function public.create_room(p_max_players integer default 8)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_room  uuid;
  v_match uuid;
  v_try   integer := 0;
  v_name  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if p_max_players is null or p_max_players < 1 or p_max_players > 8 then
    return jsonb_build_object('ok', false, 'reason', 'player-count-out-of-range');
  end if;

  -- اسم اللاعب: من صفه الشخصي إن وُجد، وإلا 'أنت' (ويُضبط لاحقاً بـ join_room)
  select display_name into v_name from public.profiles where id = v_uid;
  v_name := coalesce(nullif(btrim(coalesce(v_name, '')), ''), 'أنت');

  loop
    v_try := v_try + 1;
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
  values (v_room, v_uid, v_name);

  insert into public.matches (room_id, phase)
  values (v_room, 'lobby')
  returning id into v_match;

  return jsonb_build_object('ok', true, 'roomId', v_room, 'code', v_code,
                            'matchId', v_match, 'displayName', v_name);
end $$;

-- -------------------------------------------------------------- تحقق سريع
select
  has_function_privilege('authenticated', 'public.create_room(integer)', 'EXECUTE') as can_create_room,
  (select count(*) from public.profiles) as profiles_count,
  (select count(*) from public.match_results) as results_count;