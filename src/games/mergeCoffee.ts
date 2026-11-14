/**
 * «ادمج القهوة» — لعبة دمج (2048) مستقلة داخل ألعاب سَنا (تبويب خامس).
 * محوّلة من نسخة HTML الأصلية إلى لغة التطبيق الحالية:
 * شبكة ٤×٤، دمج القطع المتشابهة، أفضل نتيجة في localStorage.
 */
import { $ } from '../ui/dom.ts';
import { BONUS_LINE_1, BONUS_LINE_2 } from './baristaRush.ts';

const AR = (n: number): string => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

const store = {
  get(k: string): number { try { const v = localStorage.getItem(k); return v ? +v : 0; } catch { return 0; } },
  set(k: string, v: number): void { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } },
};

let mute = false;
let AC: AudioContext | null = null;
function snd(f: number, d = 0.09, t: OscillatorType = 'sine', v = 0.05): void {
  if (mute) return;
  try {
    AC = AC || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = AC.createOscillator();
    const g = AC.createGain();
    const n = AC.currentTime;
    o.type = t;
    o.frequency.value = f;
    g.gain.setValueAtTime(v, n);
    g.gain.exponentialRampToValueAtTime(0.001, n + d);
    o.connect(g);
    g.connect(AC.destination);
    o.start();
    o.stop(n + d);
  } catch { /* ignore */ }
}

const LP = 'M16,0H72Q88,0 88,16V140A21,21 0 0 0 130,140V16Q130,0 146,0H200Q216,0 216,16V140A22,22 0 0 0 260,140V16Q260,0 276,0H331Q347,0 347,16V222Q347,244 325,244H22Q0,244 0,222V16Q0,0 16,0Z';
const LG = '<svg viewBox="0 0 347 244" width="62%" fill="#F3E6D3"><path d="' + LP + '"/></svg>';
const NM = ['حبّة', 'مطحون', 'إسبريسو', 'أمريكانو', 'ماكياتو', 'لاتيه', 'كابتشينو', 'V60', 'تركية', 'سنا'];

