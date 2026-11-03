/**
 * اختبارات محرك المباراة — بساعة وهمية حتمية (لا انتظار ولا توقيت حقيقي).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMING, MatchEngine } from '../src/core/engine.ts';
import type { MatchPlan, Question } from '../src/core/matchPlan.ts';
import { DEFAULT_SCORING } from '../src/core/scoring.ts';

function makeClock(start = 1_000_000) {
  let current = start;
  return {
    clock: { now: () => current },
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const question = (prompt: string, correct = 0): Question => ({
  q: prompt,
  a: ['أ', 'ب', 'ج', 'د'],
  c: correct,
  ex: 'شرح',
});

function soloPlan(questionCount: number): MatchPlan {
  return {
    rounds: [{ index: 1, mode: 'solo', questionCount, label: 'منافسة فردية' }],
    totalQuestions: questionCount,
  };
}

function teamsPlan(questionCount: number, teamSize = 2): MatchPlan {
  return {
    rounds: [{ index: 1, mode: 'teams', questionCount, teamSize, label: 'فرق ثنائية' }],
    totalQuestions: questionCount,
  };
}

/** محرك فردي بلاعب واحد وجولة واحدة (بلا شاشة تمهيد لتبسيط الاختبار). */
function soloEngine(questionCount = 2) {
  const time = makeClock();
  const engine = new MatchEngine({
    players: [{ id: 'p1', name: 'لينا' }],
    plan: soloPlan(questionCount),
    questionsByRound: [[question('س1'), question('س2')].slice(0, questionCount)],
    config: { clock: time.clock, roundIntroMs: 0, revealMs: 1000, roundSummaryMs: 1000 },
  });
  return { engine, time };
}

describe('آلة حالة المباراة', () => {
  it('تبدأ في اللوبي ثم بالتعريف بالجولة', () => {
    const { engine } = soloEngine();
    expect(engine.phase).toBe('lobby');
    engine.start();
    expect(engine.phase).toBe('round_intro');
  });

  it('يفتح السؤال بعد انتهاء وقت التعريف', () => {
    const time = makeClock();
    const engine = new MatchEngine({
      players: [{ id: 'p1', name: 'لينا' }],
      plan: soloPlan(1),
      questionsByRound: [[question('س1')]],
      config: { clock: time.clock },
    });
    engine.start();
    expect(engine.phase).toBe('round_intro');

    time.advance(DEFAULT_TIMING.roundIntroMs - 1);
    engine.tick();
    expect(engine.phase).toBe('round_intro');

    time.advance(1);
    engine.tick();
    expect(engine.phase).toBe('question_open');
  });

  it('tick لا يتخطى مرحلة ويكون آمناً عند التكرار', () => {
    const { engine, time } = soloEngine();
    engine.start();
    time.advance(1); // انتهى التعريف (مدته صفر)
    engine.tick();
    expect(engine.phase).toBe('question_open');

    const endsAt = engine.phaseEndsAt;
    engine.tick();
    engine.tick();
    engine.tick();
    expect(engine.phase).toBe('question_open');
    expect(engine.phaseEndsAt).toBe(endsAt);
  });

  it('ينتقل إلى الكشف بعد انتهاء نافذة الإجابة (وقت + مهلة)', () => {
    const { engine, time } = soloEngine();
    engine.start();
    engine.tick();
    time.advance(DEFAULT_SCORING.limitMs + DEFAULT_SCORING.graceMs);
    engine.tick();
    expect(engine.phase).toBe('question_reveal');
  });

  it('ينتهي السؤال مبكراً عند إجابة جميع اللاعبين', () => {
    const { engine } = soloEngine();
    engine.start();
    engine.tick();
    engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 });
    expect(engine.phase).toBe('question_reveal');
  });

  it('يمرّ السؤال الثاني ثم ملخص الجولة ثم نهاية المباراة', () => {
    const { engine, time } = soloEngine(2);
    engine.start();
    engine.tick();
    engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 });
    expect(engine.phase).toBe('question_reveal');

    time.advance(1000); // انتهاء الكشف
    engine.tick();
    expect(engine.phase).toBe('question_open');
    expect(engine.view().questionNumber).toBe(2);

    engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 });
    time.advance(1000);
    engine.tick();
    expect(engine.phase).toBe('round_summary');

    time.advance(1000);
    engine.tick();
    expect(engine.phase).toBe('match_end');
  });
});

