/**
 * اختبارات حدود اللاعبين (1–8) ودور اللاعبين في Pass & Play.
 */
import { describe, expect, it } from 'vitest';
import {
  checkPlayerCount,
  isSoloMatch,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizePlayerNames,
} from '../src/core/players.ts';
import { buildMatchPlan, type Question } from '../src/core/matchPlan.ts';
import { assignTeams } from '../src/core/teams.ts';
import { DEFAULT_TIMING, MatchEngine } from '../src/core/engine.ts';
import { DEFAULT_SCORING } from '../src/core/scoring.ts';

describe('حدود عدد اللاعبين', () => {
  it('الحد الأدنى لاعب واحد والحد الأقصى ثمانية', () => {
    expect(MIN_PLAYERS).toBe(1);
    expect(MAX_PLAYERS).toBe(8);
  });

  it('يقبل من 1 إلى 8 ويرفض ما عداها', () => {
    for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
      expect(checkPlayerCount(count).ok).toBe(true);
    }
    expect(checkPlayerCount(0).ok).toBe(false);
    expect(checkPlayerCount(9).ok).toBe(false);
    expect(checkPlayerCount(1.5).ok).toBe(false);
  });

  it('رسائل الرفض عربية وواضحة', () => {
    expect(checkPlayerCount(0).message).toContain('لاعب');
    expect(checkPlayerCount(9).message).toContain('8');
  });

  it('لاعب واحد يُعدّ تحدياً فردياً', () => {
    expect(isSoloMatch(1)).toBe(true);
    expect(isSoloMatch(2)).toBe(false);
  });

  it('تنظيف الأسماء: الفراغات تُحذف والحد الأقصى 8', () => {
    const names = ['', '  ', 'لينا', 'نورة', 'أحمد', 'بدر', 'سلمى', 'دانة', 'خالد', 'جود', 'زيد'];
    const clean = normalizePlayerNames(names);
    expect(clean).toHaveLength(8);
    expect(clean[0]).toBe('لينا');
    expect(clean.every((name) => name.length > 0)).toBe(true);
  });
});

