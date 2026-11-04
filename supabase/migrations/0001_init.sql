-- ============================================================================
--  SANA — المخطط الأساسي (0001)
--  الصق هذا الملف كاملاً في: Supabase Dashboard ← SQL Editor ← New query ← Run
--  آمن للتكرار (if not exists / or replace) ويمكن تشغيله أكثر من مرة.
--
--  المبادئ:
--   1) الإجابة الصحيحة (correct_index) لا تُقرأ من المتصفح إطلاقاً
--      (صلاحيات على مستوى الأعمدة + RLS).
--   2) المتصفح لا يكتب النقاط أبداً: كل كتابة تمر عبر دوال security definer
--      تحسب الزمن والنقاط من وقت الخادم.
--   3) قيد فريد على (السؤال، اللاعب) يمنع الإجابة المكررة على مستوى القاعدة.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- الحسابات
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  xp           integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- المحلات (QR)
create table if not exists public.venues (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- بنك الأسئلة
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid references public.venues(id) on delete cascade, -- null = عام
  prompt        text not null,
  choices       text[] not null
                check (array_ndims(choices) = 1 and cardinality(choices) between 2 and 6),
  correct_index integer not null,
  explanation   text,
  category      text,
  difficulty    text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  mode          text not null default 'any' check (mode in ('solo', 'team', 'any')),
  active        boolean not null default true,
  valid_from    timestamptz,
  valid_until   timestamptz,
  created_at    timestamptz not null default now(),
  check (correct_index >= 0 and correct_index < cardinality(choices)),
  check (valid_from is null or valid_until is null or valid_until > valid_from)
);

-- ---------------------------------------------------------------- الغرف
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  host_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'expired')),
  max_players integer not null default 8 check (max_players between 1 and 8),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '2 hours'
);

create table if not exists public.room_players (
  room_id      uuid not null references public.rooms(id) on delete cascade,
  player_id    uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (room_id, player_id)
);

-- ---------------------------------------------------------------- المباراة
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,
  phase          text not null default 'lobby'
                 check (phase in ('lobby', 'round_intro', 'question_open', 'question_reveal', 'round_summary', 'match_end')),
  round_index    integer not null default 0,
  question_index integer not null default 0,
  phase_ends_at  timestamptz,
  plan           jsonb,
  created_at     timestamptz not null default now(),
  unique (room_id)
);

create table if not exists public.match_questions (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references public.matches(id) on delete cascade,
  round_index    integer not null,
  question_index integer not null,
  question_id    uuid not null references public.questions(id),
  mode           text not null default 'solo' check (mode in ('solo', 'teams')),
  started_at     timestamptz,
  ends_at        timestamptz,
  unique (match_id, round_index, question_index)
);

create table if not exists public.match_teams (
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id  text not null,
  name     text not null,
  primary key (match_id, team_id)
);

create table if not exists public.match_team_members (
  match_id  uuid not null references public.matches(id) on delete cascade,
  team_id   text not null,
  player_id uuid not null,
  primary key (match_id, player_id),
  foreign key (match_id, team_id) references public.match_teams(match_id, team_id) on delete cascade
);

create table if not exists public.answers (
  id                bigserial primary key,
  match_id          uuid not null references public.matches(id) on delete cascade,
  match_question_id uuid not null references public.match_questions(id) on delete cascade,
  player_id         uuid not null,
  team_id           text,
  choice_index      integer not null,
  correct           boolean not null,
  elapsed_ms        integer not null,
  points            integer not null,
  created_at        timestamptz not null default now(),
  -- منع تكرار الإجابة للاعب نفسه في السؤال نفسه (منع الغش الأساسي)
  unique (match_question_id, player_id)
);

-- كل إجابة فريق واحدة فقط لكل سؤال
create unique index if not exists answers_one_per_team_question
  on public.answers (match_question_id, team_id)
  where team_id is not null;