describe('احتساب النقاط داخل المحرك', () => {
  it('الإجابة الفورية الصحيحة = 200 نقطة', () => {
    const { engine } = soloEngine();
    engine.start();
    engine.tick();
    const result = engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 });
    expect(result.accepted).toBe(true);
    expect(result.correct).toBe(true);
    expect(result.points).toBe(200);
    expect(engine.standings()[0].total).toBe(200);
  });

  it('الإجابة الخاطئة = صفر بلا خصم', () => {
    const { engine } = soloEngine();
    engine.start();
    engine.tick();
    const result = engine.submitAnswer({ playerId: 'p1', choiceIndex: 2 });
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
    expect(engine.standings()[0].total).toBe(0);
  });

  it('الإجابة داخل مهلة الشبكة = 100 نقطة', () => {
    const { engine, time } = soloEngine();
    engine.start();
    engine.tick();
    time.advance(DEFAULT_SCORING.limitMs + 200);
    const result = engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 });
    expect(result.accepted).toBe(true);
    expect(result.points).toBe(100);
  });

  it('الإجابة بعد المهلة تُرفض', () => {
    const { engine, time } = soloEngine();
    engine.start();
    engine.tick();
    time.advance(DEFAULT_SCORING.limitMs + DEFAULT_SCORING.graceMs + 1);
    const result = engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('too-late');
  });

  it('الإجابة المكررة تُرفض ولا تُضاف نقاطها', () => {
    const time = makeClock();
    const engine = new MatchEngine({
      players: [
        { id: 'p1', name: 'لينا' },
        { id: 'p2', name: 'نورة' },
      ],
      plan: soloPlan(1),
      questionsByRound: [[question('س1')]],
      config: { clock: time.clock, roundIntroMs: 0 },
    });
    engine.start();
    engine.tick();

    expect(engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 }).accepted).toBe(true);
    const second = engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 });
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe('duplicate');

    const standing = engine.standings().find((row) => row.playerId === 'p1');
    expect(standing?.total).toBe(200);
  });

  it('لا تُكشف الإجابة الصحيحة قبل مرحلة الكشف', () => {
    const { engine } = soloEngine();
    engine.start();
    engine.tick();
    expect(engine.view().correctIndex).toBeUndefined();

    engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 });
    expect(engine.view().correctIndex).toBe(0);
    expect(engine.view().explanation).toBe('شرح');
  });
});


describe('جولات الفرق', () => {
  function teamsEngine() {
    const time = makeClock();
    const engine = new MatchEngine({
      players: [
        { id: 'a', name: 'أحمد' },
        { id: 'b', name: 'بدر' },
        { id: 'c', name: 'سلمى' },
        { id: 'd', name: 'دانة' },
      ],
      plan: teamsPlan(2, 2),
      questionsByRound: [[question('س1', 1), question('س2', 1)]],
      config: { clock: time.clock, roundIntroMs: 0 },
    });
    return { engine, time };
  }

  it('يوزّع اللاعبين على فرق متساوية', () => {
    const { engine } = teamsEngine();
    engine.start();
    engine.tick();
    const teams = engine.view().teams;
    expect(teams).toHaveLength(2);
    expect(teams.every((team) => team.memberIds.length === 2)).toBe(true);
    expect(teams.flatMap((team) => team.memberIds).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('يرفض إرسال من ليس دوره، ويقبل المُرسِل بالتناوب', () => {
    const { engine, time } = teamsEngine();
    engine.start();
    engine.tick();

    const team = engine.view().teams[0];
    const first = team.memberIds[0];
    const second = team.memberIds[1];

    const wrong = engine.submitAnswer({ playerId: second, choiceIndex: 1 });
    expect(wrong.accepted).toBe(false);
    expect(wrong.reason).toBe('not-submitter');

    expect(engine.submitAnswer({ playerId: first, choiceIndex: 1 }).accepted).toBe(true);

    // السؤال يبقى مفتوحاً للفريق الآخر حتى ينتهي وقته
    time.advance(DEFAULT_SCORING.limitMs + DEFAULT_SCORING.graceMs);
    engine.tick();
    expect(engine.phase).toBe('question_reveal');

    time.advance(DEFAULT_TIMING.revealMs);
    engine.tick();
    expect(engine.phase).toBe('question_open');
    expect(engine.view().questionNumber).toBe(2);

    // السؤال التالي: الدور ينتقل إلى العضو الآخر
    expect(engine.submitAnswer({ playerId: first, choiceIndex: 1 }).reason).toBe('not-submitter');
    expect(engine.submitAnswer({ playerId: second, choiceIndex: 1 }).accepted).toBe(true);
  });

  it('نقاط الفريق تُحتسب لكل أعضائه', () => {
    const { engine } = teamsEngine();
    engine.start();
    engine.tick();

    const team = engine.view().teams[0];
    engine.submitAnswer({ playerId: team.memberIds[0], choiceIndex: 1 });

    const rows = engine.standings().filter((row) => team.memberIds.includes(row.playerId));
    expect(rows.every((row) => row.teamPoints === 200)).toBe(true);
    expect(rows.every((row) => row.total === 200)).toBe(true);
  });
});
