/**
 * تسجيل نقاط الألعاب الخفيفة (غير المباريات التنافسية).
 *
 * لماذا؟ هذه الألعاب تعمل بالكامل داخل المتصفح، ولا تمر عبر submit_answer.
 * حتى تُحتسب في الرانك وXP نرسل نقاطها إلى دالة خادم آمنة (record_casual_score)
 * تتحقق من الجلسة، وتضع سقفاً للنقاط لكل لعبة (لا يثق الخادم بالمتصفح،
 * لكنه يحدّ الاحتمال القصوى للغش لأن اللعبة محلية المنطق).
 *
 * القاعدة: 10 نقاط لعب = 1 XP (نفس قاعدة المباريات في finalize_match).
 */
import { hasSupabase } from '../env.ts';
import { ensureSession, supabase } from './supabase.ts';

/** أنواع الألعاب الخفيفة المدعومة في الدالة على الخادم. */
export type CasualGame =
  | 'cupTower'
  | 'mergeCoffee'
  | 'baristaRush'
  | 'beanHunt'
  | 'riddle'
  | 'memory';

/**
 * يسجّل نقاط لعبة خفيفة بأمان (بلا استثناءات تُوقف اللعب).
 * يفشل بصمت عند انقطاع الشبكة، ويضمن وجود جلسة قبل الإرسال.
 */
export async function recordCasualScore(game: CasualGame, points: number): Promise<void> {
  if (!hasSupabase()) return;
  if (!Number.isFinite(points) || points <= 0) return;
  try {
    await ensureSession();
    await supabase().rpc('record_casual_score', {
      p_game: game,
      p_points: Math.round(points),
    });
  } catch {
    // تجاهل: فشل الشبكة لا يجب أن يوقف اللعب أو يزعج المستخدم.
  }
}