const STYLE_ID = 'merge-coffee-style';
export function injectMergeCoffeeStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .merge-coffee .mc-hud{display:flex;justify-content:space-between;align-items:center;gap:8px;max-width:340px;margin:0 auto 10px;font-weight:700;font-size:14px}
    .merge-coffee .mc-nw{font:inherit;font-weight:700;font-size:13px;padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
    .merge-coffee .mc-board{position:relative;width:100%;max-width:340px;aspect-ratio:1;margin:0 auto;background:var(--line);border-radius:14px;touch-action:none;user-select:none}
    .merge-coffee .mc-cell,.merge-coffee .mc-tile{position:absolute;width:calc(25% - 8px);height:calc(25% - 8px);border-radius:10px}
    .merge-coffee .mc-cell{background:rgba(0,0,0,.08)}
    .merge-coffee .mc-tile{display:flex;align-items:center;justify-content:center;font-weight:900;font-size:clamp(11px,3.7vw,15px);text-align:center;line-height:1.15;transition:left .12s,top .12s;z-index:1}
    .merge-coffee .mc-tile.n{animation:mcpop .18s}
    .merge-coffee .mc-tile.g{animation:mcgrow .2s}
    @keyframes mcpop{from{transform:scale(.4)}}
    @keyframes mcgrow{50%{transform:scale(1.18)}}
    .merge-coffee .mc-hint{text-align:center;color:var(--muted);font-size:14px;margin:10px 0 0}
    .merge-coffee .mc-res{margin:12px auto 0;max-width:340px;text-align:center;border:1px dashed var(--accent,#301A14);border-radius:14px;padding:12px;line-height:1.7}
    .merge-coffee .mc-mu{display:block;margin:10px auto 0;font:inherit;padding:7px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
    @media (prefers-reduced-motion:reduce){.merge-coffee .mc-tile{transition:none}.merge-coffee .mc-tile.n,.merge-coffee .mc-tile.g{animation:none}}
  `;
  document.head.append(style);
}

interface Tile { r: number; c: number; v: number; el: HTMLDivElement; m?: number }

const KEYMAP: Record<string, number> = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3 };

let abort: AbortController | null = null;
let running = false;

/** نقطة الدخول: تُستدعى عند فتح تبويب «ادمج القهوة». */
export function startMergeCoffee(box: HTMLElement, signal?: AbortSignal): void {
  stopMergeCoffee();
  injectMergeCoffeeStyles();
  const ac = new AbortController();
  abort = ac;
  // نستخدم متحكماً خاصاً بنا حتى تُنظَّف المستمعات عند إيقاف اللعبة (تبديل التبويب)،
  // ونربطه بإشارة الأب إن وُجدت حتى لا تبقى اللعبة تعمل بعد إغلاق اللوحة.
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener('abort', () => ac.abort(), { once: true });
  }
  const sig = ac.signal;

  box.innerHTML = `<div class="merge-coffee">
    <div class="mc-hud">
      <span id="mcS">النقاط: ٠</span>
      <span id="mcB">الأفضل: ٠</span>
      <button class="mc-nw" id="mcNw" type="button">لعبة جديدة</button>
    </div>
    <div id="mcBoard" class="mc-board" aria-label="لوحة دمج القهوة"></div>
    <div id="mcMsg" class="mc-res" hidden></div>
    <p class="mc-hint">اسحب بإصبعك لتحريك كل القطع. القطعتان المتشابهتان تندمجان في مشروب أرقى. الهدف: شعار سنا.</p>
    <button id="mcMu" class="mc-mu" type="button" aria-label="الصوت">🔊 الصوت</button>
  </div>`;

  const board = $<HTMLDivElement>('#mcBoard');
  const msg = $<HTMLDivElement>('#mcMsg');
  const scoreEl = $<HTMLElement>('#mcS');
  const bestEl = $<HTMLElement>('#mcB');
  if (!board || !msg || !scoreEl || !bestEl) return;

  for (let i = 0; i < 16; i++) {
    const cell = document.createElement('div');
    cell.className = 'mc-cell';
    cell.style.left = 'calc(' + (i % 4) * 25 + '% + 4px)';
    cell.style.top = 'calc(' + (i >> 2) * 25 + '% + 4px)';
    board.append(cell);
  }

  let grid: Array<Array<Tile | null>> = [];
  let score = 0;
  let won = false;
  let dead = false;

  const paint = (t: Tile): void => {
    const l = t.v;
    t.el.style.background = l === 9 ? '#1B120E' : 'hsl(30,' + (35 + l * 3) + '%,' + (84 - l * 6.2) + '%)';
    t.el.style.color = l < 4 ? '#301A14' : '#FFF4E0';
    t.el.innerHTML = l === 9 ? LG : NM[l];
  };

  const place = (t: Tile): void => {
    t.el.style.left = 'calc(' + t.c * 25 + '% + 4px)';
    t.el.style.top = 'calc(' + t.r * 25 + '% + 4px)';
  };

  const add = (): void => {
    const empty: Array<[number, number]> = [];
    grid.forEach((row, r) => row.forEach((x, c) => { if (!x) empty.push([r, c]); }));
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const el = document.createElement('div');
    el.className = 'mc-tile n';
    const tile: Tile = { r, c, v: Math.random() < 0.85 ? 0 : 1, el };
    paint(tile);
    place(tile);
    board.append(el);
    grid[r][c] = tile;
  };

  const hud = (): void => {
    if (score > store.get('sana_merge')) store.set('sana_merge', score);
    scoreEl.textContent = 'النقاط: ' + AR(score);
    bestEl.textContent = 'الأفضل: ' + AR(store.get('sana_merge'));
  };

  const canMove = (): boolean => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const t = grid[r][c];
        if (!t) return true;
        if (c < 3 && grid[r][c + 1] && grid[r][c + 1]!.v === t.v) return true;
        if (r < 3 && grid[r + 1][c] && grid[r + 1][c]!.v === t.v) return true;
      }
    }
    return false;
  };

  const reset = (): void => {
    board.querySelectorAll('.mc-tile').forEach((x) => x.remove());
    grid = [0, 1, 2, 3].map(() => [null, null, null, null]);
    score = 0;
    won = false;
    dead = false;
    msg.hidden = true;
    msg.innerHTML = '';
    add();
    add();
    hud();
  };

  const mv = (d: number): void => {
    if (!running || dead) return;
    let moved = false;
    const mg: Array<[Tile, Tile]> = [];
    for (let i = 0; i < 4; i++) {
      const cells: Array<[number, number]> = [0, 1, 2, 3].map((k) =>
        d < 2 ? [i, d ? 3 - k : k] : [d === 2 ? k : 3 - k, i],
      );
      const out: Tile[] = [];
      cells
        .map(([r, c]) => grid[r][c])
        .filter((t): t is Tile => Boolean(t))
        .forEach((t) => {
          const a = out[out.length - 1];
          // أعلى مستوى (٩ = شعار سنا) لا ينصهر في شيء، لذا يبقى كقطعة عادية.
          if (a && a.v === t.v && !a.m && a.v < 9) {
            a.v++;
            a.m = 1;
            mg.push([t, a]);
            score += 2 ** (a.v + 1);
          } else out.push(t);
        });
      cells.forEach(([r, c], k) => {
        const t = out[k];
        grid[r][c] = t ?? null;
        if (t) {
          if (t.r !== r || t.c !== c) moved = true;
          t.r = r;
          t.c = c;
          place(t);
        }
      });
    }
    if (mg.length) moved = true;
    mg.forEach(([t, a]) => {
      t.el.style.zIndex = '0';
      t.r = a.r;
      t.c = a.c;
      place(t);
      window.setTimeout(() => t.el.remove(), 130);
      a.m = 0;
      paint(a);
      a.el.classList.remove('g', 'n');
      void a.el.offsetWidth;
      a.el.classList.add('g');
      snd(300 + a.v * 60, 0.1, 'triangle');
      if (a.v === 9 && !won) {
        won = true;
        msg.innerHTML = '🏆 <strong>وصلت إلى شعار سنا!</strong><br>' + BONUS_LINE_1 + '<br>' + BONUS_LINE_2 + '<br><small>تابع اللعب لرفع نقاطك</small>';
        msg.hidden = false;
      }
    });
    if (!moved) return;
    add();
    hud();
    if (!canMove()) {
      dead = true;
      msg.innerHTML = 'انتهت الحركات، نقاطك ' + AR(score) + (won ? '' : '<br>الهدف: ادمج حتى تصل إلى شعار سنا');
      msg.hidden = false;
    }
  };

  let sx = 0;
  let sy = 0;
  board.addEventListener('pointerdown', (e) => {
    sx = e.clientX;
    sy = e.clientY;
  }, { signal: sig });
  board.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    mv(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 0) : (dy > 0 ? 3 : 2));
  }, { signal: sig });

  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.key];
    if (k === undefined) return;
    e.preventDefault();
    mv(k);
  }, { signal: sig });

  $<HTMLButtonElement>('#mcNw')?.addEventListener('click', reset, { signal: sig });
  $<HTMLButtonElement>('#mcMu')?.addEventListener('click', (e) => {
    mute = !mute;
    const b = e.currentTarget as HTMLButtonElement | null;
    if (b) b.textContent = mute ? '🔇 الصوت' : '🔊 الصوت';
  }, { signal: sig });

  running = true;
  reset();
}

/** ينظّف اللعبة عند إغلاق التبويب أو تبديله. */
export function stopMergeCoffee(): void {
  running = false;
  abort?.abort();
  abort = null;
}