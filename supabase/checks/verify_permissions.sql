-- ============================================================================
--  SANA — فحص الصلاحيات بعد تنفيذ 0001_init.sql
--  الصق هذا في SQL Editor وشغّله؛ كل القيم يجب أن تطابق عمود "المتوقع".
-- ============================================================================

select
  -- بنك الأسئلة: مغلق تماماً أمام المتصفح
  has_table_privilege('anon', 'public.questions', 'SELECT')
                                  as anon_can_read_questions,          -- متوقع: false
  has_table_privilege('authenticated', 'public.questions', 'SELECT')
                                  as authenticated_can_read_questions, -- متوقع: false
  has_table_privilege('service_role', 'public.questions', 'SELECT')
                                  as server_can_read_questions,        -- متوقع: true

  -- الإجابة الصحيحة محجوبة حتى على مستوى العمود لكل الأدوار العامة
  has_column_privilege('authenticated', 'public.questions', 'correct_index', 'SELECT')
                                  as player_can_read_correct_index,    -- متوقع: false

  -- XP: لا تعديل من المتصفح، والاسم مسموح
  has_column_privilege('authenticated', 'public.profiles', 'xp', 'UPDATE')
                                  as player_can_update_xp,             -- متوقع: false
  has_column_privilege('authenticated', 'public.profiles', 'xp', 'INSERT')
                                  as player_can_insert_xp,             -- متوقع: false
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
                                  as player_can_update_name,           -- متوقع: true
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'INSERT')
                                  as player_can_insert_name,           -- متوقع: true

  -- النقاط: لا كتابة مباشرة من المتصفح إطلاقاً
  has_table_privilege('authenticated', 'public.answers', 'INSERT')
                                  as player_can_write_answers,         -- متوقع: false
  has_table_privilege('authenticated', 'public.matches', 'UPDATE')
                                  as player_can_advance_match,         -- متوقع: false

  -- الدالة المساعدة لا تُنفَّذ من anon
  has_function_privilege('anon', 'private.is_room_member(uuid)', 'EXECUTE')
                                  as anon_can_call_room_member,        -- متوقع: false
  has_function_privilege('authenticated', 'private.is_room_member(uuid)', 'EXECUTE')
                                  as member_can_call_room_member,      -- متوقع: true

  -- الترتيب الأسبوعي: لا anon
  has_function_privilege('anon', 'public.weekly_leaderboard(integer)', 'EXECUTE')
                                  as anon_can_read_leaderboard,        -- متوقع: false
  has_function_privilege('authenticated', 'public.weekly_leaderboard(integer)', 'EXECUTE')
                                  as member_can_read_leaderboard;      -- متوقع: true

-- ---------------------------------------------------------------------------
-- فحص ثانٍ: عدد الأسئلة المهيّأة والمحلات
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.venues)     as venues_count,       -- متوقع: 1
  (select count(*) from public.questions)  as questions_count,    -- متوقع: 9
  (select count(*) from public.questions where active) as active_questions,
  (select count(*) from public.questions
    where valid_from is null or valid_from <= now()) as currently_valid;

-- ---------------------------------------------------------------------------
-- فحص ثالث: الجداول التي تحقّق سياساتها دون حلقة تكرار
-- ---------------------------------------------------------------------------
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname in ('public', 'private')
order by tablename, policyname;