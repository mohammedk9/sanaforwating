/**
 * غرفة الأصدقاء — نسخة تجريبية للعرض فقط.
 * لا يوجد اتصال حقيقي بين الأجهزة بعد، والرمز ثابت والانضمام محاكاة محلية.
 * في الخطوة 5 يُستبدل هذا الملف بالاتصال الفعلي عبر Supabase
 * (Presence لقائمة المتصلين + Broadcast للأحداث + PostgreSQL لحفظ الحالة).
 */
import { $, toast } from './dom.ts';

/** إظهار صندوق الغرفة. */
export function showRoomBox(): void {
  $('#roomBox')?.classList.add('show');
}

/** إخفاء صندوق الغرفة (يُستدعى عند فتح أي لعبة). */
export function hideRoomBox(): void {
  $('#roomBox')?.classList.remove('show');
}

/** قراءة رمز الغرفة المعروض. */
function roomCode(): string {
  return $('#roomCode')?.textContent ?? '';
}

let joinedDemoPlayers = 0;
const DEMO_NAMES = ['البرق', 'نورة', 'أحمد', 'لاعب القهوة'];

/** تهيئة أزرار الغرفة التجريبية. */
export function initMatchDemo(): void {
  $('#showRoom')?.addEventListener('click', () => {
    const box = $('#roomBox');
    box?.classList.toggle('show');
    box?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $('#copyRoom')?.addEventListener('click', () => {
    const code = roomCode();
    const copied = navigator.clipboard?.writeText(code);
    if (copied) {
      copied
        .then(() => toast('تم نسخ رمز الغرفة'))
        .catch(() => toast('رمز الغرفة: ' + code));
      return;
    }
    toast('رمز الغرفة: ' + code);
  });

  $('#simulateJoin')?.addEventListener('click', () => {
    joinedDemoPlayers += 1;
    const name = DEMO_NAMES[Math.min(joinedDemoPlayers - 1, DEMO_NAMES.length - 1)];
    const players = $('#roomPlayers');
    if (players) players.textContent = `أنت · ${name} انضم إلى الغرفة`;
    toast('انضم لاعب تجريبي');
  });
}
