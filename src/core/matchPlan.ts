/**
 * خطة المباراة (Dynamic Match) — منطق نقي بلا DOM وبلا شبكة.
 *
 * المباراة تتغيّر أنماطها أثناء اللعب لمنع التكرار والملل:
 *   منافسة فردية ← إعادة تشكيل إلى فرق ← أسئلة جماعية ← مواجهة فردية سريعة.
 *
 * الخطة هنا «وصف» فقط: أي جولات وبأي أنماط وكم سؤالاً.
 * وتشكيل الفرق نفسه في teams.ts، وتنفيذ الجولات في engine.ts.
 */

export type RoundMode = 'solo' | 'teams';

/** النمط المناسب للسؤال: فردي، أو جماعي (يحتاج تشاوراً داخل الفريق) */
export type QuestionMode = 'solo' | 'team' | 'any';

export interface Question {
  /** نص السؤال */
  q: string;
  /** الخيارات */
  a: string[];
  /** فهرس الإجابة الصحيحة */
  c: number;
  /** شرح مختصر يظهر بعد الكشف */
  ex: string;
  /** النمط المناسب — الافتراضي فردي */
  mode?: QuestionMode;
}

export interface Player {
  id: string;
  /** الاسم المعروض */
  name: string;
}

export interface Round {
  /** رقم الجولة بدءاً من 1 */
  index: number;
  mode: RoundMode;
  /** عدد الأسئلة في هذه الجولة */
  questionCount: number;
  /** حجم الفريق (في جولات الفرق فقط) */
  teamSize?: number;
  /** وصف مختصر يظهر للاعب قبل الجولة */
  label: string;
}

export interface MatchPlan {
  rounds: Round[];
  /** مجموع الأسئلة في المباراة كلها */
  totalQuestions: number;
}

export interface PlanOptions {
  /** عدد أسئلة الجولة الفردية الأولى (الافتراضي 3) */
  soloQuestionCount?: number;
  /** عدد أسئلة جولة الفرق (الافتراضي 3) */
  teamQuestionCount?: number;
  /** حجم الفريق: 2 ⇒ ستة لاعبين = ثلاثة فرق */
  teamSize?: number;
  /** عدد أسئلة المواجهة الفردية السريعة في النهاية (0 = بلا مواجهة) */
  finalSoloQuestionCount?: number;
}

const DEFAULTS: Required<PlanOptions> = {
  soloQuestionCount: 3,
  teamQuestionCount: 3,
  teamSize: 2,
  finalSoloQuestionCount: 2,
};

/**
 * يبني خطة المباراة بحسب عدد اللاعبين.
 * اللاعب الواحد يلعب فردياً فقط، وجولات الفرق تحتاج لاعبين كافيين.
 */
export function buildMatchPlan(playerCount: number, options: PlanOptions = {}): MatchPlan {
  const config = { ...DEFAULTS, ...options };
  const rounds: Round[] = [];

  rounds.push({
    index: 1,
    mode: 'solo',
    questionCount: config.soloQuestionCount,
    label: 'منافسة فردية',
  });

  // جولة الفرق تحتاج لاعبين اثنين على الأقل لتكوين فريق واحد
  const teamsPossible = playerCount >= config.teamSize;
  if (teamsPossible) {
    rounds.push({
      index: rounds.length + 1,
      mode: 'teams',
      questionCount: config.teamQuestionCount,
      teamSize: config.teamSize,
      label: 'فرق ثنائية',
    });
  }

  if (config.finalSoloQuestionCount > 0) {
    rounds.push({
      index: rounds.length + 1,
      mode: 'solo',
      questionCount: config.finalSoloQuestionCount,
      label: 'مواجهة فردية سريعة',
    });
  }

  const totalQuestions = rounds.reduce((total, round) => total + round.questionCount, 0);
  return { rounds, totalQuestions };
}

/** عدد الفرق المتوقع في جولة جماعية (يُستخدم في الواجهة قبل التشكيل). */
export function expectedTeamCount(playerCount: number, teamSize: number): number {
  if (teamSize <= 0) return 0;
  return Math.max(1, Math.floor(playerCount / teamSize));
}

/**
 * يختار أسئلة الجولة من البنك بحسب النمط، دون تكرار.
 * الترتيب الناتج ثابت من نفس المدخلات (مفيد للاختبار ولإعادة المباراة).
 */
export function pickRoundQuestions(
  bank: readonly Question[],
  mode: RoundMode,
  count: number,
  usedIds: readonly number[] = [],
): { questions: Question[]; usedIds: number[] } {
  const wanted: QuestionMode = mode === 'teams' ? 'team' : 'solo';
  const used = [...usedIds];
  const chosen: Question[] = [];

  // أفضّل الأسئلة المخصصة للنمط، ثم الأسئلة العامة
  for (const preference of [wanted, 'any'] as const) {
    for (let i = 0; i < bank.length && chosen.length < count; i++) {
      if (used.includes(i)) continue;
      const questionMode = bank[i].mode ?? 'any';
      if (questionMode !== preference) continue;
      chosen.push(bank[i]);
      used.push(i);
    }
    if (chosen.length === count) break;
  }

  return { questions: chosen, usedIds: used };
}
