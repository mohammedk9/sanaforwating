/**
 * محرك المباراة — منطق نقي بلا DOM وبلا شبكة.
 *
 * المسؤوليات:
 *  - آلة حالة واضحة: lobby ← round_intro ← question_open ← question_reveal
 *    ← round_summary ← (جولة تالية) ← match_end
 *  - المؤقت يعتمد على **وقت انتهاء مطلق** (phaseEndsAt) لا على عدّاد محلي،
 *    وتُحقن الساعة (Clock) من الخارج: ساعة الجهاز في Pass & Play،
 *    وساعة الخادم في اللعب الجماعي — بلا تغيير في المنطق.
 *  - احتساب النقاط عبر scoring.ts فقط، بالزمن المنقضي عن بدء السؤال.
 *  - في جولات الفرق: يتناوب أعضاء الفريق على إرسال الإجابة (سؤال بسؤال)،
 *    ويُرفض إرسال غير المُرسِل، وتُحتسب النقاط للفريق ولأعضائه.
 *
 * كل الانتقالات idempotent: استدعاء tick() مراراً لا يتخطى مرحلة،
 * وهو ما يسمح لاحقاً بأن يقود الخادم الانتقالات بأمان.
 */
import type { MatchPlan, Player, Question, Round } from './matchPlan.ts';
import { DEFAULT_SCORING, answerPoints, isWithinWindow, type ScoringConfig } from './scoring.ts';
import { assignTeams, type Team } from './teams.ts';

export type Phase =
  | 'lobby'
  | 'round_intro'
  | 'question_open'
  | 'question_reveal'
  | 'round_summary'
  | 'match_end';

/** ساعة قابلة للحقن — تُمكّن الاختبار الحتمي وتحقن وقت الخادم لاحقاً. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface MatchTiming {
  /** مدة شاشة تعريف الجولة */
  roundIntroMs: number;
  /** مدة كشف الإجابة */
  revealMs: number;
  /** مدة ملخص الجولة */
  roundSummaryMs: number;
}

export const DEFAULT_TIMING: MatchTiming = {
  roundIntroMs: 3_000,
  revealMs: 5_000,
  roundSummaryMs: 6_000,
};

export interface MatchConfig extends MatchTiming {
  clock: Clock;
  scoring: ScoringConfig;
}

export interface MatchSetup {
  players: Player[];
  plan: MatchPlan;
  /** أسئلة كل جولة بالترتيب، بنفس ترتيب plan.rounds */
  questionsByRound: readonly (readonly Question[])[];
  config?: Partial<MatchConfig>;
}

export interface AnswerRecord {
  playerId: string;
  /** في جولات الفرق: معرّف الفريق الذي أرسل */
  teamId?: string;
  choiceIndex: number;
  correct: boolean;
  elapsedMs: number;
  points: number;
}

export type SubmitRejection =
  | 'not-open'
  | 'too-late'
  | 'duplicate'
  | 'not-submitter'
  | 'no-team'
  | 'finished';

export interface SubmitResult {
  accepted: boolean;
  reason?: SubmitRejection;
  correct: boolean;
  points: number;
  elapsedMs: number;
}

export interface QuestionView {
  phase: Phase;
  roundIndex: number;
  roundLabel: string;
  roundMode: 'solo' | 'teams';
  questionNumber: number;
  questionCount: number;
  prompt: string;
  choices: string[];
  /** وقت بدء السؤال ووقت انتهائه (مرجع العرض والعدّاد) */
  startedAt: number;
  endsAt: number;
  secondsLeft: number;
  /** يُكشف في مرحلة الكشف فقط */
  correctIndex?: number;
  explanation?: string;
  answers: AnswerRecord[];
  teams: Team[];
}

export interface Standing {
  playerId: string;
  name: string;
  soloPoints: number;
  teamPoints: number;
  total: number;
}

