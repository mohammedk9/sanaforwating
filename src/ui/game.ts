/**
 * لوحة الألعاب: فتح اللعبة المختارة وإغلاقها.
 * نفس سلوك الملف الأصلي: أي زر يحمل data-game يفتح اللعبة المناسبة.
 */
import { $, $$ } from './dom.ts';
import { hideRoomBox } from './match.ts';
import { startQuiz, stopQuiz } from '../games/quiz.ts';
import { startRiddle, stopRiddle } from '../games/riddle.ts';
import { startMemory, stopMemory } from '../games/memory.ts';
import { startSanaGameArt, stopSanaGameArt } from '../games/sanaGameArt.ts';

type GameKind = 'quiz' | 'riddle' | 'memory' | 'sanaGameArt';

function stopAll(): void {
  stopQuiz();
  stopRiddle();
  stopMemory();
  stopSanaGameArt();
}

/** فتح لعبة داخل لوحة معينة (الرئيسية أو صفحة سَنا). */
export function openGame(type: string, target: 'home' | 'sana' = 'home'): void {
  stopAll();
  const isSana = type === 'sanaGameArt';
  const panel = isSana ? $('#sanaGamesPanel') : $('#gamePanel');
  const title = isSana ? $('#sanaGamesTitle') : $('#gameTitle');
  const content = isSana ? $('#sanaGamesContent') ?? $('#gameContent') : $('#gameContent');
  if (!panel || !content) return;
  panel.classList.add('open');
  // تأكد أن الصفحة المنفصلة ظاهرة
  if (isSana) {
    $('#sanaGamesView')?.classList.remove('hidden');
    $('#homeView')?.classList.add('hidden');
    $('#menuView')?.classList.add('hidden');
  }
  if (target === 'home') hideRoomBox();

  if (type === 'quiz') {
    if (title) title.textContent = 'تحدي المعرفة';
    startQuiz();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (type === 'riddle') {
    if (title) title.textContent = 'لغز سريع';
    startRiddle();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (type === 'sanaGameArt') {
    if (title) title.textContent = 'ألعاب سَنا';
    // دخول مباشر من الصفحة الرئيسية: ننقل للمشاهدة المنفصلة أولاً
    if (target !== 'sana') {
      $('#sanaGamesView')?.classList.remove('hidden');
      $('#homeView')?.classList.add('hidden');
      $('#menuView')?.classList.add('hidden');
      $('#navSanaGames')?.classList.add('active');
      $('#navOrder')?.classList.remove('active');
    }
    startSanaGameArt();
    return;
  }
  if (title) title.textContent = 'اختبار الذاكرة';
  startMemory();
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** تهيئة أزرار الألعاب. */
export function initGamePanel(): void {
  $$<HTMLButtonElement>('[data-game]').forEach((btn) => {
    const kind = (btn.dataset.game ?? '') as GameKind;
    btn.addEventListener('click', () => openGame(kind, 'home'));
  });

  $('#closeGame')?.addEventListener('click', () => {
    stopAll();
    $('#gamePanel')?.classList.remove('open');
  });

  // زر الإغلاق في صفحة سَنا المنفصلة
  $('#closeSanaGames')?.addEventListener('click', () => {
    stopAll();
    $('#sanaGamesPanel')?.classList.remove('open');
  });
}
