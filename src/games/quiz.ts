/**
 * «تحدي المعرفة» — واجهة Pass & Play فوق محرك المباراة.
 *
 * الرحلة: لوبي (1–8 أسماء) ← تعريف الجولة ← سؤال ← كشف ← ملخص ← نتيجة ← إعادة.
 * يستخدم المحرك مباشرة، ولا يحتوي أي احتساب نقاط أو وقت محلي:
 * النقاط من core/scoring.ts، والوقت من phaseEndsAt في core/engine.ts.
 */
import { $, $$ } from '../ui/dom.ts';
import { toast } from '../ui/dom.ts';
import { createMatch, type MatchEngine, type QuestionView } from '../core/engine.ts';
import { buildMatchPlan, pickRoundQuestions, type Question } from '../core/matchPlan.ts';
import { checkPlayerCount, MAX_PLAYERS, MIN_PLAYERS, normalizePlayerNames } from '../core/players.ts';

export const questions: Question[] = [
  { q: 'كم عدد كواكب المجموعة الشمسية؟', a: ['7 كواكب', '8 كواكب', '9 كواكب', '10 كواكب'], c: 1, ex: 'عدد الكواكب المعترف بها ثمانية.', mode: 'solo' },
  { q: 'ما أكبر محيط على الأرض؟', a: ['الأطلسي', 'الهندي', 'الهادئ', 'المتجمد الشمالي'], c: 2, ex: 'المحيط الهادئ هو الأكبر مساحة.', mode: 'solo' },
  { q: 'ما الغاز الذي تمتصه النباتات من الهواء؟', a: ['الأكسجين', 'ثاني أكسيد الكربون', 'النيتروجين', 'الهيدروجين'], c: 1, ex: 'تستخدم النباتات ثاني أكسيد الكربون في البناء الضوئي.', mode: 'solo' },
  { q: 'ما الوحدة المستخدمة لقياس شدة التيار الكهربائي؟', a: ['الفولت', 'الأمبير', 'الواط', 'الأوم'], c: 1, ex: 'شدة التيار تُقاس بالأمبير.', mode: 'solo' },
  { q: 'في أي قارة تقع مصر؟', a: ['آسيا', 'أوروبا', 'أفريقيا', 'أمريكا الجنوبية'], c: 2, ex: 'تقع مصر في قارة أفريقيا.', mode: 'solo' },
  { q: 'ما أكبر عضو في جسم الإنسان؟', a: ['الجلد', 'الكبد', 'الدماغ', 'الرئتان'], c: 0, ex: 'الجلد هو أكبر الأعضاء مساحةً ووزناً.', mode: 'team' },
  { q: 'كم عدد حروف اللغة العربية؟', a: ['26 حرفاً', '27 حرفاً', '28 حرفاً', '29 حرفاً'], c: 2, ex: 'عدد حروفها ثمانية وعشرون.', mode: 'team' },
  { q: 'ما اللون الناتج عن خلط الأزرق مع الأصفر؟', a: ['البرتقالي', 'الأخضر', 'البنفسجي', 'البني'], c: 1, ex: 'خلط الأزرق مع الأصفر يعطي الأخضر.', mode: 'team' },
  { q: 'كم عدد أيام السنة الكبيسة؟', a: ['364 يوماً', '365 يوماً', '366 يوماً', '367 يوماً'], c: 2, ex: 'السنة الكبيسة 366 يوماً.', mode: 'team' },
];

/** أسماء مقترحة تظهر في اللوبي كنموذج سريع. */
const nameHints = ['لينا', 'نورة', 'أحمد', 'بدر', 'سلمى', 'دانة', 'خالد', 'جود'];
let engine: MatchEngine | null = null;
let ticker: number | undefined;
let lastKey = '';
/** آخر لاعب أرسل إجابة (يُستخدم لإبراز اختياره في مرحلة الكشف). */
let lastSubmitterId: string | undefined;

