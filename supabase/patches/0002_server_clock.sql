-- ============================================================================
--  SANA — مزامنة ساعة اللاعب مع الخادم
--  الصق هذا الملف في SQL Editor ← Run (آمن للتكرار)
--
--  لماذا؟ العدّاد وطلب تقديم المرحلة يعتمدان على وقت الخادم. إن كانت ساعة
--  الهاتف متأخرة/متقدمة، تتأخر شاشة اللاعب أو تسبق. هذه الدالة تعيد وقت
--  الخادم فقط، فيحسب المتصفح فرق التوقيت ويعتمده في العدّاد.
-- ============================================================================

create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$ select now() $$;

revoke all on function public.server_now() from PUBLIC, anon;
grant execute on function public.server_now() to authenticated;

-- تحقق
select public.server_now() as server_time;