create table if not exists public.match_results (
  match_id   uuid not null references public.matches(id) on delete cascade,
  player_id  uuid not null,
  name       text not null,
  solo_points integer not null default 0,
  team_points integer not null default 0,
  total      integer generated always as (solo_points + team_points) stored,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
-- ============================================================================
--  الصلاحيات و RLS — المتصفح يقرأ ما يخصّه فقط، ولا يكتب النقاط أبداً
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.venues             enable row level security;
alter table public.questions          enable row level security;
alter table public.rooms              enable row level security;
alter table public.room_players       enable row level security;
alter table public.matches            enable row level security;
alter table public.match_questions    enable row level security;
alter table public.match_teams        enable row level security;
alter table public.match_team_members enable row level security;
alter table public.answers            enable row level security;
alter table public.match_results      enable row level security;

-- ============================================================================
--  دوال مساعدة محمية — تكسر تكرار RLS في الغرف
-- ============================================================================
--  المشكلة: سياسة room_players تستعلم عن room_players نفسها ⇒ حلقة متكررة.
--  الحل: دالة SECURITY DEFINER في مخطط private غير المكشوف عبر API،
--  تقرأ العضوية بصلاحيات مالكها (postgres) متجاوزةً RLS مرة واحدة فقط.
create schema if not exists private;

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = (select auth.uid())
  );
$$;

-- هل المستخدم عضو في غرفة هذه المباراة؟ (تستخدمها جداول المباراة)
create or replace function private.is_match_member(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches as m
    join public.room_players as rp on rp.room_id = m.room_id
    where m.id = p_match_id
      and rp.player_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_member(uuid) from PUBLIC, anon, authenticated;
revoke all on function private.is_match_member(uuid) from PUBLIC, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.is_match_member(uuid) to authenticated;

-- ------------------------------------------------------------------ profiles
-- المستخدم يقرأ ملفه وينشئه ويعدّل اسمه فقط.
-- XP لا يمكن تعديله من المتصفح: الحماية من صلاحيات الأعمدة وليس RLS وحده.

revoke all privileges on table public.profiles from PUBLIC, anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, display_name) on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_read_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ------------------------------------------------------------------ venues
drop policy if exists venues_read on public.venues;
create policy venues_read on public.venues
  for select to anon, authenticated using (active);

-- ----------------------------------------------------------------- questions
-- لا يقرأ المتصفح جدول الأسئلة إطلاقاً (ولا الإجابة الصحيحة بالطبع).
-- القراءة تتم عبر دوال SECURITY DEFINER تعيد نص السؤال والخيارات فقط،
-- وبوابة الإجابة الصحيحة تبقى داخل الخادم.

drop policy if exists questions_read on public.questions;

revoke all privileges on table public.questions from PUBLIC, anon, authenticated;

-- صلاحيات الخادم فقط (service_role المستخدم داخل Supabase وليس في الواجهة)
grant select, insert, update, delete on table public.questions to service_role;

-- -------------------------------------------------------------------- rooms

drop policy if exists rooms_member_read on public.rooms;

create policy rooms_member_read on public.rooms
  for select to authenticated
  using (
    host_id = (select auth.uid())
    or (select private.is_room_member(id))
  );

-- ---------------------------------------------------------------- room_players

drop policy if exists room_players_member_read on public.room_players;

create policy room_players_member_read on public.room_players
  for select to authenticated
  using (
    (select private.is_room_member(room_id))
  );

-- ------------------------------------------------------- جداول المباراة
-- كلها تستخدم private.is_match_member ⇒ استعلام واحد آمن بلا تكرار RLS.

drop policy if exists matches_member_read on public.matches;
create policy matches_member_read on public.matches
  for select to authenticated
  using ((select private.is_room_member(room_id)));

drop policy if exists match_questions_member_read on public.match_questions;
create policy match_questions_member_read on public.match_questions
  for select to authenticated
  using ((select private.is_match_member(match_id)));

drop policy if exists match_teams_member_read on public.match_teams;
create policy match_teams_member_read on public.match_teams
  for select to authenticated
  using ((select private.is_match_member(match_id)));

drop policy if exists match_team_members_member_read on public.match_team_members;
create policy match_team_members_member_read on public.match_team_members
  for select to authenticated
  using ((select private.is_match_member(match_id)));

