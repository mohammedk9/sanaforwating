/**
 * أدوات DOM صغيرة مشتركة.
 * في الملف الأصلي كانت الدالة $ و دالة toast معرّفتين مرة واحدة على مستوى الصفحة،
 * وهنا نحفظ ذلك مع تعريفهما في مكان واحد يستورده كل من يحتاجه.
 * أسماء المعرّفات (#id) لم تتغير، لذلك سلوك الواجهة مطابق للملف الأصلي.
 */

/** يعيد أول عنصر مطابق للمحدد، أو null إن لم يوجد. */
export function $<T extends Element = Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/** يعيد كل العناصر المطابقة كمصفوفة عادية. */
export function $$<T extends Element = Element>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

let toastTimer: number | undefined;

/** رسالة قصيرة أسفل الشاشة (نفس مدة النسخة الأصلية: 2.6 ثانية). */
export function toast(message: string): void {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}
