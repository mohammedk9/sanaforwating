/**
 * احتساب نقاط SANA — منطق نقي (بلا DOM وبلا شبكة).
 *
 * القاعدة المعتمدة:
 *   إجابة صحيحة = 100 نقطة أساس + حتى 100 نقطة سرعة
 *   إجابة خاطئة أو انتهاء الوقت = صفر، بلا أي خصم
 *
 * مرجع الوقت هو الخادم دائماً، ولهذا تستقبل الدوال «الزمن المنقضي» كوسيط
 * بدلاً من قراءة ساعة الجهاز. أي إجابة تصل بعد انتهاء الوقت لكن داخل مهلة
 * الشبكة (graceMs) تُقبل بـ 100 نقطة فقط بلا مكافأة سرعة.
 *
 * هذا الملف لا يعتمد على المتصفح إطلاقاً، لذا يمكن تشغيله كما هو للتحقق
 * من الإجابات على الخادم في مرحلة اللعب الجماعي.
 */

export interface ScoringConfig {
  /** الحد الزمني لكل سؤال (ميلي ثانية) */
  limitMs: number;
  /** نقاط الإجابة الصحيحة مهما كانت سرعتها */
  basePoints: number;
  /** أقصى نقاط إضافية تُمنح لأسرع إجابة */
  speedBonusPoints: number;
  /** مهلة شبكة صغيرة تُقبل خلالها الإجابة بعد انتهاء الوقت، بلا مكافأة سرعة */
  graceMs: number;
}

/** المدة الافتراضية للسؤال: 15 ثانية */
export const DEFAULT_QUESTION_MS = 15_000;

export const DEFAULT_SCORING: ScoringConfig = {
  limitMs: DEFAULT_QUESTION_MS,
  basePoints: 100,
  speedBonusPoints: 100,
  graceMs: 300,
};

/** هل وصلت الإجابة داخل النافذة المقبولة (الوقت + مهلة الشبكة)؟ */
export function isWithinWindow(
  elapsedMs: number,
  config: ScoringConfig = DEFAULT_SCORING,
): boolean {
  return elapsedMs <= config.limitMs + config.graceMs;
}

/**
 * معامل السرعة: 1 عند الوصول الفوري، وينخفض خطياً إلى 0 عند انتهاء الوقت.
 * الإجابة داخل مهلة الشبكة تحصل على 0 ⇒ 100 نقطة فقط بلا مكافأة.
 */
export function speedFactor(elapsedMs: number, config: ScoringConfig = DEFAULT_SCORING): number {
  if (elapsedMs <= 0) return 1;
  if (elapsedMs >= config.limitMs) return 0;
  return 1 - elapsedMs / config.limitMs;
}

/** نقاط إجابة واحدة. الإجابة الخاطئة = صفر دائماً (بلا خصم). */
export function answerPoints(input: {
  correct: boolean;
  elapsedMs: number;
  config?: ScoringConfig;
}): number {
  const config = input.config ?? DEFAULT_SCORING;
  if (!input.correct) return 0;
  return (
    config.basePoints +
    Math.round(config.speedBonusPoints * speedFactor(input.elapsedMs, config))
  );
}

/** مجموع نقاط مجموعة إجابات. */
export function sumPoints(points: readonly number[]): number {
  return points.reduce((total, value) => total + value, 0);
}