interface EngineState {
  phase: Phase;
  /** رقم الجولة (يبدأ من 1) و0 في اللوبي */
  roundIndex: number;
  /** فهرس السؤال داخل الجولة (يبدأ من 0) */
  questionIndex: number;
  roundStartedAt: number;
  questionStartedAt: number;
  phaseEndsAt: number;
  answers: AnswerRecord[];
  soloPoints: Record<string, number>;
  teamPoints: Record<string, number>;
  teams: Team[];
}

export class MatchEngine {
  private readonly players: Player[];
  private readonly plan: MatchPlan;
  private readonly questionsByRound: readonly (readonly Question[])[];
  private readonly config: MatchConfig;

  private state: EngineState;
  private previousTeams: Team[] = [];

  constructor(setup: MatchSetup) {
    this.players = setup.players.map((player) => ({ ...player }));
    this.plan = setup.plan;
    this.questionsByRound = setup.questionsByRound;
    this.config = {
      ...DEFAULT_TIMING,
      clock: systemClock,
      scoring: DEFAULT_SCORING,
      ...setup.config,
    };
    this.state = {
      phase: 'lobby',
      roundIndex: 0,
      questionIndex: 0,
      roundStartedAt: 0,
      questionStartedAt: 0,
      phaseEndsAt: 0,
      answers: [],
      soloPoints: {},
      teamPoints: {},
      teams: [],
    };
    for (const player of this.players) this.state.soloPoints[player.id] = 0;
  }

  private now(): number {
    return this.config.clock.now();
  }

  get phase(): Phase {
    return this.state.phase;
  }

  get roundIndex(): number {
    return this.state.roundIndex;
  }

  get questionIndex(): number {
    return this.state.questionIndex;
  }

  /** وقت انتهاء المرحلة الحالية — تستخدمه الواجهة لرسم العدّاد. */
  get phaseEndsAt(): number {
    return this.state.phaseEndsAt;
  }

  /** يبدأ المباراة من الجولة الأولى. آمن عند التكرار. */
  start(): this {
    if (this.state.phase !== 'lobby') return this;
    this.enterRound(1);
    return this;
  }

  /**
   * يقدّم المباراة إن انتهى وقت المرحلة الحالية.
   * يُستدعى من الواجهة كل بضعة أجزاء من الثانية، أو من الخادم لاحقاً.
   */
  tick(): this {
    let guard = 0;
    while (this.state.phase !== 'match_end' && guard < 50) {
      if (this.now() < this.state.phaseEndsAt) break;
      this.advance();
      guard += 1;
    }
    return this;
  }

  /** تقديم فوري (زر «التالي» في الواجهة). آمن عند التكرار. */
  advanceNow(): this {
    if (this.state.phase === 'match_end') return this;
    this.advance();
    return this;
  }

  private currentRound(): Round | undefined {
    return this.plan.rounds[this.state.roundIndex - 1];
  }

  private currentQuestion(): Question | undefined {
    return this.questionsByRound[this.state.roundIndex - 1]?.[this.state.questionIndex];
  }

  private enterRound(index: number): void {
    const round = this.plan.rounds[index - 1];
    if (!round) {
      this.finish();
      return;
    }

    const now = this.now();
    this.state.roundIndex = index;
    this.state.questionIndex = 0;
    this.state.roundStartedAt = now;
    this.state.answers = [];
    this.state.phase = 'round_intro';
    this.state.phaseEndsAt = now + this.config.roundIntroMs;

    if (round.mode === 'teams') {
      this.state.teams = assignTeams({
        playerIds: this.players.map((player) => player.id),
        teamSize: round.teamSize ?? 2,
        pointsByPlayer: Object.fromEntries(
          this.standings().map((standing) => [standing.playerId, standing.total]),
        ),
        previousTeams: this.previousTeams,
      });
      this.previousTeams = this.state.teams;
    } else {
      this.state.teams = [];
    }
  }