drop policy if exists answers_member_read on public.answers;
create policy answers_member_read on public.answers
  for select to authenticated
  using ((select private.is_match_member(match_id)));

drop policy if exists match_results_member_read on public.match_results;
create policy match_results_member_read on public.match_results
  for select to authenticated
  using ((select private.is_match_member(match_id)));

-- لا توجد سياسة insert/update/delete على جداول المباراة:
-- أي كتابة مباشرة من المتصفح تُرفض، والكتابة الحقيقية عبر الدوال أدناه فقط.
grant select on public.matches, public.match_questions, public.match_teams,
  public.match_team_members, public.answers, public.match_results
  to authenticated;

-- ============================================================================
--  Realtime — بث مباشر لتغيّر حالة الغرفة والمباراة
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['rooms', 'room_players', 'matches', 'match_questions', 'answers']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
-- ============================================================================
--  الدوال الآمنة (security definer) — المرجع الوحيد للوقت والنقاط
--  نفس صيغة core/scoring.ts: 100 نقطة + حتى 100 للسرعة، والخطأ صفر،
--  ونافذة 15 ثانية + مهلة شبكة 300ms.
-- ============================================================================

create or replace function public.sana_points(p_correct boolean, p_elapsed_ms integer)
returns integer
language sql immutable as $$
  select case
    when not p_correct then 0
    when p_elapsed_ms >= 15000 then 100
    else 100 + round(100 * (1 - (p_elapsed_ms::numeric / 15000)))::int
  end
$$;

-- ------------------------------------------------------------- إرسال إجابة
create or replace function public.submit_answer(p_match_question uuid, p_choice integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_mq        record;
  v_correct_i integer;
  v_elapsed   integer;
  v_correct   boolean;
  v_points    integer;
  v_team      text;
  v_members   integer;
  v_expected  uuid;
  v_answered  integer;
  v_total     integer;
begin
  if v_uid is null then
    return jsonb_build_object('accepted', false, 'reason', 'unauthenticated');
  end if;

  -- قفل صف المباراة: يمنع تعارض الإجابات المتزامنة مع تقديم المراحل
  select mq.*, m.room_id, m.phase
    into v_mq
  from public.match_questions mq
  join public.matches m on m.id = mq.match_id
  where mq.id = p_match_question
  for update of m;

  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'not-open');
  end if;
  if v_mq.phase <> 'question_open' or v_mq.started_at is null then
    return jsonb_build_object('accepted', false, 'reason', 'not-open');
  end if;
  if not exists (select 1 from public.room_players rp
                 where rp.room_id = v_mq.room_id and rp.player_id = v_uid) then
    return jsonb_build_object('accepted', false, 'reason', 'not-in-room');
  end if;

  select q.correct_index into v_correct_i
  from public.questions q where q.id = v_mq.question_id;

  v_elapsed := greatest(0, (extract(epoch from (now() - v_mq.started_at)) * 1000)::int);
  if v_elapsed > 15300 then
    return jsonb_build_object('accepted', false, 'reason', 'too-late', 'elapsedMs', v_elapsed);
  end if;

  if v_mq.mode = 'teams' then
    select tm.team_id into v_team
    from public.match_team_members tm
    where tm.match_id = v_mq.match_id and tm.player_id = v_uid;
    if v_team is null then
      return jsonb_build_object('accepted', false, 'reason', 'no-team');
    end if;

    -- تناوب الإرسال داخل الفريق: الدور لصاحب الرقم (question_index % عدد الأعضاء)
    select count(*) into v_members
    from public.match_team_members tm
    where tm.match_id = v_mq.match_id and tm.team_id = v_team;

    if v_members > 0 then
      select s.player_id into v_expected
      from (
        select tm.player_id, row_number() over (order by tm.player_id) - 1 as idx
        from public.match_team_members tm
        where tm.match_id = v_mq.match_id and tm.team_id = v_team
      ) s
      where s.idx = (v_mq.question_index % v_members);

      if v_expected is distinct from v_uid then
        return jsonb_build_object('accepted', false, 'reason', 'not-submitter');
      end if;
    end if;
  end if;

  v_correct := (p_choice = v_correct_i);
  v_points  := public.sana_points(v_correct, v_elapsed);

  begin
    insert into public.answers
      (match_question_id, match_id, player_id, team_id, choice_index, correct, elapsed_ms, points)
    values
      (p_match_question, v_mq.match_id, v_uid, v_team, p_choice, v_correct, v_elapsed, v_points);
  exception when unique_violation then
    return jsonb_build_object('accepted', false, 'reason', 'duplicate');
  end;

  -- إن أجاب الجميع (أو كل الفرق) ننتقل إلى الكشف مباشرة
  if v_mq.mode = 'teams' then
    select count(*) into v_total from public.match_teams where match_id = v_mq.match_id;
  else
    select count(*) into v_total from public.room_players where room_id = v_mq.room_id;
  end if;
  select count(*) into v_answered from public.answers where match_question_id = p_match_question;

  if v_answered >= v_total then
    update public.matches
       set phase = 'question_reveal', phase_ends_at = now() + interval '5 seconds'
     where id = v_mq.match_id;
  end if;

  return jsonb_build_object(
    'accepted', true, 'correct', v_correct, 'points', v_points, 'elapsedMs', v_elapsed
  );
