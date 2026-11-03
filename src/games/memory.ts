/**
 * «اختبار الذاكرة» — لعبة خفيفة مستقلة (بلا مؤقت وبلا نقاط).
 * السلوك مطابق للملف الأصلي، مع الإبقاء على صف واحد من الأزواج كقيمة ثابتة.
 */
import { $, $$ } from '../ui/dom.ts';

const ICONS = ['☕', '✦', '☕', '✿', '✦', '✿'];
const TOTAL_PAIRS = 3;

export function startMemory(): void {
  const order = [...ICONS].sort(() => Math.random() - 0.5);
  let opened: HTMLButtonElement[] = [];
  let matched = 0;

  const title = $('#gameTitle');
  const content = $('#gameContent');
  if (title) title.textContent = 'اختبار الذاكرة';
  if (!content) return;

  content.innerHTML = `
    <p style="font-size:11px;color:#8c8178;margin-top:0">اكشف البطاقات واعثر على الأزواج المتشابهة.</p>
    <div id="memoryGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px">
      ${order
        .map(
          (_icon, i) =>
            `<button data-card="${i}" style="height:66px;border:1px solid #e9e0d5;border-radius:14px;background:#f1e9de;font-size:23px;color:transparent">?</button>`,
        )
        .join('')}
    </div>
    <div class="game-feedback" id="memoryFeedback">الأزواج المكتشفة: 0 / ${TOTAL_PAIRS}</div>`;

  $$<HTMLButtonElement>('[data-card]').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.dataset.done || opened.length === 2 || card.dataset.open) return;

      const cardIndex = Number(card.dataset.card);
      card.textContent = order[cardIndex];
      card.style.color = '#3a261d';
      card.style.background = '#fffdfa';
      card.dataset.open = '1';
      opened.push(card);

      if (opened.length < 2) return;

      const [first, second] = opened;

      if (order[Number(first.dataset.card)] === order[Number(second.dataset.card)]) {
        for (const open of opened) {
          open.dataset.done = '1';
          open.style.background = '#e7f0e6';
        }
        matched += 1;
        const feedback = $('#memoryFeedback');
        opened = [];
        if (feedback) feedback.textContent = `الأزواج المكتشفة: ${matched} / ${TOTAL_PAIRS}`;
        if (matched === TOTAL_PAIRS && feedback) feedback.textContent = 'رائع! أكملت التحدي 🎉';
        return;
      }

      const pair = [...opened];
      opened = [];
      window.setTimeout(() => {
        for (const open of pair) {
          open.textContent = '?';
          open.style.color = 'transparent';
          open.style.background = '#f1e9de';
          delete open.dataset.open;
        }
      }, 700);
    });
  });
}
