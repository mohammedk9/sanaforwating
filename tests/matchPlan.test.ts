/**
 * اختبارات خطة المباراة (Dynamic Match) واختيار أسئلة الجولات.
 */
import { describe, expect, it } from 'vitest';
import {
  buildMatchPlan,
  expectedTeamCount,
  pickRoundQuestions,
  type Question,
} from '../src/core/matchPlan.ts';

describe('خطة المباراة', () => {
  it('ستة لاعبين: فردي ٣ ← فرق ٣ ← مواجهة فردية سريعة ٢', () => {
    const plan = buildMatchPlan(6);
    expect(plan.rounds.map((round) => round.mode)).toEqual(['solo', 'teams', 'solo']);
    expect(plan.rounds[0].questionCount).toBe(3);
    expect(plan.rounds[1].questionCount).toBe(3);
    expect(plan.rounds[1].teamSize).toBe(2);
    expect(plan.rounds[2].questionCount).toBe(2);
    expect(plan.totalQuestions).toBe(8);
  });

  it('ترقيم الجولات متتالٍ وكل جولة لها وصف ظاهر', () => {
    const plan = buildMatchPlan(6);
    expect(plan.rounds.map((round) => round.index)).toEqual([1, 2, 3]);
    expect(plan.rounds.every((round) => round.label.length > 0)).toBe(true);
  });

  it('لاعب واحد: بلا جولات فرق', () => {
    const plan = buildMatchPlan(1);
    expect(plan.rounds.every((round) => round.mode === 'solo')).toBe(true);
    expect(plan.totalQuestions).toBe(5);
  });

  it('يمكن ضبط عدد الأسئلة وإلغاء المواجهة الأخيرة', () => {
    const plan = buildMatchPlan(6, {
      soloQuestionCount: 5,
      teamQuestionCount: 4,
      finalSoloQuestionCount: 0,
    });
    expect(plan.rounds).toHaveLength(2);
    expect(plan.totalQuestions).toBe(9);
  });

  it('عدد الفرق المتوقع', () => {
    expect(expectedTeamCount(6, 2)).toBe(3);
    expect(expectedTeamCount(5, 2)).toBe(2);
    expect(expectedTeamCount(7, 2)).toBe(3);
    expect(expectedTeamCount(1, 2)).toBe(1);
    expect(expectedTeamCount(6, 0)).toBe(0);
  });
});

describe('اختيار أسئلة الجولة', () => {
  const bank: Question[] = [
    { q: 's1', a: ['أ', 'ب'], c: 0, ex: 'شرح', mode: 'solo' },
    { q: 's2', a: ['أ', 'ب'], c: 0, ex: 'شرح', mode: 'solo' },
    { q: 't1', a: ['أ', 'ب'], c: 0, ex: 'شرح', mode: 'team' },
    { q: 't2', a: ['أ', 'ب'], c: 0, ex: 'شرح', mode: 'team' },
    { q: 'x1', a: ['أ', 'ب'], c: 0, ex: 'شرح' },
  ];

  it('جولة الفرق تختار الأسئلة الجماعية أولاً', () => {
    const result = pickRoundQuestions(bank, 'teams', 2);
    expect(result.questions.map((question) => question.q)).toEqual(['t1', 't2']);
  });

  it('الجولة الفردية تختار الأسئلة الفردية أولاً', () => {
    const result = pickRoundQuestions(bank, 'solo', 2);
    expect(result.questions.map((question) => question.q)).toEqual(['s1', 's2']);
  });

  it('تُكمل من الأسئلة العامة عند نقص الأسئلة المتخصصة', () => {
    const result = pickRoundQuestions(bank, 'solo', 3);
    expect(result.questions.map((question) => question.q)).toEqual(['s1', 's2', 'x1']);
    expect(result.usedIds).toHaveLength(3);
  });

  it('لا يعيد سؤالاً استُخدم في جولة سابقة', () => {
    const firstRound = pickRoundQuestions(bank, 'solo', 2);
    const secondRound = pickRoundQuestions(bank, 'solo', 2, firstRound.usedIds);
    expect(secondRound.questions.map((question) => question.q)).toEqual(['x1']);
    expect(secondRound.usedIds).toHaveLength(3);
  });

  it('لا يسحب أسئلة النمط الآخر ولا يتجاوز العدد المطلوب', () => {
    const result = pickRoundQuestions(bank, 'teams', 10);
    // في جولة الفرق تُختار الأسئلة الجماعية ثم العامة فقط، ولا تُسحب الأسئلة الفردية
    expect(result.questions.map((question) => question.q)).toEqual(['t1', 't2', 'x1']);
    expect(result.questions.length).toBeLessThanOrEqual(10);
    expect(result.questions.every((question) => (question.mode ?? 'any') !== 'solo')).toBe(true);
  });
});