describe('خطة المباراة لكل عدد لاعبين', () => {
  it('لاعب واحد: جولات فردية فقط بلا فرق', () => {
    const plan = buildMatchPlan(1);
    expect(plan.rounds.every((round) => round.mode === 'solo')).toBe(true);
  });

  it('لاعبان: فريق واحد على الأقل', () => {
    const plan = buildMatchPlan(2);
    expect(plan.rounds.some((round) => round.mode === 'teams')).toBe(true);
  });

  it('ستة لاعبين: ثلاث فرق ثنائية', () => {
    const plan = buildMatchPlan(6);
    const teamsRound = plan.rounds.find((round) => round.mode === 'teams');
    expect(teamsRound?.teamSize).toBe(2);
    const teams = assignTeams({ playerIds: ['a', 'b', 'c', 'd', 'e', 'f'], teamSize: 2 });
    expect(teams).toHaveLength(3);
  });

  it('ثمانية لاعبين: أربع فرق ثنائية بلا لاعب ضائع', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const teams = assignTeams({ playerIds: players, teamSize: 2 });
    expect(teams).toHaveLength(4);
    expect(teams.flatMap((team) => team.memberIds).sort()).toEqual(players);
    expect(teams.every((team) => team.memberIds.length === 2)).toBe(true);
  });

describe('النافذة المشتركة وترتيب الدور (Pass & Play)', () => {
  const question = (prompt: string): Question => ({
    q: prompt,
    a: ['أ', 'ب', 'ج', 'د'],
    c: 0,
    ex: 'شرح',
  });

  function makeClock(start = 1_000_000) {
    let current = start;
    return {
      clock: { now: () => current },
      advance: (ms: number) => {
        current += ms;
      },
    };
  }

  /** مباراة ثمانية لاعبين، جولة فردية واحدة بسؤالين. */
  function eightPlayerEngine() {
    const time = makeClock();
    const players = Array.from({ length: 8 }, (_unused, i) => ({
      id: `p${i + 1}`,
      name: `لاعب ${i + 1}`,
    }));
    const engine = new MatchEngine({
      players,
      plan: {
        rounds: [{ index: 1, mode: 'solo', questionCount: 2, label: 'منافسة فردية' }],
        totalQuestions: 2,
      },
      questionsByRound: [[question('س1'), question('س2')]],
      config: { clock: time.clock, roundIntroMs: 0 },
    });
    return { engine, time, players };
  }

  it('ثمانية لاعبين يستطيعون الإجابة داخل نافذة واحدة مشتركة', () => {
    const { engine } = eightPlayerEngine();
    engine.start();
    engine.tick();

    const startedAt = engine.view().startedAt;
    for (let i = 0; i < 8; i++) {
      const view = engine.view();
      const result = engine.submitAnswer({
        playerId: view.submitterId as string,
        choiceIndex: 0,
      });
      expect(result.accepted).toBe(true);
    }

    // كل الإجابات نُسبت إلى نفس لحظة بدء السؤال = نافذة مشتركة
    const answers = engine.view().answers;
    expect(answers).toHaveLength(8);
    expect(answers.every((answer) => answer.elapsedMs === 0)).toBe(true);
    expect(engine.view().startedAt).toBe(startedAt);
    // بعد إجابة الجميع ينتقل السؤال مباشرة إلى الكشف
    expect(engine.phase).toBe('question_reveal');
  });

  it('إجابة لاعب متأخرة عن النافذة تُرفض', () => {
    const { engine, time } = eightPlayerEngine();
    engine.start();
    engine.tick();

    expect(engine.submitAnswer({ playerId: 'p1', choiceIndex: 0 }).accepted).toBe(true);
    time.advance(DEFAULT_SCORING.limitMs + DEFAULT_SCORING.graceMs + 1);
    const late = engine.submitAnswer({ playerId: 'p2', choiceIndex: 0 });
    expect(late.accepted).toBe(false);
    expect(late.reason).toBe('too-late');
  });

  it('ترتيب الدور يشمل كل اللاعبين ويتغيّر بين الأسئلة', () => {
    const { engine, time } = eightPlayerEngine();
    engine.start();
    engine.tick();

    const firstOrder = [...(engine.view().turnOrder ?? [])];
    expect([...firstOrder].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);

    // أنهِ السؤال الأول بالكامل ثم ابدأ الثاني
    for (let i = 0; i < 8; i++) {
      const view = engine.view();
      engine.submitAnswer({ playerId: view.submitterId as string, choiceIndex: 0 });
    }
    time.advance(DEFAULT_TIMING.revealMs);
    engine.tick();

    expect(engine.phase).toBe('question_open');
    const secondOrder = [...(engine.view().turnOrder ?? [])];
    expect(secondOrder.sort()).toEqual([...firstOrder].sort());
    expect(secondOrder).not.toEqual(firstOrder);
  });

  it('لاعب واحد يلعب لوحده ويحصل على نقاط كاملة', () => {
    const time = makeClock();
    const engine = new MatchEngine({
      players: [{ id: 'solo', name: 'أنت' }],
      plan: buildMatchPlan(1, { soloQuestionCount: 1, finalSoloQuestionCount: 0 }),
      questionsByRound: [[question('س1')]],
      config: { clock: time.clock, roundIntroMs: 0, roundSummaryMs: 0 },
    });
    engine.start();
    engine.tick();

    const view = engine.view();
    expect(view.submitterId).toBe('solo');
    const result = engine.submitAnswer({ playerId: 'solo', choiceIndex: 0 });
    expect(result.points).toBeGreaterThanOrEqual(100);
    expect(engine.standings()[0].total).toBe(result.points);
  });
});


  it('لا خطة بأكثر من ثمانية لاعبين', () => {
    expect(checkPlayerCount(9).ok).toBe(false);
  });
});