/** يفتح اللوبي ويصفّر أي مباراة سابقة. */
export function startQuiz(): void {
  stopQuiz();
  const title = $('#gameTitle');
  if (title) title.textContent = 'تحدي المعرفة';
  renderLobby();
}

/** ينظّف كل شيء عند إغلاق اللوحة. */
export function stopQuiz(): void {
  window.clearInterval(ticker);
  ticker = undefined;
  engine = null;
  lastKey = '';
}

/** يقرأ عدد اللاعبين المطلوب من اللوبي ويبدأ المباراة. */
function beginMatch(playerCount: number, names: string[] = []): void {
  const check = checkPlayerCount(playerCount);
  if (!check.ok) {
    toast(check.message ?? 'عدد اللاعبين غير صالح');
    return;
  }

  const count = Math.min(Math.max(playerCount, MIN_PLAYERS), MAX_PLAYERS);
  const picked = normalizePlayerNames(names);
  const players = Array.from({ length: count }, (_unused, i) => ({
    id: `p${i + 1}`,
    name: picked[i] ?? (i === 0 ? 'أنت' : `لاعب ${i + 1}`),
  }));
  const plan = buildMatchPlan(count);
  const usedIds: number[] = [];
  const questionsByRound = plan.rounds.map((round) => {
    const picked = pickRoundQuestions(questions, round.mode, round.questionCount, usedIds);
    usedIds.push(...picked.usedIds);
    return picked.questions;
  });

  engine = createMatch({ players, plan, questionsByRound });
  engine.start();
  lastKey = '';
  sync();
  ticker = window.setInterval(() => {
    if (!engine) return;
    engine.tick();
    sync();
  }, 200);
}

/** يقرأ الأسماء المكتوبة في اللوبي (1–8). */
function readLobbyNames(): string[] {
  const inputs = $$<HTMLInputElement>('[data-player-name]');
  return normalizePlayerNames(inputs.map((input) => input.value || input.placeholder || ''));
}


/** لوبي: عدد اللاعبين (1–8) وأسماؤهم مع تحقّق فوري من الحدود. */
function renderLobby(): void {
  const content = $('#gameContent');
  if (!content) return;

  content.innerHTML = `
    <p style="font-size:11px;color:#8c8178;margin-top:0">
      لاعب واحد يلعب لوحده، وحتى ${MAX_PLAYERS} لاعبين على نفس الهاتف بالتناوب.
    </p>
    <div class="field" style="margin-bottom:12px">
      <label for="playerCount">عدد اللاعبين (${MIN_PLAYERS}–${MAX_PLAYERS})</label>
      <input id="playerCount" type="number" min="${MIN_PLAYERS}" max="${MAX_PLAYERS}" step="1" value="2">
    </div>
    <div id="nameFields" style="display:grid;gap:8px"></div>
    <div class="game-feedback" id="lobbyHint" style="color:#8c8178;font-weight:600"></div>
    <div class="game-actions">
      <small>الوقت والنقاط يُحسبان من المحرك لا من ساعة الهاتف.</small>
      <button class="btn" id="startMatch">ابدأ المباراة</button>
    </div>`;

  const countInput = $<HTMLInputElement>('#playerCount');
  const nameFields = $('#nameFields');
  const hint = $<HTMLElement>('#lobbyHint');

  /** يبني حقول الأسماء حسب العدد المختار (بحد أقصى 8). */
  const renderNames = () => {
    if (!nameFields) return;
    const raw = Number(countInput?.value ?? '0');
    const count = Math.min(Math.max(raw, MIN_PLAYERS), MAX_PLAYERS);
    nameFields.innerHTML = Array.from({ length: count }, (_unused, i) => {
      const value = i === 0 ? 'أنت' : (nameHints[i - 1] ?? `لاعب ${i + 1}`);
      return `<input data-player-name type="text" maxlength="14" value="${value}"
        aria-label="اسم اللاعب ${i + 1}"
        style="border:1px solid #e9e0d5;background:#fffefa;border-radius:12px;padding:9px 11px;font:inherit;font-size:12px">`;
    }).join('');
  };

  const describe = () => {
    const count = Number(countInput?.value ?? '0');
    const check = checkPlayerCount(count);
    renderNames();
    if (!hint) return;
    hint.style.color = check.ok ? '#8c8178' : '#995346';
    hint.textContent = check.ok
      ? count === 1
        ? 'تحدٍّ فردي: جولة واحدة بلا فرق.'
        : `${count} لاعبين: منافسة فردية ← فرق ← مواجهة سريعة.`
      : check.message ?? '';
  };

  countInput?.addEventListener('input', describe);
  describe();

  $('#startMatch')?.addEventListener('click', () => {
    beginMatch(Number(countInput?.value ?? '0'), readLobbyNames());
  });
}