end $$;

-- ------------------------------------------------------- تقديم المرحلة ذرّياً
-- قفل الصف + شرط الحالة الحالية ⇒ يستحيل تقديم المباراة مرتين
create or replace function public.advance_match(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_m         record;
  v_count     integer;
  v_rounds    integer;
  v_next_mode text;
begin
  select * into v_m from public.matches where id = p_match_id for update;

  if not found then
    return jsonb_build_object('advanced', false, 'reason', 'not-found');
  end if;
  if v_m.phase = 'match_end' then
    return jsonb_build_object('advanced', false, 'reason', 'finished');
  end if;
  if v_m.phase_ends_at is not null and now() < v_m.phase_ends_at then
    return jsonb_build_object('advanced', false, 'reason', 'not-due');
  end if;

  if v_m.phase = 'lobby' then
    update public.matches
       set phase = 'round_intro', round_index = 1, question_index = 0,
           phase_ends_at = now() + interval '3 seconds'
     where id = p_match_id;
    return jsonb_build_object('advanced', true, 'phase', 'round_intro');

  elsif v_m.phase = 'round_intro' then
    update public.match_questions
       set started_at = now(), ends_at = now() + interval '15.3 seconds'
     where match_id = p_match_id and round_index = v_m.round_index
       and question_index = v_m.question_index;
    update public.matches
       set phase = 'question_open', phase_ends_at = now() + interval '15.3 seconds'
     where id = p_match_id;
    return jsonb_build_object('advanced', true, 'phase', 'question_open');

  elsif v_m.phase = 'question_open' then
    update public.matches
       set phase = 'question_reveal', phase_ends_at = now() + interval '5 seconds'
     where id = p_match_id;
    return jsonb_build_object('advanced', true, 'phase', 'question_reveal');

  elsif v_m.phase = 'question_reveal' then
    select count(*) into v_count
    from public.match_questions
    where match_id = p_match_id and round_index = v_m.round_index;

    if v_m.question_index + 1 < v_count then
      update public.match_questions
         set started_at = now(), ends_at = now() + interval '15.3 seconds'
       where match_id = p_match_id and round_index = v_m.round_index
         and question_index = v_m.question_index + 1;
      update public.matches
         set question_index = v_m.question_index + 1, phase = 'question_open',
             phase_ends_at = now() + interval '15.3 seconds'
       where id = p_match_id;
      return jsonb_build_object('advanced', true, 'phase', 'question_open');
    end if;

    update public.matches
       set phase = 'round_summary', phase_ends_at = now() + interval '6 seconds'
     where id = p_match_id;
    return jsonb_build_object('advanced', true, 'phase', 'round_summary');

  elsif v_m.phase = 'round_summary' then
    select max(round_index) into v_rounds
    from public.match_questions where match_id = p_match_id;

    if v_m.round_index < coalesce(v_rounds, 1) then
      select mode into v_next_mode
      from public.match_questions
      where match_id = p_match_id and round_index = v_m.round_index + 1
      order by question_index limit 1;

      if v_next_mode = 'teams' then
        perform public.assign_teams(p_match_id);
      end if;

      update public.matches
         set round_index = v_m.round_index + 1, question_index = 0,
             phase = 'round_intro', phase_ends_at = now() + interval '3 seconds'
       where id = p_match_id;
      return jsonb_build_object('advanced', true, 'phase', 'round_intro');
    end if;

    update public.matches
       set phase = 'match_end', phase_ends_at = now()
     where id = p_match_id;
    perform public.finalize_match(p_match_id);
    return jsonb_build_object('advanced', true, 'phase', 'match_end');
  end if;

  return jsonb_build_object('advanced', false, 'reason', 'unknown-phase');
end $$;

-- ------------------------------------------- تشكيل الفرق (الأقوى مع الأضعف)
create or replace function public.assign_teams(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room uuid;
begin
  select room_id into v_room from public.matches where id = p_match_id;
  if v_room is null then return; end if;

  delete from public.match_team_members where match_id = p_match_id;
  delete from public.match_teams where match_id = p_match_id;

  insert into public.match_teams (match_id, team_id, name)
  select distinct p_match_id, 'team-' || t.team_no, 'الفريق ' || t.team_no
  from (
    select least(r.rn, r.total + 1 - r.rn) as team_no
    from (
      select rp.player_id,
             row_number() over (order by coalesce(sum(a.points), 0) desc, rp.display_name) as rn,
             count(*) over () as total
      from public.room_players rp
      left join public.answers a on a.player_id = rp.player_id and a.match_id = p_match_id
      where rp.room_id = v_room
      group by rp.player_id, rp.display_name
    ) r
  ) t;

  insert into public.match_team_members (match_id, team_id, player_id)
  select p_match_id, 'team-' || least(rn, total + 1 - rn), player_id
  from (
    select rp.player_id,
           row_number() over (order by coalesce(sum(a.points), 0) desc, rp.display_name) as rn,
           count(*) over () as total
    from public.room_players rp
    left join public.answers a on a.player_id = rp.player_id and a.match_id = p_match_id
    where rp.room_id = v_room
    group by rp.player_id, rp.display_name
  ) ranked;
end $$;

-- ------------------------------------------------- حفظ النتيجة النهائية
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

  update public.rooms set status = 'finished' where id = v_room;

  -- منح XP من الخادم فقط: 10 نقاط لعب = 1 XP (لا يمكن للمتصفح تعديل XP)
  update public.profiles p
     set xp = p.xp + greatest(0, round(r.total / 10.0)::int)
    from public.match_results r
   where r.match_id = p_match_id
     and r.player_id = p.id;
end $$;

-- ------------------------------------------------------------- إنشاء غرفة
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
    v_code := upper(substr(replace(encode(gen_random_bytes(6), 'base64'), '/', 'A'), 1, 5));
    v_code := translate(v_code, '+0O1IoIl', 'BCDEFGHJK');
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

-- --------------------------------------------------------- الانضمام إلى غرفة
create or replace function public.join_room(p_code text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_room  record;
  v_count integer;
  v_match uuid;
  v_clean text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if length(v_clean) = 0 then
    v_clean := 'لاعب';
  end if;

  select * into v_room from public.rooms
  where code = upper(btrim(p_code)) for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_room.status <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'already-started');
  end if;
  if v_room.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select count(*) into v_count from public.room_players where room_id = v_room.id;

  if not exists (select 1 from public.room_players
                 where room_id = v_room.id and player_id = v_uid) then
    if v_count >= v_room.max_players then
      return jsonb_build_object('ok', false, 'reason', 'room-full');
    end if;
  end if;

  insert into public.room_players (room_id, player_id, display_name)
  values (v_room.id, v_uid, left(v_clean, 14))
  on conflict (room_id, player_id) do update set display_name = excluded.display_name;

  select id into v_match from public.matches where room_id = v_room.id;

  return jsonb_build_object('ok', true, 'roomId', v_room.id, 'matchId', v_match, 'code', v_room.code);
end $$;

-- ------------------------------------------------------------- بدء المباراة
create or replace function public.start_match(p_room_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_room      record;
  v_players   integer;
  v_match     uuid;
  v_solo      uuid[];
  v_teams_q   uuid[];
begin
  select * into v_room from public.rooms where id = p_room_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  if v_room.host_id <> v_uid then
    return jsonb_build_object('ok', false, 'reason', 'not-host');
  end if;
  if v_room.status <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'already-started');
  end if;

  select count(*) into v_players from public.room_players where room_id = p_room_id;
  if v_players < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no-players');
  end if;
  if v_players > 8 then
    return jsonb_build_object('ok', false, 'reason', 'too-many-players');
  end if;

  select id into v_match from public.matches where room_id = p_room_id;
  if v_match is null then
    insert into public.matches (room_id, phase) values (p_room_id, 'lobby')
    returning id into v_match;
  end if;

  delete from public.match_questions where match_id = v_match;

  -- خمسة أسئلة فردية: ثلاثة للجولة الأولى واثنان للمواجهة الأخيرة
  select array_agg(id) into v_solo from (
    select id from public.questions
    where active
      and (valid_from is null or valid_from <= now())
      and (valid_until is null or valid_until > now())
      and mode in ('solo', 'any')
    order by random() limit 5
  ) s;

  select array_agg(id) into v_teams_q from (
    select id from public.questions
    where active
      and (valid_from is null or valid_from <= now())
      and (valid_until is null or valid_until > now())
      and mode in ('team', 'any')
    order by random() limit 3
  ) t;

  if v_solo is null or array_length(v_solo, 1) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no-questions');
  end if;

  insert into public.match_questions (match_id, round_index, question_index, question_id, mode)
  select v_match, 1, ord - 1, qid, 'solo'
  from unnest(v_solo[1:least(array_length(v_solo, 1), 3)]) with ordinality as u(qid, ord);

  if v_players >= 2 and v_teams_q is not null then
    insert into public.match_questions (match_id, round_index, question_index, question_id, mode)
    select v_match, 2, ord - 1, qid, 'teams'
    from unnest(v_teams_q) with ordinality as u(qid, ord);
  end if;

  if array_length(v_solo, 1) > 3 then
    insert into public.match_questions (match_id, round_index, question_index, question_id, mode)
    select v_match,
           case when v_players >= 2 then 3 else 2 end,
           ord - 1, qid, 'solo'
    from unnest(v_solo[4:array_length(v_solo, 1)]) with ordinality as u(qid, ord);
  end if;

  update public.matches
     set phase = 'round_intro', round_index = 1, question_index = 0,
         phase_ends_at = now() + interval '3 seconds'
   where id = v_match;

  update public.rooms set status = 'playing' where id = p_room_id;

  return jsonb_build_object('ok', true, 'matchId', v_match);
end $$;

-- ============================================================================
--  قراءة السؤال الحالي من المتصفح — بلا الإجابة الصحيحة إطلاقاً
--  (لأن جدول الأسئلة نفسه غير مقروء للعميل بعد إغلاق صلاحياته)
-- ============================================================================
create or replace function public.current_question(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_m    record;
  v_mq   record;
  v_q    record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select * into v_m from public.matches where id = p_match_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  if not private.is_room_member(v_m.room_id) then
    return jsonb_build_object('ok', false, 'reason', 'not-in-room');
  end if;

  select * into v_mq from public.match_questions
  where match_id = p_match_id
    and round_index = v_m.round_index
    and question_index = v_m.question_index;

  if not found then
    return jsonb_build_object(
      'ok', true, 'phase', v_m.phase,
      'roundIndex', v_m.round_index, 'questionIndex', v_m.question_index
    );
  end if;

  select q.prompt, q.choices, q.explanation, q.correct_index
    into v_q from public.questions q where q.id = v_mq.question_id;

  return jsonb_build_object(
    'ok', true,
    'phase', v_m.phase,
    'matchQuestionId', v_mq.id,
    'roundIndex', v_m.round_index,
    'questionIndex', v_m.question_index,
    'questionCount', (select count(*) from public.match_questions
                      where match_id = p_match_id and round_index = v_m.round_index),
    'mode', v_mq.mode,
    'prompt', v_q.prompt,
    'choices', v_q.choices,
    'startedAt', v_mq.started_at,
    'endsAt', v_mq.ends_at,
    -- الإجابة الصحيحة تُكشف فقط في مرحلة الكشف
    'correctIndex', case when v_m.phase in ('question_reveal', 'round_summary', 'match_end')
                         then v_q.correct_index else null end,
    'explanation', case when v_m.phase in ('question_reveal', 'round_summary', 'match_end')
                        then v_q.explanation else null end
  );
end $$;

-- ============================================================================
--  الترتيب الأسبوعي — مجموع نقاط الأسبوع الحالي (عرض عام مقروء)
--  العرض مملوك لـ postgres لذا يتجاوز RLS الخاص بـ profiles،
--  ولا يكشف إلا الاسم والنقاط (لا XP ولا بيانات أخرى).
-- ============================================================================
create or replace view public.weekly_leaderboard as
select
  a.player_id,
  coalesce(nullif(p.display_name, ''), 'لاعب') as display_name,
  sum(a.points)::int as week_points,
  rank() over (order by sum(a.points) desc) as rank
from public.answers a
join public.profiles p on p.id = a.player_id
where a.created_at >= date_trunc('week', now())
group by a.player_id, p.display_name;

revoke all on public.weekly_leaderboard from PUBLIC, anon;
grant select on public.weekly_leaderboard to authenticated;
insert into public.venues (code, name)
values ('SANA-01', 'مقهى سنا · فرع التجربة')
on conflict (code) do nothing;

do $$
declare
  v_venue uuid;
begin
  select id into v_venue from public.venues where code = 'SANA-01';

  if not exists (select 1 from public.questions where venue_id = v_venue) then
    insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode) values
    (v_venue, 'كم عدد كواكب المجموعة الشمسية؟',
     array['7 كواكب','8 كواكب','9 كواكب','10 كواكب'], 1,
     'عدد الكواكب المعترف بها ثمانية.', 'solo'),
    (v_venue, 'ما أكبر محيط على الأرض؟',
     array['الأطلسي','الهندي','الهادئ','المتجمد الشمالي'], 2,
     'المحيط الهادئ هو الأكبر مساحة.', 'solo'),
    (v_venue, 'ما الغاز الذي تمتصه النباتات من الهواء؟',
     array['الأكسجين','ثاني أكسيد الكربون','النيتروجين','الهيدروجين'], 1,
     'تستخدم النباتات ثاني أكسيد الكربون في البناء الضوئي.', 'solo'),
    (v_venue, 'ما الوحدة المستخدمة لقياس شدة التيار الكهربائي؟',
     array['الفولت','الأمبير','الواط','الأوم'], 1,
     'شدة التيار تُقاس بالأمبير.', 'solo'),
    (v_venue, 'في أي قارة تقع مصر؟',
     array['آسيا','أوروبا','أفريقيا','أمريكا الجنوبية'], 2,
     'تقع مصر في قارة أفريقيا.', 'solo'),
    (v_venue, 'ما أكبر عضو في جسم الإنسان؟',
     array['الجلد','الكبد','الدماغ','الرئتان'], 0,
     'الجلد هو أكبر الأعضاء مساحةً ووزناً.', 'team'),
    (v_venue, 'كم عدد حروف اللغة العربية؟',
     array['26 حرفاً','27 حرفاً','28 حرفاً','29 حرفاً'], 2,
     'عدد حروفها ثمانية وعشرون.', 'team'),
    (v_venue, 'ما اللون الناتج عن خلط الأزرق مع الأصفر؟',
     array['البرتقالي','الأخضر','البنفسجي','البني'], 1,
     'خلط الأزرق مع الأصفر يعطي الأخضر.', 'team'),
    (v_venue, 'كم عدد أيام السنة الكبيسة؟',
     array['364 يوماً','365 يوماً','366 يوماً','367 يوماً'], 2,
     'السنة الكبيسة 366 يوماً.', 'team');
  end if;
end $$;