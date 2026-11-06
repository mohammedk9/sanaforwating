/**
 * لوحة الألعاب: فتح اللعبة المختارة وإغلاقها.
 * نفس سلوك الملف الأصلي: أي زر يحمل data-game يفتح اللعبة المناسبة.
 */
import { $, $$ } from './dom.ts';
import { hideRoomBox } from './match.ts';
import { startQuiz, stopQuiz } from '../games/quiz.ts';
import { startRiddle } from '../games/riddle.ts';
import { startMemory } from '../games/memory.ts';
import { startSanaGameArt, stopSanaGameArt } from '../games/sanaGameArt.ts';

function openGame(type: string): void {
  const panel = $('#gamePanel');
  panel?.classList.add('open');
  hideRoomBox();

  if (type === 'quiz') {
    startQuiz();
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (type === 'riddle') {
    startRiddle();
    return;
  }
  if (type === 'sanaGameArt') {
    startSanaGameArt();
    return;
  }
  startMemory();
}

/** تهيئة أزرار الألعاب. تُستدعى مرة واحدة من نقطة الدخول. */
export function initGamePanel(): void {
  $$<HTMLButtonElement>('[data-game]').forEach((btn) => {
    btn.addEventListener('click', () => openGame(btn.dataset.game ?? ''));
  });

  $('#closeGame')?.addEventListener('click', () => {
    stopQuiz();
    stopSanaGameArt();
    $('#gamePanel')?.classList.remove('open');
  });
}