/** يزامن الواجهة مع المحرك. */
function sync(): void {
  if (!engine || !$('#gameContent')) return;

  const phase = engine.phase;
  const view = engine.view();
  const key = `${phase}:${view.roundIndex}:${view.questionNumber}:${view.answers.length}`;
  if (key === lastKey) {
    updateTimer(view);
    return;
  }
  lastKey = key;

  // سؤال جديد ⇒ لا يوجد مُرسِل سابق
  if (phase === 'question_open') lastSubmitterId = undefined;

  if (phase === 'round_intro') renderRoundIntro(engine, view);
  else if (phase === 'question_open' || phase === 'question_reveal') renderQuestion(view);
  else if (phase === 'round_summary') renderRoundSummary(engine, view);
  else if (phase === 'match_end') renderResult(engine);

  updateTimer(view);
}

/** عدّاد يعتمد على وقت الانتهاء المطلق لا على عدّاد محلي. */
function updateTimer(view: QuestionView): void {
  if (!view || view.phase !== 'question_open') return;
  const remaining = Math.max(0, view.endsAt - Date.now());
  const num = $('#timerNum');
  if (num) num.textContent = String(Math.ceil(remaining / 1000));
  const fill = $('#timerFill') as HTMLElement | null;
  const limit = view.endsAt - view.startedAt;
  if (fill && limit > 0) {
    const ratio = Math.max(0, Math.min(1, remaining / limit));
    fill.style.width = `${ratio * 100}%`;
  }
}

