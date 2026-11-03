/**
 * «تحدي المعرفة» — واجهة اللعب الفردي فوق محرك المباراة (src/core).
 *
 * ما تغيّر عن النسخة الأولى:
 *  - النقاط تأتي من core/scoring.ts: 100 نقطة + حتى 100 للسرعة، والخطأ صفر بلا خصم.
 *  - الوقت يُحسب من وقت انتهاء مطلق (phaseEndsAt) لا من عدّاد محلي متقطع.
 *  - العلامات والأنماط (classes) لم تتغير، فالشكل البصري يبقى كما اعتمدته.
 */
import { $, $$ } from '../ui/dom.ts';
import { createMatch, type MatchEngine, type QuestionView } from '../core/engine.ts';
import { buildMatchPlan, pickRoundQuestions, type Question } from '../core/matchPlan.ts';

const PLAYER_ID = 'you';
const QUESTIONS_PER_MATCH = 3;

/**
 * بنك الأسئلة.
 * mode: 'solo' للجولات الفردية، و'team' لأسئلة جولات الفرق (تُستخدم في الخطوة 3).
 * أول ثلاثة أسئلة فردية هي أسئلة النسخة المعتمدة، فلا يتغير ما يراه اللاعب.
 */
export const questions: Question[] = [
  {
    q: 'كم عدد كواكب المجموعة الشمسية؟',
    a: ['7 كواكب', '8 كواكب', '9 كواكب', '10 كواكب'],
    c: 1,
    ex: 'عدد الكواكب المعترف بها في المجموعة الشمسية هو ثمانية.',
    mode: 'solo',
  },
  {
    q: 'ما أكبر محيط على الأرض؟',
    a: ['الأطلسي', 'الهندي', 'الهادئ', 'المتجمد الشمالي'],
    c: 2,
    ex: 'المحيط الهادئ هو الأكبر مساحة.',
    mode: 'solo',
  },
  {
    q: 'ما الغاز الذي تمتصه النباتات من الهواء؟',
    a: ['الأكسجين', 'ثاني أكسيد الكربون', 'النيتروجين', 'الهيدروجين'],
    c: 1,
    ex: 'تستخدم النباتات ثاني أكسيد الكربون في البناء الضوئي.',
    mode: 'solo',
  },
  {
    q: 'ما الوحدة المستخدمة لقياس شدة التيار الكهربائي؟',
    a: ['الفولت', 'الأمبير', 'الواط', 'الأوم'],
    c: 1,
    ex: 'شدة التيار تُقاس بالأمبير، والفولت للجهد والواط للقدرة.',
    mode: 'solo',
  },
  {
    q: 'في أي قارة تقع مصر؟',
    a: ['آسيا', 'أوروبا', 'أفريقيا', 'أمريكا الجنوبية'],
    c: 2,
    ex: 'تقع مصر في قارة أفريقيا ويطل ساحلها على البحر المتوسط.',
    mode: 'solo',
  },
  {
    q: 'ما أكبر عضو في جسم الإنسان؟',
    a: ['الجلد', 'الكبد', 'الدماغ', 'الرئتان'],
    c: 0,
    ex: 'الجلد هو أكبر أعضاء الجسم مساحةً ووزناً.',
    mode: 'team',
  },
  {
    q: 'كم عدد حروف اللغة العربية؟',
    a: ['26 حرفاً', '27 حرفاً', '28 حرفاً', '29 حرفاً'],
    c: 2,
    ex: 'عدد حروف اللغة العربية ثمانية وعشرون حرفاً.',
    mode: 'team',
  },
  {
    q: 'ما اللون الناتج عن خلط الأزرق مع الأصفر؟',
    a: ['البرتقالي', 'الأخضر', 'البنفسجي', 'البني'],
    c: 1,
    ex: 'خلط الأزرق مع الأصفر يعطي اللون الأخضر.',
    mode: 'team',
  },
];

let engine: MatchEngine | null = null;
let ticker: number | undefined;
let lastRenderKey = '';
let resultShown = false;

/** يبني مباراة فردية قصيرة: جولة واحدة من ثلاثة أسئلة. */
function buildEngine(): MatchEngine {
  const plan = buildMatchPlan(1, {
    soloQuestionCount: QUESTIONS_PER_MATCH,
    finalSoloQuestionCount: 0,
  });
  const round = plan.rounds[0];
  const picked = pickRoundQuestions(questions, 'solo', round.questionCount).questions;

  return createMatch({
    players: [{ id: PLAYER_ID, name: 'أنت' }],
    plan,
    questionsByRound: [picked],
    config: {
      // بلا تعريف جولة ولا ملخص: اللاعب يبدأ السؤال فوراً كما في النسخة السابقة
      roundIntroMs: 0,
      roundSummaryMs: 0,
      revealMs: 5_000,
    },
  });
}

/** يبدأ التحدي من السؤال الأول. */
export function startQuiz(): void {
  stopQuiz();

  const title = $('#gameTitle');
  if (title) title.textContent = 'تحدي المعرفة';

  engine = buildEngine();
  engine.start();
  engine.tick();

  lastRenderKey = '';
  resultShown = false;
  sync();

  ticker = window.setInterval(() => {
    if (!engine) return;
    engine.tick();
    sync();
  }, 250);
}