  private openQuestion(): void {
    const now = this.now();
    this.state.phase = 'question_open';
    this.state.questionStartedAt = now;
    this.state.answers = [];
    this.state.phaseEndsAt = now + this.config.scoring.limitMs + this.config.scoring.graceMs;
  }

  private reveal(): void {
    this.state.phase = 'question_reveal';
    this.state.phaseEndsAt = this.now() + this.config.revealMs;
  }

  private endRound(): void {
    this.state.phase = 'round_summary';
    this.state.phaseEndsAt = this.now() + this.config.roundSummaryMs;
  }

  private finish(): void {
    this.state.phase = 'match_end';
    this.state.phaseEndsAt = this.now();
  }

  /** انتقال واحد فقط — لا يتخطى مرحلة أبداً. */
  private advance(): void {
    const round = this.currentRound();

    switch (this.state.phase) {
      case 'lobby':
        this.enterRound(1);
        return;

      case 'round_intro':
        this.openQuestion();
        return;

      case 'question_open':
        this.reveal();
        return;

      case 'question_reveal': {
        const questionsInRound = this.questionsByRound[this.state.roundIndex - 1] ?? [];
        const isLastQuestion = this.state.questionIndex >= questionsInRound.length - 1;
        if (isLastQuestion) {
          this.endRound();
          return;
        }
        this.state.questionIndex += 1;
        this.openQuestion();
        return;
      }

      case 'round_summary':
        if (round && this.state.roundIndex < this.plan.rounds.length) {
          this.enterRound(this.state.roundIndex + 1);
          return;
        }
        this.finish();
        return;

      case 'match_end':
        return;
    }
  }

  /** يرسل إجابة اللاعب (أو الفريق) على السؤال المفتوح. */
  submitAnswer(input: { playerId: string; choiceIndex: number; at?: number }): SubmitResult {
    const at = input.at ?? this.now();

    if (this.state.phase === 'match_end') {
      return { accepted: false, reason: 'finished', correct: false, points: 0, elapsedMs: 0 };
    }
    if (this.state.phase !== 'question_open') {
      return { accepted: false, reason: 'not-open', correct: false, points: 0, elapsedMs: 0 };
    }

    const question = this.currentQuestion();
    const round = this.currentRound();
    if (!question || !round) {
      return { accepted: false, reason: 'not-open', correct: false, points: 0, elapsedMs: 0 };
    }

    const elapsedMs = at - this.state.questionStartedAt;
    if (!isWithinWindow(elapsedMs, this.config.scoring)) {
      return { accepted: false, reason: 'too-late', correct: false, points: 0, elapsedMs };
    }

    let teamId: string | undefined;

    if (round.mode === 'teams') {
      const team = this.state.teams.find((candidate) => candidate.memberIds.includes(input.playerId));
      if (!team) {
        return { accepted: false, reason: 'no-team', correct: false, points: 0, elapsedMs };
      }
      // تناوب الإرسال: عضو واحد فقط يرسل في هذا السؤال
      const submitterId = team.memberIds[this.state.questionIndex % team.memberIds.length];
      if (submitterId !== input.playerId) {
        return { accepted: false, reason: 'not-submitter', correct: false, points: 0, elapsedMs };
      }
      if (this.state.answers.some((answer) => answer.teamId === team.id)) {
        return { accepted: false, reason: 'duplicate', correct: false, points: 0, elapsedMs };
      }
      teamId = team.id;
    } else if (this.state.answers.some((answer) => answer.playerId === input.playerId)) {
      return { accepted: false, reason: 'duplicate', correct: false, points: 0, elapsedMs };
    }

    const correct = input.choiceIndex === question.c;
    const points = answerPoints({ correct, elapsedMs, config: this.config.scoring });

    this.state.answers.push({
      playerId: input.playerId,
      teamId,
      choiceIndex: input.choiceIndex,
      correct,
      elapsedMs,
      points,
    });

    if (teamId) {
      this.state.teamPoints[teamId] = (this.state.teamPoints[teamId] ?? 0) + points;
    } else {
      this.state.soloPoints[input.playerId] = (this.state.soloPoints[input.playerId] ?? 0) + points;
    }

    // إن أجاب الجميع، لا داعي لانتظار بقية الوقت
    if (this.everyoneAnswered(round)) this.reveal();

    return { accepted: true, correct, points, elapsedMs };
  }