/** ترتيب اللاعبين في الملخصات والنتيجة. */
function standingsMarkup(match: MatchEngine): string {
  return match
    .standings()
    .map((row, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed #eee7df">
        <span style="font-size:12px">${medal} ${row.name}</span>
        <strong style="font-size:12px;color:#2a7191">${row.total}</strong>
      </div>`;
    })
    .join('');
}

/** تعريف الجولة: يوضّح النمط القادم وتشكيل الفرق قبل بدء الأسئلة. */
function renderRoundIntro(match: MatchEngine, view: QuestionView): void {
  const content = $('#gameContent');
  if (!content) return;

  const teamsMarkup =
    view.teams.length > 0
      ? `<div style="display:grid;gap:8px;margin-top:12px">${view.teams
          .map(
            (team) => `<div style="border:1px solid #e9e0d5;border-radius:13px;padding:10px 12px;background:#fffdfa">
              <b style="font-size:12px">${team.name}</b>
              <div style="font-size:11px;color:#8c8178">${team.memberIds
                .map((id) => match.playerName(id))
                .join(' · ')}</div>
            </div>`,
          )
          .join('')}</div>`
      : '';

  content.innerHTML = `
    <div style="text-align:center;padding:14px 4px">
      <div style="font-size:10px;color:#9a8878">الجولة ${view.roundIndex}</div>
      <h3 style="margin:6px 0 2px">${view.roundLabel}</h3>
      <p style="font-size:11px;color:#8c8178;margin:0">${view.questionCount} أسئلة</p>
      ${teamsMarkup}
      <div class="game-actions" style="justify-content:center;margin-top:16px">
        <button class="btn" id="beginRound">ابدأ الجولة</button>
      </div>
    </div>`;

  $('#beginRound')?.addEventListener('click', () => {
    if (!engine) return;
    engine.advanceNow();
    lastKey = '';
    sync();
  });
}

/** السؤال: نافذة مشتركة 15 ثانية + شريط دور يوضّح من أجاب ومن التالي. */
function renderQuestion(view: QuestionView): void {
  const content = $('#gameContent');
  if (!content) return;

  const isReveal = view.phase === 'question_reveal';
  const answered = new Set(view.answers.map((answer) => answer.playerId));
  const soloOrder = view.roundMode === 'solo' ? (view.turnOrder ?? []) : [];

  // إجابة من كان يملك الدور: نحتفظ بها لحظة الإرسال (أدق من تخمينها في الكشف)
  const submitterAnswer = isReveal
    ? view.answers.find((answer) => answer.playerId === lastSubmitterId)
    : undefined;

  // شريط الدور: يُظهر لكل لاعب إن كان قد أجاب أو ينتظر دوره.
  // في جولات الفرق يُظهر الفرق بدل الأفراد (لأن الفريق يرسل إجابة واحدة).
  const progressChips =
    view.roundMode === 'teams'
      ? view.teams
          .map((team) => {
            const done = view.answers.some((answer) => answer.teamId === team.id);
            return `<span style="font-size:10px;padding:4px 9px;border-radius:999px;border:1px solid ${
              done ? '#cfe6f2' : '#e9e0d5'
            };background:${done ? '#e9f4f9' : '#fffdfa'};color:${done ? '#2a7191' : '#8b8178'}">
              ${team.name}${done ? ' ✓' : ''}</span>`;
          })
          .join('')
      : soloOrder
          .map((id) => {
            const name = match0PlayerName(id);
            const done = answered.has(id);
            const current = view.submitterId === id;
            const bg = done ? '#e9f4f9' : current ? '#f1e8dc' : '#fffdfa';
            const bd = done ? '#cfe6f2' : current ? '#e2d3c2' : '#e9e0d5';
            const fg = done ? '#2a7191' : current ? '#2e1b15' : '#9b9087';
            return `<span style="font-size:10px;padding:4px 9px;border-radius:999px;border:1px solid ${bd};background:${bg};color:${fg};font-weight:${
              current ? '700' : '500'
            }">${done ? '✓ ' : ''}${name}</span>`;
          })
          .join('');

  const nextLine = isReveal
    ? ''
    : view.submitterName
      ? `<div class="game-feedback" style="margin:8px 0 0;color:#2a7191;font-weight:700">دور ${view.submitterName} الآن</div>`
      : '';

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;color:#8c7f73;font-size:10px">
      <span>الجولة ${view.roundIndex} · السؤال ${view.questionNumber} من ${view.questionCount}</span>
      <span>${view.roundLabel}</span>
    </div>
    ${
      progressChips
        ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:9px">${progressChips}</div>`
        : ''
    }
    ${nextLine}
    <div class="timer-row">
      <span class="timer" id="timerNum">${isReveal ? '—' : view.secondsLeft}</span>
      <div class="timer-track"><div class="timer-fill" id="timerFill" style="width:${
        isReveal ? 0 : 100
      }%"></div></div>
    </div>
    <div class="question">${view.prompt}</div>
    <div class="answers">
      ${view.choices
        .map(
          (choice, i) =>
            `<button class="answer${
              isReveal && i === view.correctIndex
                ? ' correct'
                : isReveal && i === submitterAnswer?.choiceIndex
                  ? ' wrong'
                  : ''
            }" data-answer="${i}" ${isReveal ? 'disabled' : ''}>${choice}</button>`,
        )
        .join('')}
    </div>
    <div class="game-feedback" id="feedback">${isReveal ? revealText(view) : ''}</div>
    <div class="game-actions">
      <small>${
        isReveal
          ? 'النقاط تُحسب بالسرعة.'
          : view.roundMode === 'solo' && soloOrder.length > 1
            ? `أجاب ${answered.size} من ${soloOrder.length} · الوقت مشترك`
            : 'أجب بسرعة لتحصل على نقاط أكثر.'
      }</small>
      ${
        isReveal
          ? `<button class="btn light" id="nextQuestion">${
              view.questionNumber === view.questionCount ? 'ملخص الجولة' : 'السؤال التالي'
            }</button>`
          : ''
      }
    </div>`;

  $$<HTMLButtonElement>('[data-answer]').forEach((button) => {
    button.addEventListener('click', () => handleAnswer(Number(button.dataset.answer)));
  });

  $('#nextQuestion')?.addEventListener('click', () => {
    if (!engine) return;
    engine.advanceNow();
    lastKey = '';
    sync();
  });

  updateTimer(view);
}

/** اسم اللاعب من المحرك الحالي (يستخدمه شريط الدور). */
function match0PlayerName(playerId: string): string {
  return engine?.playerName(playerId) ?? playerId;
}


/** رسالة الكشف: صحيح/خطأ + الشرح + النقاط. */
function revealText(view: QuestionView): string {
  const mine = view.answers.find((answer) => answer.playerId === lastSubmitterId);
  const verdict = !mine ? 'انتهى الوقت.' : mine.correct ? 'إجابة صحيحة!' : 'إجابة غير صحيحة.';
  const points = mine ? ` (+${mine.points} نقطة)` : '';
  const who = mine && view.roundMode === 'solo' ? `${match0PlayerName(mine.playerId)}: ` : '';
  return `${who}${verdict}${points} ${view.explanation ?? ''}`;
}

/** إرسال إجابة من المُرسِل الحالي ثم مزامنة فورية. */
function handleAnswer(choiceIndex: number): void {
  if (!engine) return;
  const view = engine.view();
  if (!view.submitterId) return;

  const result = engine.submitAnswer({ playerId: view.submitterId, choiceIndex });
  if (!result.accepted) {
    if (result.reason === 'duplicate') toast('تم تسجيل الإجابة بالفعل');
    else if (result.reason === 'too-late') toast('انتهى وقت السؤال');
    return;
  }
  lastSubmitterId = view.submitterId;
  lastKey = '';
  sync();
}

/** ملخص الجولة: ترتيب اللاعبين بعد الجولة. */
function renderRoundSummary(match: MatchEngine, view: QuestionView): void {
  const content = $('#gameContent');
  if (!content) return;

  content.innerHTML = `
    <div style="text-align:center;padding:6px 2px 2px">
      <div style="font-size:10px;color:#9a8878">انتهت الجولة ${view.roundIndex}</div>
      <h3 style="margin:6px 0 10px">${view.roundLabel}</h3>
    </div>
    ${standingsMarkup(match)}
    <div class="game-actions" style="justify-content:center;margin-top:14px">
      <button class="btn" id="nextRound">${
        view.roundIndex < match.roundCount ? 'الجولة التالية' : 'عرض النتيجة'
      }</button>
    </div>`;

  $('#nextRound')?.addEventListener('click', () => {
    if (!engine) return;
    engine.advanceNow();
    lastKey = '';
    sync();
  });
}

/** النتيجة النهائية مع زر إعادة المباراة (مقياس المتعة الأساسي). */
function renderResult(match: MatchEngine): void {
  const content = $('#gameContent');
  if (!content) return;

  const top = match.standings()[0];
  content.innerHTML = `
    <div style="text-align:center;padding:10px 2px 0">
      <div style="font-size:34px">🏆</div>
      <h3 style="margin:6px 0 2px">${top ? top.name : 'أنت'} في المقدمة</h3>
      <div style="font-size:28px;font-weight:700;color:#2a7191">${top ? top.total : 0} نقطة</div>
    </div>
    <div style="margin-top:12px">${standingsMarkup(match)}</div>
    <p style="font-size:10px;color:#8c8178;margin:12px 0 0">نتيجة تجريبية محلية لا تدخل في ترتيب رسمي.</p>
    <div class="game-actions" style="justify-content:center;margin-top:14px">
      <button class="btn" id="replay">إعادة المباراة</button>
    </div>`;

  $('#replay')?.addEventListener('click', () => startQuiz());
}
