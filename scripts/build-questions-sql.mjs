/**
 * يولّد ملف SQL لأسئلة SANA من المصدر الواحد: src/data/questions.json
 *
 * الاستخدام:  node scripts/build-questions-sql.mjs
 * الناتج:     supabase/seed/questions.sql
 *
 * الفائدة: لا نسختين من نفس المحتوى (الواجهة + قاعدة البيانات) فلا يحدث انحراف.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src', 'data', 'questions.json');
const target = join(root, 'supabase', 'seed', 'questions.sql');

const questions = JSON.parse(readFileSync(source, 'utf8'));

/** يهرّب النص ليكون صالحاً داخل literal في SQL. */
const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** مصفوفة نصوص بصيغة Postgres: array['أ','ب'] */
const sqlArray = (items) => `array[${items.map(sqlText).join(', ')}]`;

const rows = questions
  .map((question, index) => {
    const mode = ['solo', 'team', 'any'].includes(question.mode) ? question.mode : 'any';
    const difficulty = ['easy', 'medium', 'hard'].includes(question.difficulty)
      ? question.difficulty
      : 'medium';
    const category = question.category ? sqlText(question.category) : 'null';

    return `  -- ${index + 1}. ${question.q.replace(/\s+/g, ' ')}
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, ${sqlText(question.q)}, ${sqlArray(question.a)}, ${question.c}, ${sqlText(question.ex)}, ${sqlText(mode)}, ${category}, ${sqlText(difficulty)}
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = ${sqlText(question.q)}
  );`;
  })
  .join('\n\n');

const sql = `-- ============================================================================
--  SANA — أسئلة اللعبة (${questions.length} سؤالاً · كل سؤال بأربعة خيارات)
--  ملف مُولَّد آلياً من src/data/questions.json — لا تعدّله يدوياً.
--  لإعادة التوليد:  node scripts/build-questions-sql.mjs
--
--  التشغيل: الصق كامل هذا الملف في Supabase ← SQL Editor ← Run
--  آمن للتكرار: لا يضيف سؤالاً موجوداً (مقارنة بالنص داخل نفس المحل).
-- ============================================================================

do $$
declare
  v_venue uuid;
begin
  select id into v_venue from public.venues where code = 'SANA-01';

  if v_venue is null then
    insert into public.venues (code, name)
    values ('SANA-01', 'مقهى سنا · فرع التجربة')
    returning id into v_venue;
  end if;

${rows}
end $$;

-- التحقق بعد التشغيل: يجب أن يساوي العدد ${questions.length}
select count(*) as questions_total,
       count(*) filter (where active) as active_questions,
       count(*) filter (where mode = 'solo') as solo_questions,
       count(*) filter (where mode = 'team') as team_questions
from public.questions;
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, sql, 'utf8');

console.log(`generated ${questions.length} questions -> supabase/seed/questions.sql`);
console.log(`solo=${questions.filter((q) => q.mode === 'solo').length} team=${questions.filter((q) => q.mode === 'team').length}`);