/**
 * «لغز سريع» — لعبة خفيفة مستقلة.
 * لا تدخل في احتساب نقاط المباراة التنافسية، وتبقى كما هي في الملف الأصلي.
 */
import { $ } from '../ui/dom.ts';
import { recordCasualScore } from '../net/scores.ts';

export function startRiddle(): void {
  const title = $('#gameTitle');
  const content = $('#gameContent');
  if (title) title.textContent = 'لغز سريع';
  if (!content) return;

  content.innerHTML = `
    <div style="font-size:10px;color:#9a8878">فكر قبل أن تجيب</div>
    <div class="question">شيء كلما أخذت منه كبر، ما هو؟</div>
    <div class="field"><input id="riddleAnswer" placeholder="اكتب إجابتك هنا"></div>
    <div class="game-feedback" id="riddleFeedback"></div>
    <div class="game-actions">
      <small>تلميح: قد تجده في الأرض.</small>
      <button class="btn" id="checkRiddle">تحقق من الإجابة</button>
    </div>`;

  $('#checkRiddle')?.addEventListener('click', () => {
    const value = ($<HTMLInputElement>('#riddleAnswer')?.value ?? '').trim();
    const feedback = $('#riddleFeedback');
    if (!feedback) return;
    feedback.textContent = /الحفر|حفرة|الحفرة/.test(value)
      ? 'صحيح! الإجابة هي الحفرة 🎉'
      : 'حاول مرة أخرى. فكر في شيء يزداد حجماً كلما أخذت منه.';
    if (/الحفر|حفرة|الحفرة/.test(value)) {
      // تسجيل نقاط اللغز (لغز واحد صحيح؛ الخادم يمنح XP)
      void recordCasualScore('riddle', 10);
      const btn = $<HTMLButtonElement>('#checkRiddle');
      if (btn) btn.disabled = true; // منع تكرار النقاط على نفس اللغز
    }
  });
}

export function stopRiddle(): void {
  // اللعبة بلا مؤقّتات أو طلبات — التنظيف يحدث عند تبديل المحتوى.
}
