/**
 * «تحدي المعرفة» — الأسئلة ولوحة اللعب.
 *
 * الوضع الحالي (الخطوة 1): اللعبة محلية بالكامل — نفس سلوك الملف الأصلي حرفياً
 * (مؤقت 15 ثانية لكل سؤال ونقاط تُحسب في المتصفح).
 *
 * ⚠️ الخطوة 2: تنتقل الأسئلة والوقت واحتساب النقاط إلى محرك المباراة في src/core،
 *    ويصبح الخادم هو من يحتسب نقاط السرعة من وقت وصول الإجابة.
 *    لذلك أُبقيت الصيغة الحالية كما هي هنا بدون «تحسين» مؤقت، حتى نبقي التغيير
 *    معزولاً ومقروءاً في خطوة واحدة قابلة للمقارنة والاختبار.
 */
import { $, $$ } from '../ui/dom.ts';

export interface Question {
  /** نص السؤال */
  q: string;
  /** الخيارات الأربعة */
  a: string[];
  /** فهرس الإجابة الصحيحة */
  c: number;
  /** شرح مختصر يظهر بعد الكشف */
  ex: string;
}

export const questions: Question[] = [
  {
    q: 'كم عدد كواكب المجموعة الشمسية؟',
    a: ['7 كواكب', '8 كواكب', '9 كواكب', '10 كواكب'],
    c: 1,
    ex: 'عدد الكواكب المعترف بها في المجموعة الشمسية هو ثمانية.',
  },
  {
    q: 'ما أكبر محيط على الأرض؟',
    a: ['الأطلسي', 'الهندي', 'الهادئ', 'المتجمد الشمالي'],
    c: 2,
    ex: 'المحيط الهادئ هو الأكبر مساحة.',
  },
  {
    q: 'ما الغاز الذي تمتصه النباتات من الهواء؟',
    a: ['الأكسجين', 'ثاني أكسيد الكربون', 'النيتروجين', 'الهيدروجين'],
    c: 1,
    ex: 'تستخدم النباتات ثاني أكسيد الكربون في البناء الضوئي.',
  },
];

const SECONDS_PER_QUESTION = 15;

let index = 0;
let score = 0;
let locked = false;
let timeLeft = SECONDS_PER_QUESTION;
let timer: number | undefined;

/** يبدأ التحدي من السؤال الأول. */
export function startQuiz(): void {
  index = 0;
  score = 0;
  renderQuestion();
}

/** يوقف المؤقت (يُستدعى عند إغلاق لوحة اللعب). */
export function stopQuiz(): void {
  window.clearInterval(timer);
  timer = undefined;
}

function renderQuestion(): void {
  stopQuiz();
  locked = false;
  timeLeft = SECONDS_PER_QUESTION;

  const q = questions[index];
  const title = $('#gameTitle');
  const content = $('#gameContent');
  if (title) title.textContent = 'تحدي المعرفة';
  if (!content) return;

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;color:#8c7f73;font-size:10px">
      <span>السؤال ${index + 1} من ${questions.length}</span>
      <span>نقاطك: ${score}</span>
    </div>
    <div class="timer-row">
      <span class="timer" id="timerNum">${SECONDS_PER_QUESTION}</span>
      <div class="timer-track"><div class="timer-fill" id="timerFill"></div></div>
    </div>
    <div class="question">${q.q}</div>
    <div class="answers">
      ${q.a.map((choice, i) => `<button class="answer" data-answer="${i}">${choice}</button>`).join('')}
    </div>
    <div class="game-feedback" id="feedback"></div>
    <div class="game-actions">
      <small>أجب بسرعة لتحصل على نقاط أكثر.</small>
      <button class="btn light" id="nextQuestion" style="display:none">التالي ←</button>
    </div>`;

  $$<HTMLButtonElement>('[data-answer]').forEach((btn) => {
    btn.addEventListener('click', () => answerQuestion(Number(btn.dataset.answer)));
  });

  timer = window.setInterval(() => {
    timeLeft -= 1;
    const num = $('#timerNum');
    const fill = $('#timerFill') as HTMLElement | null;
    if (num) num.textContent = String(timeLeft);
    if (fill) fill.style.width = `${(timeLeft / SECONDS_PER_QUESTION) * 100}%`;
    if (timeLeft <= 0) {
      stopQuiz();
      if (!locked) {
        locked = true;
        revealQuestion(-1);
      }
    }
  }, 1000);
}

function answerQuestion(choice: number): void {
  if (locked) return;
  locked = true;
  stopQuiz();

  const q = questions[index];
  if (choice === q.c) {
    // صيغة النسخة الحالية (محلية). في الخطوة 2 تُستبدل بصيغة SANA المعتمدة:
    // 100 نقطة + حتى 100 نقطة سرعة، بحسب وصول الإجابة إلى الخادم.
    score += Math.max(100, Math.round(100 + (50 * timeLeft) / SECONDS_PER_QUESTION));
  }
  revealQuestion(choice);
}

function revealQuestion(choice: number): void {
  const q = questions[index];

  $$<HTMLButtonElement>('[data-answer]').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.c) btn.classList.add('correct');
    else if (i === choice) btn.classList.add('wrong');
  });

  const feedback = $('#feedback');
  if (feedback) {
    const verdict =
      choice === q.c ? 'إجابة صحيحة! ' : choice === -1 ? 'انتهى الوقت. ' : 'إجابة غير صحيحة. ';
    feedback.textContent = verdict + q.ex + ' · مجموعك ' + score + ' نقطة';
  }

  const next = $<HTMLButtonElement>('#nextQuestion');
  if (!next) return;
  next.style.display = 'inline-block';
  next.textContent = index === questions.length - 1 ? 'عرض النتيجة' : 'السؤال التالي';
  next.onclick = () => {
    index += 1;
    if (index < questions.length) {
      renderQuestion();
      return;
    }
    showResult();
  };
}

function showResult(): void {
  const content = $('#gameContent');
  if (!content) return;

  content.innerHTML = `
    <div style="text-align:center;padding:20px">
      <div style="font-size:36px">🏆</div>
      <h3>أحسنت! انتهى التحدي</h3>
      <div style="font-size:30px;font-weight:700;color:#52765b">${score} نقطة</div>
      <p style="font-size:11px;color:#8c8178">نتيجة تجريبية محلية لا تدخل في ترتيب رسمي.</p>
      <button class="btn" id="replay">العب مرة أخرى</button>
    </div>`;

  $('#replay')?.addEventListener('click', () => startQuiz());
}