/** يوقف التحدي (يُستدعى عند إغلاق لوحة اللعب). */
export function stopQuiz(): void {
  window.clearInterval(ticker);
  ticker = undefined;
  engine = null;
}

/** يزامن الواجهة مع المحرك: يرسم عند تغيّر المرحلة، ويحدّث العدّاد دائماً. */
function sync(): void {
  if (!engine) return;
  if (!$('#gameContent')) return;

  if (engine.phase === 'match_end') {
    if (!resultShown) {
      resultShown = true;
      renderResult(engine);
    }
    return;
  }

  if (engine.phase !== 'question_open' && engine.phase !== 'question_reveal') return;

  const view = engine.view();
  const key = `${view.phase}:${view.roundIndex}:${view.questionNumber}`;
  if (key !== lastRenderKey) {
    lastRenderKey = key;
    render(view);
  }
  updateTimer(view);
}

function totalPoints(): number {
  return engine?.standings()[0]?.total ?? 0;
}

function updateTimer(view: QuestionView): void {
  const limit = view.endsAt - view.startedAt;
  const remaining = Math.max(0, view.endsAt - Date.now());

  const num = $('#timerNum');
  if (num) num.textContent = String(Math.ceil(remaining / 1000));

  const fill = $('#timerFill') as HTMLElement | null;
  if (fill && limit > 0) {
    const ratio = Math.max(0, Math.min(1, remaining / limit));
    fill.style.width = `${ratio * 100}%`;
  }
}

/** يختار دالة الرسم المناسبة بحسب المرحلة. */
function render(view: QuestionView): void {
  if (view.phase === 'question_reveal') {
    renderReveal(view);
    return;
  }
  renderOpen(view);
}

/** السؤال مفتوح: نفس علامات النسخة الأصلية بالحرف. */
function renderOpen(view: QuestionView): void {
  const content = $('#gameContent');
  if (!content) return;

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;color:#8c7f73;font-size:10px">
      <span>السؤال ${view.questionNumber} من ${view.questionCount}</span>
      <span>نقاطك: ${totalPoints()}</span>
    </div>
    <div class="timer-row">
      <span class="timer" id="timerNum">${view.secondsLeft}</span>
      <div class="timer-track"><div class="timer-fill" id="timerFill"></div></div>
    </div>
    <div class="question">${view.prompt}</div>
    <div class="answers">
      ${view.choices
        .map((choice, i) => `<button class="answer" data-answer="${i}">${choice}</button>`)
        .join('')}
    </div>
    <div class="game-feedback" id="feedback"></div>
    <div class="game-actions">
      <small>أجب بسرعة لتحصل على نقاط أكثر.</small>
      <button class="btn light" id="nextQuestion" style="display:none">التالي ←</button>
    </div>`;

  $$<HTMLButtonElement>('[data-answer]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!engine) return;
      const choiceIndex = Number(button.dataset.answer);
      // الإجابة المقبولة تنقل المحرك إلى مرحلة الكشف مباشرة،
      // فنزامن فوراً حتى يظهر الكشف بلا انتظار دورة المؤقت.
      engine.submitAnswer({ playerId: PLAYER_ID, choiceIndex });
      sync();
    });
  });
}

/** مرحلة الكشف: تعطيل الأزرار وإظهار الصحيح والشرح وزر المتابعة. */
function renderReveal(view: QuestionView): void {
  const mine = view.answers.find((answer) => answer.playerId === PLAYER_ID);
  const verdict = !mine ? 'انتهى الوقت. ' : mine.correct ? 'إجابة صحيحة! ' : 'إجابة غير صحيحة. ';

  const feedback = $('#feedback');
  if (feedback) {
    feedback.textContent =
      verdict + (view.explanation ?? '') + ' · مجموعك ' + totalPoints() + ' نقطة';
  }

  $$<HTMLButtonElement>('[data-answer]').forEach((button, i) => {
    button.disabled = true;
    if (i === view.correctIndex) button.classList.add('correct');
    else if (i === mine?.choiceIndex) button.classList.add('wrong');
  });

  const next = $<HTMLButtonElement>('#nextQuestion');
  if (!next) return;

  next.style.display = 'inline-block';
  next.textContent = view.questionNumber === view.questionCount ? 'عرض النتيجة' : 'السؤال التالي';
  next.onclick = () => {
    if (!engine) return;
    engine.advanceNow();
    engine.tick();
    sync();
  };
}

/** شاشة النتيجة النهائية. */
function renderResult(match: MatchEngine): void {
  const content = $('#gameContent');
  if (!content) return;

  const points = match.standings()[0]?.total ?? 0;

  content.innerHTML = `
    <div style="text-align:center;padding:20px">
      <div style="font-size:36px">🏆</div>
      <h3>أحسنت! انتهى التحدي</h3>
      <div style="font-size:30px;font-weight:700;color:#52765b">${points} نقطة</div>
      <p style="font-size:11px;color:#8c8178">نتيجة تجريبية محلية لا تدخل في ترتيب رسمي.</p>
      <button class="btn" id="replay">العب مرة أخرى</button>
    </div>`;

  $('#replay')?.addEventListener('click', () => startQuiz());
}