  private everyoneAnswered(round: Round): boolean {
    if (round.mode === 'teams') {
      return this.state.teams.every((team) =>
        this.state.answers.some((answer) => answer.teamId === team.id),
      );
    }
    return this.players.every((player) =>
      this.state.answers.some((answer) => answer.playerId === player.id),
    );
  }

  /** عرض السؤال الحالي — بلا الإجابة الصحيحة قبل مرحلة الكشف. */
  view(): QuestionView {
    const round = this.currentRound();
    const question = this.currentQuestion();
    const questionsInRound = this.questionsByRound[this.state.roundIndex - 1] ?? [];
    const revealed =
      this.state.phase === 'question_reveal' ||
      this.state.phase === 'round_summary' ||
      this.state.phase === 'match_end';

    const remaining = this.state.questionStartedAt + this.config.scoring.limitMs - this.now();

    return {
      phase: this.state.phase,
      roundIndex: this.state.roundIndex,
      roundLabel: round?.label ?? '',
      roundMode: round?.mode ?? 'solo',
      questionNumber: this.state.questionIndex + 1,
      questionCount: questionsInRound.length,
      prompt: question?.q ?? '',
      choices: question ? [...question.a] : [],
      startedAt: this.state.questionStartedAt,
      endsAt: this.state.questionStartedAt + this.config.scoring.limitMs,
      secondsLeft: Math.max(0, Math.ceil(remaining / 1000)),
      correctIndex: revealed ? question?.c : undefined,
      explanation: revealed ? question?.ex : undefined,
      answers: this.state.answers.map((answer) => ({ ...answer })),
      teams: this.state.teams.map((team) => ({ ...team, memberIds: [...team.memberIds] })),
    };
  }

  /** ترتيب اللاعبين: فردي + نقاط فرقهم، تنازلياً. */
  standings(): Standing[] {
    const teamOf = new Map<string, string>();
    for (const team of this.state.teams) {
      for (const memberId of team.memberIds) teamOf.set(memberId, team.id);
    }

    return this.players
      .map((player) => {
        const soloPoints = this.state.soloPoints[player.id] ?? 0;
        const teamId = teamOf.get(player.id);
        const teamPoints = teamId ? (this.state.teamPoints[teamId] ?? 0) : 0;
        return {
          playerId: player.id,
          name: player.name,
          soloPoints,
          teamPoints,
          total: soloPoints + teamPoints,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  /** نسخة قابلة للحفظ/الإرسال (تُستخدم لاحقاً لحفظ الحالة على الخادم). */
  snapshot(): {
    phase: Phase;
    roundIndex: number;
    questionIndex: number;
    phaseEndsAt: number;
    answers: AnswerRecord[];
    soloPoints: Record<string, number>;
    teamPoints: Record<string, number>;
    teams: Team[];
  } {
    return {
      phase: this.state.phase,
      roundIndex: this.state.roundIndex,
      questionIndex: this.state.questionIndex,
      phaseEndsAt: this.state.phaseEndsAt,
      answers: this.state.answers.map((answer) => ({ ...answer })),
      soloPoints: { ...this.state.soloPoints },
      teamPoints: { ...this.state.teamPoints },
      teams: this.state.teams.map((team) => ({ ...team, memberIds: [...team.memberIds] })),
    };
  }
}

/** مُنشئ مختصر للاستخدام من الواجهة. */
export function createMatch(setup: MatchSetup): MatchEngine {
  return new MatchEngine(setup);
}