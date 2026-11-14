/**
 * «برج الأكواب» — لعبة تكديس أكواب مستقلة داخل ألعاب سَنا (تبويب رابع).
 * محوّلة من نسخة HTML الأصلية إلى لغة التطبيق الحالية:
 * canvas واحد + مؤثرات صوتية + أفضل نتيجة في localStorage.
 */
import { $ } from '../ui/dom.ts';
import { BONUS_LINE_1, BONUS_LINE_2 } from './baristaRush.ts';

const AR = (n: number): string => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const GOAL = 25;
const W = 340;
const H = 440;
const BH = 26;
const wy = (i: number): number => 370 - i * BH;

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

const LOGO = new Path2D(
  'M16,0H72Q88,0 88,16V140A21,21 0 0 0 130,140V16Q130,0 146,0H200Q216,0 216,16V140A22,22 0 0 0 260,140V16Q260,0 276,0H331Q347,0 347,16V222Q347,244 325,244H22Q0,244 0,222V16Q0,0 16,0Z',
);

const STYLE_ID = 'cup-tower-style';
export function injectCupTowerStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cup-tower #ctv{display:block;width:100%;max-width:340px;margin:0 auto;aspect-ratio:340/440;border-radius:14px;background:#120B08;touch-action:none}
    .cup-tower .ct-hint{text-align:center;color:var(--muted);font-size:14px;margin:10px 0 0}
    .cup-tower .ct-mu{display:block;margin:10px auto 0;font:inherit;padding:7px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
  `;
  document.head.append(style);
}

interface Block { x: number; w: number }
interface Piece { x: number; w: number; y: number; vy: number; i: number }
interface Pop { t: string; y: number; a: number }
type Line = [string, number, number, string?];

let rafId = 0;
let abort: AbortController | null = null;
let running = false;

/** نقطة الدخول: تُستدعى عند فتح تبويب «برج الأكواب». */
export function startCupTower(box: HTMLElement, signal?: AbortSignal): void {
  stopCupTower();
  injectCupTowerStyles();
  const ac = new AbortController();
  abort = ac;
  // نستخدم متحكماً خاصاً بنا حتى تُنظَّف المستمعات عند إيقاف اللعبة (تبديل التبويب)،
  // ونربطه بإشارة الأب إن وُجدت حتى لا تبقى اللعبة تعمل بعد إغلاق اللوحة.
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener('abort', () => ac.abort(), { once: true });
  }
  const sig = ac.signal;

  box.innerHTML = `<div class="cup-tower">
    <canvas id="ctv" width="340" height="440" aria-label="لعبة تكديس الأكواب"></canvas>
    <p class="ct-hint">المس الشاشة لإسقاط الكوب فوق البرج. كل ما زاد القص صار الكوب أضيق. وإذا طابقته تماماً تحصل على «مثالي» ويكبر كوبك.</p>
    <button id="ctMu" class="ct-mu" aria-label="الصوت">🔊 الصوت</button>
  </div>`;

  const canvas = $<HTMLCanvasElement>('#ctv');
  if (!canvas) return;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const tx = canvas.getContext('2d');
  if (!tx) return;
  tx.scale(dpr, dpr);

  let blocks: Block[] = [];
  let cur = { x: 0, w: 0, d: 1 };
  let pieces: Piece[] = [];
  let pops: Pop[] = [];
  let score = 0;
  let cam = 0;
  let perf = 0;
  let best = store.get('sana_cups');
  let over = true;
  let started = false;
  let prev = 0;

  const rr = (x: number, y: number, w: number, h: number, r: number, c: string): void => {
    tx.fillStyle = c;
    tx.beginPath();
    tx.roundRect(x, y, w, h, r);
    tx.fill();
  };

  const blk = (x: number, y: number, w: number, i: number): void => {
    rr(x, y, w, BH - 3, 7, 'hsl(' + (18 + (i * 6) % 46) + ',42%,' + (28 + (i * 5) % 22) + '%)');
    rr(x + 4, y + 3, w - 8, 4, 2, 'rgba(255,255,255,.2)');
    if (w > 44) {
      tx.save();
      tx.translate(x + w / 2 - 9, y + 7);
      tx.scale(0.052, 0.052);
      tx.globalAlpha = 0.55;
      tx.fillStyle = '#F3E6D3';
      tx.fill(LOGO);
      tx.restore();
    }
  };

  const next = (): void => { cur = { x: 0, w: blocks[blocks.length - 1].w, d: 1 }; };

  const reset = (): void => {
    blocks = [{ x: 85, w: 170 }];
    score = 0;
    cam = 0;
    pieces = [];
    pops = [];
    over = false;
    perf = 0;
    next();
  };

  const drop = (): void => {
    if (!started) { started = true; reset(); return; }
    if (over) { reset(); return; }
    const t = blocks[blocks.length - 1];
    const l = Math.max(cur.x, t.x);
    const r = Math.min(cur.x + cur.w, t.x + t.w);
    const ov = r - l;
    const y = wy(blocks.length);
    const i = blocks.length;
    if (ov <= 0) {
      pieces.push({ x: cur.x, w: cur.w, y, vy: 0, i });
      over = true;
      snd(150, 0.4, 'sawtooth', 0.05);
      store.set('sana_cups', best);
      return;
    }
    if (Math.abs(cur.x - t.x) < 5) {
      perf++;
      const g = perf >= 2 && t.w <= 164;
      blocks.push({ x: g ? t.x - 3 : t.x, w: g ? t.w + 6 : t.w });
      pops.push({ t: perf > 1 ? 'مثالي ×' + AR(perf) : 'مثالي!', y, a: 1 });
      snd(480 + Math.min(perf, 8) * 70, 0.12, 'triangle');
    } else {
      perf = 0;
      if (cur.x < t.x) pieces.push({ x: cur.x, w: t.x - cur.x, y, vy: 0, i });
      else pieces.push({ x: t.x + t.w, w: cur.x + cur.w - t.x - t.w, y, vy: 0, i });
      blocks.push({ x: l, w: ov });
      snd(300, 0.08, 'triangle');
    }
    score++;
    if (score > best) best = score;
    next();
  };

  const loop = (now: number): void => {
    if (!running) return;
    const dt = Math.min((now - (prev || now)) / 1000, 0.05);
    prev = now;
    const h = Math.min(score, 60);
    const grad = tx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'hsl(' + (24 + h * 2) + ',38%,' + (12 + h * 0.3) + '%)');
    grad.addColorStop(1, '#120B08');
    tx.fillStyle = grad;
    tx.fillRect(0, 0, W, H);

    if (started && !over) {
      const sp = Math.min(140 + score * 5, 380);
      cur.x += cur.d * sp * dt;
      if (cur.x <= 0) { cur.x = 0; cur.d = 1; }
      if (cur.x + cur.w >= W) { cur.x = W - cur.w; cur.d = -1; }
    }
    cam += (Math.max(0, (blocks.length - 6) * BH) - cam) * Math.min(1, dt * 6);
    blocks.forEach((b, i) => blk(b.x, wy(i) + cam, b.w, i));
    if (started && !over) blk(cur.x, wy(blocks.length) + cam, cur.w, blocks.length);
    for (const p of pieces) {
      p.vy += 900 * dt;
      p.y += p.vy * dt;
      blk(p.x, p.y + cam, p.w, p.i);
    }
    pieces = pieces.filter((p) => p.y + cam < 470);

    tx.textAlign = 'center';
    for (const p of pops) {
      p.y -= 30 * dt;
      p.a -= dt * 1.2;
      tx.globalAlpha = Math.max(p.a, 0);
      tx.fillStyle = '#FFC83D';
      tx.font = '900 20px Tajawal,sans-serif';
      tx.fillText(p.t, 170, p.y + cam - 6);
    }
    pops = pops.filter((p) => p.a > 0);
    tx.globalAlpha = 1;

    tx.fillStyle = '#F3E6D3';
    if (started) {
      tx.font = '900 40px Tajawal,sans-serif';
      tx.fillText(AR(score), 170, 56);
      tx.font = '700 14px Tajawal,sans-serif';
      tx.fillText('الأفضل: ' + AR(best), 170, 78);
    }

    if (!started || over) {
      tx.fillStyle = 'rgba(10,6,4,.7)';
      tx.fillRect(0, 0, W, H);
      tx.save();
      tx.translate(118, 60);
      tx.scale(0.3, 0.3);
      tx.fillStyle = '#F3E6D3';
      tx.fill(LOGO);
      tx.restore();
      const lines: Line[] = [];
      if (!started) {
        lines.push(['برج الأكواب', 30, 175], ['كدّس الأكواب أعلى ما تستطيع', 17, 212], ['المس الشاشة للبدء', 17, 300]);
      } else {
        lines.push(['سقط البرج', 30, 160], ['ارتفاعك: ' + AR(score) + ' كوب', 20, 198], ['الأفضل: ' + AR(best), 16, 226, '#C98A3E']);
        if (score >= GOAL) lines.push([BONUS_LINE_1, 18, 268, '#FFC83D'], [BONUS_LINE_2, 18, 296, '#FFC83D']);
        else lines.push(['ابنِ ' + AR(GOAL) + ' كوباً لتربح مكافأة', 16, 268, '#C98A3E']);
        lines.push(['المس للعب من جديد', 16, 350]);
      }
      lines.forEach(([s, z, y, c]) => {
        tx.font = (z > 22 ? 900 : 700) + ' ' + z + 'px Tajawal,sans-serif';
        tx.fillStyle = c ?? '#F3E6D3';
        tx.fillText(s, 170, y);
      });
    }
    rafId = requestAnimationFrame(loop);
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drop();
  }, { signal: sig });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    drop();
  }, { signal: sig });

  const mu = $<HTMLButtonElement>('#ctMu');
  mu?.addEventListener('click', () => {
    mute = !mute;
    if (mu) mu.textContent = mute ? '🔇 الصوت' : '🔊 الصوت';
  }, { signal: sig });

  running = true;
  prev = 0;
  rafId = requestAnimationFrame(loop);
}

/** ينظّف اللعبة عند إغلاق التبويب أو تبديله. */
export function stopCupTower(): void {
  running = false;
  cancelAnimationFrame(rafId);
  rafId = 0;
  abort?.abort();
  abort = null;
}