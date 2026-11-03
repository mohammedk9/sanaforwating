/**
 * اختبارات نقاط SANA.
 * القاعدة: إجابة صحيحة = 100 + حتى 100 للسرعة (المدى 100..200)، والخطأ = صفر.
 * المهلة: 300ms تُقبل بعد انتهاء الوقت بلا أي مكافأة سرعة.
 */
import { describe, expect, it } from 'vitest';
import {
  answerPoints,
  DEFAULT_SCORING,
  isWithinWindow,
  speedFactor,
  sumPoints,
} from '../src/core/scoring.ts';

const LIMIT = DEFAULT_SCORING.limitMs; // 15000
const GRACE = DEFAULT_SCORING.graceMs; // 300

describe('نقاط السؤال', () => {
  it('الإجابة الفورية = 200 نقطة', () => {
    expect(answerPoints({ correct: true, elapsedMs: 0 })).toBe(200);
  });

  it('منتصف الوقت (7.5 ثانية) = 150 نقطة', () => {
    expect(answerPoints({ correct: true, elapsedMs: 7500 })).toBe(150);
  });

  it('عند انتهاء الوقت بالضبط = 100 نقطة (بلا مكافأة سرعة)', () => {
    expect(answerPoints({ correct: true, elapsedMs: LIMIT })).toBe(100);
  });

  it('داخل مهلة الشبكة (15.3 ثانية) = 100 نقطة كاملة بلا مكافأة', () => {
    expect(answerPoints({ correct: true, elapsedMs: LIMIT + GRACE })).toBe(100);
  });

  it('الإجابة الخاطئة = صفر بلا خصم حتى لو كانت فورية', () => {
    expect(answerPoints({ correct: false, elapsedMs: 0 })).toBe(0);
  });

  it('زمن سالب (انحراف ساعة) يُعامل كإجابة فورية', () => {
    expect(answerPoints({ correct: true, elapsedMs: -50 })).toBe(200);
  });

  it('لا تتجاوز النقاط الحد الأعلى 200 ولا تقل عن 100 للإجابة الصحيحة', () => {
    const fast = answerPoints({ correct: true, elapsedMs: 1 });
    const slow = answerPoints({ correct: true, elapsedMs: LIMIT - 1 });
    expect(fast).toBeLessThanOrEqual(200);
    expect(slow).toBeGreaterThanOrEqual(100);
  });
});

describe('النافذة الزمنية', () => {
  it('تقبل الإجابة قبل انتهاء الوقت', () => {
    expect(isWithinWindow(LIMIT - 1)).toBe(true);
  });

  it('تقبل الإجابة داخل مهلة الشبكة', () => {
    expect(isWithinWindow(LIMIT + GRACE)).toBe(true);
  });

  it('ترفض الإجابة بعد المهلة بميلي ثانية واحدة', () => {
    expect(isWithinWindow(LIMIT + GRACE + 1)).toBe(false);
  });
});

describe('معامل السرعة', () => {
  it('يبدأ من 1 وينخفض خطياً إلى 0', () => {
    expect(speedFactor(0)).toBe(1);
    expect(speedFactor(7500)).toBeCloseTo(0.5, 5);
    expect(speedFactor(LIMIT)).toBe(0);
  });

  it('يبقى صفراً بعد انتهاء الوقت', () => {
    expect(speedFactor(LIMIT + GRACE)).toBe(0);
  });
});

describe('مجموع النقاط', () => {
  it('يجمع نقاط الإجابات', () => {
    expect(sumPoints([200, 150, 100])).toBe(450);
  });

  it('مجموعة فارغة = صفر', () => {
    expect(sumPoints([])).toBe(0);
  });
});
