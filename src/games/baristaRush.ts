/**
 * ورديّة الباريستا — لعبة جديدة داخل ألعاب سَنا (تبويب ثالث).
 * محوّلة من نسخة HTML الأصلية إلى لغة التطبيق الحالية.
 */
import { $ } from '../ui/dom.ts';

export const BONUS_LINE_1 = '🎁 اعرض هذه الشاشة للكاشير';
export const BONUS_LINE_2 = 'واحصل على خصم على طلبك القادم';

const AR = (n: number): string =>
  String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
const lp = new Path2D();
lp.addPath(LOGO, new DOMMatrix([0.5, 0, 0, 0.5, 83, 109]));
const SH = [null, { p: new Path2D('M170,252C70,180 92,88 170,132C248,88 270,180 170,252Z') }];

const STYLE_ID = 'barista-rush-style';
export function injectBaristaStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .barista-rush .bc-header{display:flex;align-items:center;gap:14px;margin-bottom:10px}
    .barista-rush .bc-logo{width:44px;color:var(--ink);flex:none}
    .barista-rush h3{margin:0;font-size:18px}
    .barista-rush .sub{color:var(--muted);margin:2px 0 0;font-size:13px}
    .barista-rush .stage{background:var(--card,#FFFDF8);border:1px solid var(--line);border-radius:18px;padding:8px}
    .barista-rush #bcv{display:block;width:100%;max-width:340px;margin:0 auto;aspect-ratio:340/400;border-radius:14px;background:#1F1511;touch-action:none}
    .barista-rush .hint{text-align:center;color:var(--muted);font-size:13px;margin:8px 0 0}
    .barista-rush .res{margin:10px auto 0;max-width:340px;text-align:center;border:1px dashed var(--acc,#301A14);border-radius:14px;padding:10px;line-height:1.7;animation:pop .35s}
    @keyframes pop{from{transform:scale(.9);opacity:0}}
    .barista-rush .mu{display:block;margin:10px auto 0;font:inherit;padding:7px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
    .barista-rush .dif{display:flex;gap:8px;justify-content:center;margin-top:8px}
    .barista-rush .dif button{font:inherit;font-size:13px;padding:6px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
    .barista-rush .dif button[aria-pressed="true"]{background:var(--acc,#301A14);color:var(--card,#FFFDF8);border-color:var(--acc,#301A14)}
    [hidden]{display:none!important}
    @media (prefers-reduced-motion:reduce){.barista-rush *{animation:none!important}}
  `;
  document.head.append(style);
}

interface Step { n: string; h: string; lo: number; hi: number; z: [number, number]; rate?: number; hold?: boolean; u?: string; }
const ST: Step[] = [
  { n: 'اطحن البن', h: 'اضغط باستمرار، واترك عند المنطقة الخضراء', lo: 0, hi: 100, z: [60, 74], rate: 34, hold: true, u: '٪' },
  { n: 'ثبّت البن', h: 'المس الشاشة لحظة مرور المؤشر بالمنطقة الخضراء', lo: 0, hi: 100, z: [43, 57] },
  { n: 'استخرج الإسبريسو', h: 'اضغط باستمرار، واترك عند الثواني المحددة', lo: 0, hi: 45, z: [25, 31], rate: 9, hold: true, u: ' ث' },
  { n: 'بخّر الحليب', h: 'اضغط باستمرار، واترك عند الحرارة المحددة', lo: 20, hi: 80, z: [58, 66], rate: 15, hold: true, u: '°' },
  { n: 'نقع القهوة (بلوم)', h: 'اضغط لصبّ الماء، واترك عند الكمية المحددة', lo: 0, hi: 100, z: [38, 50], rate: 28, hold: true, u: ' غ' },
  { n: 'اسكب بحركة دائرية', h: 'اضغط لصبّ الماء ببطء، واترك عند الكمية المحددة', lo: 0, hi: 350, z: [235, 265], rate: 75, hold: true, u: ' مل' },
  { n: 'انتظر التقطير', h: 'اضغط لبدء المؤقّت، واترك عندما ينتهي الماء من المصفاة', lo: 0, hi: 240, z: [150, 180], rate: 38, hold: true, u: ' ث' },
  { n: 'سخّن في الركوة', h: 'اضغط باستمرار، واترك قبل أن تفور الرغوة', lo: 0, hi: 100, z: [80, 92], rate: 26, hold: true, u: '٪' },
];
type StepOverride = { [key: number]: [number, number] };
interface MenuItemDef { n: string; e: string; s: number[]; t: string; x?: StepOverride; }
const MENU: MenuItemDef[] = [
  { n: 'إسبريسو', e: '☕', s: [0, 1, 2], t: 'قهوة مركزة بسيطة' },
  { n: 'ريستريتو', e: '⚡', s: [0, 1, 2], x: { 2: [14, 19] }, t: 'شوت قصير، أوقفه مبكراً' },
  { n: 'لاتيه', e: '🥛', s: [0, 1, 2, 3], t: 'حليب ناعم ورغوة خفيفة' },
  { n: 'قهوة تركية', e: '🏺', s: [0, 7, 7], x: { 0: [78, 90] }, t: 'طحن ناعم جداً، لا تدعها تفور' },
  { n: 'كابتشينو', e: '☁️', s: [0, 1, 2, 3], x: { 3: [62, 70] }, t: 'رغوة كثيفة، سخّن أكثر' },
  { n: 'V60', e: '💧', s: [0, 4, 5, 6], x: { 0: [38, 50] }, t: 'قهوة مقطّرة، اسكب بدقة وصبر' },
  { n: 'فلات وايت', e: '✨', s: [0, 1, 2, 3], x: { 2: [26, 30], 3: [55, 60] }, t: 'دقة عالية، النطاق ضيق' },
];
const DF = [
  { n: 'سهل', zw: 1.35, pat: 60, sp: 0.85 },
  { n: 'متوسط', zw: 1, pat: 45, sp: 1 },
  { n: 'صعب', zw: 0.7, pat: 32, sp: 1.25 },
];

let dfi = 1;
let PAT = DF[dfi].pat;
let bs = -1;
let ph: 'ready' | 'run' | 'ticket' | 'fb' = 'ready';
let bv = 0;
let bt = 0;
let bl = 0;
let fb = '';
let fbT = 0;
let shift: MenuItemDef[] = [];
let ci = 0;
let ord: MenuItemDef | null = null;
let sg: (Step & { id: number; z: [number, number] }) | null = null;
let cur: number[] = [];
let pat = PAT;
let left = false;
let res: Array<{ o: MenuItemDef; sc: number[]; q: number; left: boolean; tip: number }> = [];
let parts: Array<{ x: number; y: number; vx: number; vy: number; l: number; c: string }> = [];
let shake = 0;
let rafId = 0;
let canvas: HTMLCanvasElement | null = null;
let bx: CanvasRenderingContext2D | null = null;
let abort: AbortController | null = null;

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const bcol = (s: number): string => (s >= 0.9 ? '#3FA66B' : s >= 0.6 ? '#E5B93C' : '#E5484D');
const stars = (x: number): string => { const k = Math.round(x * 5); return '★'.repeat(k) + '☆'.repeat(5 - k); };
function rr(x: number, y: number, w: number, h: number, r: number | number[], c: string): void {
  if (!bx) return;
  bx.fillStyle = c;
  bx.beginPath();
  bx.roundRect(x, y, w, h, r as number);
  bx.fill();
}
function burst(x: number, y: number, c: string, n: number): void {
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 240, vy: -Math.random() * 220 - 40, l: 0.7, c });
}

function startShift(): void {
  shift = [...MENU].sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => MENU.indexOf(a) - MENU.indexOf(b));
  ci = 0;
  res = [];
  const r = $<HTMLElement>('#bres');
  if (r) r.hidden = true;
  newOrder();
}
function newOrder(): void {
  ord = shift[ci];
  cur = [];
  bs = 0;
  pat = PAT;
  left = false;
  ph = 'ticket';
  fbT = 1.8;
  const bh = $('#bh');
  if (bh && ord) bh.textContent = 'الطلب القادم: ' + ord.n;
  snd(660, 0.1, 'triangle');
}
function initStage(): void {
  if (!ord || bs < 0 || bs >= ord.s.length) return;
  const id = ord.s[bs];
  const s0 = ST[id];
  const z0 = (ord.x && ord.x[id]) || s0.z;
  const c = (z0[0] + z0[1]) / 2;
  const w = ((z0[1] - z0[0]) / 2) * DF[dfi].zw;
  sg = Object.assign({ id }, s0, { z: [c - w, c + w] as [number, number], rate: (s0.rate ?? 30) * DF[dfi].sp });
  bv = sg.lo;
  bt = 1;
  ph = sg.hold ? 'ready' : 'run';
  const bh = $('#bh');
  if (bh) bh.textContent = sg.h;
}
function bscore(s: { z: [number, number]; lo: number; hi: number }, v: number): number {
  const c = (s.z[0] + s.z[1]) / 2;
  const w = (s.z[1] - s.z[0]) / 2;
  const d = Math.abs(v - c);
  return d <= w ? 1 - 0.1 * (d / w) : Math.max(0, 0.9 - (d - w) / ((s.hi - s.lo) * 0.28));
}
function bstop(): void {
  if (!sg) return;
  const sc = bscore(sg, bv);
  cur.push(sc);
  ph = 'fb';
  fbT = 1.1;
  fb = sc >= 0.9 ? 'ممتاز! 🎯' : sc >= 0.65 ? 'جيد جداً' : sc >= 0.4 ? 'قريب' : 'ابتعدت كثيراً';
  if (sg.id === 3 && bv > 72) fb = 'احترق الحليب 🔥';
  if (sg.id === 7 && bv > 92) fb = 'فارت القهوة 🔥';
  if (sc >= 0.9) { burst(170, 230, '#FFC83D', 16); navigator.vibrate?.(30); }
  snd(300 + sc * 500, 0.2, 'triangle');
}
function leave(): void {
  left = true;
  if (!ord) return;
  while (cur.length < ord.s.length) cur.push(0);
  ph = 'fb';
  fbT = 1.5;
  fb = 'غادر الزبون 😠';
  shake = 10;
  snd(150, 0.4, 'sawtooth', 0.05);
}
function endOrder(): void {
  if (!ord) return;
  const q = mean(cur);
  res.push({ o: ord, sc: cur, q, left, tip: left ? 0 : Math.round((q * pat) / PAT * 12 * (1 + dfi * 0.5)) });
  if (++ci < 3) newOrder(); else summary();
}
function summary(): void {
  bs = 9;
  const Q = mean(res.map((x) => x.q));
  const p = Math.round(Q * 100);
  const bb = store.get('sana_rush' + dfi);
  const tips = res.reduce((a, x) => a + x.tip, 0);
  const ok = Q >= [0.85, 0.8, 0.7][dfi] && !res.some((x) => x.left);
  if (p > bb) store.set('sana_rush' + dfi, p);
  const rank = Q >= 0.9 ? 'أسطورة سنا 🏆' : Q >= 0.75 ? 'باريستا محترف' : Q >= 0.55 ? 'باريستا متدرب' : 'باريستا مبتدئ';
  const r = $<HTMLElement>('#bres');
  if (r) {
    r.hidden = false;
    r.style.animation = 'none';
    void r.offsetWidth;
    r.style.animation = '';
    r.innerHTML = '<h3 style="margin:0;font-size:22px">' + rank + '</h3><br>' +
      res.map((x) => x.o.e + ' ' + x.o.n + ' ' + (x.left ? '😠 غادر قبل أن يستلم' : '<span style="letter-spacing:2px">' + stars(x.q) + '</span> ' + AR(Math.round(x.q * 100)) + '٪')).join('<br>') +
      '<br><br>🪙 البقشيش: ' + AR(tips) + ' ريال<br>مستواك ' + AR(p) + '٪ وأفضل نتيجة ' + AR(Math.max(p, bb)) + '٪' +
      (ok ? '<br><br><strong>' + BONUS_LINE_1 + '<br>' + BONUS_LINE_2 + '</strong>' : '') +
      '<br><small>المس الشاشة لوردية جديدة</small>';
  }
  const bh = $('#bh');
  if (bh) bh.textContent = '';
  if (Q >= 0.6) [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => snd(f, 0.18, 'triangle'), i * 100));
}

function bupd(dt: number): void {
  for (const p of parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 500 * dt;
    p.l -= dt;
  }
  parts = parts.filter((p) => p.l > 0);
  shake = Math.max(0, shake - dt * 30);
  if (bs < 0 || bs > 8) return;
  if (ph === 'ticket') {
    fbT -= dt;
    if (fbT <= 0) initStage();
    return;
  }
  if (ph === 'fb') {
    fbT -= dt;
    if (fbT <= 0) {
      if (!left && ord && bs + 1 < ord.s.length) { bs++; initStage(); } else endOrder();
    }
    return;
  }
  pat -= dt;
  if (pat <= 0) { leave(); return; }
  if (ph === 'run' && sg) {
    bt += dt;
    if (sg.hold) {
      bv += (sg.rate ?? 30) * dt;
      if (Math.floor(bt * 9) !== Math.floor((bt - dt) * 9)) snd(120 + ((bv - sg.lo) / (sg.hi - sg.lo)) * 400, 0.04, 'square', 0.015);
      if (bv >= sg.hi) { bv = sg.hi; bstop(); }
    } else bv = 50 + 50 * Math.sin(bt * 3.6 * DF[dfi].sp);
  }
}

function head(): void {
  if (!bx || !ord || !sg) return;
  const k = Math.max(pat / PAT, 0);
  bx.textAlign = 'center';
  bx.font = '24px serif';
  bx.fillStyle = '#fff';
  bx.fillText(k > 0.66 ? '😀' : k > 0.33 ? '🙂' : k > 0 ? '😟' : '😠', 30, 34);
  rr(56, 24, 244, 10, 5, 'rgba(243,230,211,.15)');
  rr(56, 24, Math.max(244 * k, 0), 10, 5, k > 0.5 ? '#3FA66B' : k > 0.25 ? '#E5B93C' : '#E5484D');
  for (let i = 0; i < ord.s.length; i++) {
    bx.fillStyle = i < cur.length ? bcol(cur[i]) : i === bs ? '#F3E6D3' : 'rgba(243,230,211,.2)';
    bx.beginPath();
    bx.arc(170 + (i - (ord.s.length - 1) / 2) * 24, 52, 6, 0, 7);
    bx.fill();
  }
  bx.fillStyle = '#F3E6D3';
  bx.font = '900 21px Tajawal,sans-serif';
  bx.fillText(ord.n + ' ‹ ' + sg.n, 170, 84);
}

function scene(): void {
  if (!bx || !sg) return;
  const id = sg.id;
  const run = ph === 'run';
  const f = id === 0 ? bv / 100 : id === 2 ? bv / 45 : 0.2 + ((bv - 20) / 60) * 0.6;
  bx.save();
  bx.translate(0, 22);
  if (id === 0) {
    bx.fillStyle = '#C9CDD2';
    bx.beginPath(); bx.moveTo(120, 50); bx.lineTo(220, 50); bx.lineTo(200, 100); bx.lineTo(140, 100); bx.fill();
    bx.fillStyle = '#6B3F22';
    bx.beginPath(); bx.moveTo(126, 70); bx.lineTo(214, 70); bx.lineTo(200, 100); bx.lineTo(140, 100); bx.fill();
    rr(130, 100, 80, 76, 10, '#8A8F96');
    rr(150, 116, 40, 8, 4, '#2B2B2B');
    rr(165, 176, 10, 16, 2, '#6B6F75');
    rr(128, 214, 84, 40, [4, 4, 12, 12], '#B9BDC2');
    const top = 250 - 30 * f;
    bx.fillStyle = '#7B4A28';
    bx.fillRect(134, top, 72, 250 - top);
    if (run) bx.fillRect(168, 192, 4, top - 192);
  } else if (id === 1) {
    rr(110, 180, 120, 70, [6, 6, 16, 16], '#B9BDC2');
    rr(230, 198, 50, 12, 6, '#6B6F75');
    bx.fillStyle = '#4E2A16';
    bx.fillRect(118, 196, 104, 46);
    const py = 122 + (bv / 100) * 120;
    bx.fillStyle = '#C9CDD2';
    bx.fillRect(168, py - 60, 4, 60);
    rr(116, py, 108, 14, 5, '#D6DADF');
    bx.fillStyle = '#8A8F96';
    bx.beginPath(); bx.arc(170, py - 60, 10, 0, 7); bx.fill();
  } else if (id === 2) {
    rr(120, 40, 100, 36, 8, '#8A8F96');
    rr(150, 76, 40, 12, 4, '#6B6F75');
    rr(130, 88, 80, 14, 6, '#B9BDC2');
    rr(210, 92, 56, 8, 4, '#6B6F75');
    const gt = 150, gh = 100, top = gt + gh - gh * f * 0.9;
    bx.save();
    bx.beginPath();
    bx.roundRect(140, gt, 60, gh, [4, 4, 16, 16]);
    bx.clip();
    const g = bx.createLinearGradient(0, top, 0, gt + gh);
    g.addColorStop(0, '#C98A3E'); g.addColorStop(0.15, '#6B3A1B'); g.addColorStop(1, '#2A1208');
    bx.fillStyle = g;
    bx.fillRect(140, top, 60, gt + gh - top);
    bx.restore();
    bx.strokeStyle = 'rgba(255,255,255,.5)';
    bx.lineWidth = 3;
    bx.beginPath(); bx.roundRect(140, gt, 60, gh, [4, 4, 16, 16]); bx.stroke();
    if (run) { bx.fillStyle = '#4A2410'; bx.fillRect(168, 102, 3, top - 102); }
  } else if (id > 3 && id < 7) {
    const lv = id === 4 ? 0.4 + (bv / 100) * 0.3 : id === 5 ? 0.3 + (bv / 350) * 0.6 : Math.max(0, 1 - bv / 170) * 0.9;
    const cf = id === 4 ? 0.05 : id === 5 ? 0.1 + (bv / 350) * 0.35 : 0.45 + Math.min(bv / 170, 1) * 0.4;
    const wt = 184 - 78 * lv;
    bx.save();
    bx.beginPath(); bx.roundRect(118, 196, 104, 64, [4, 4, 18, 18]); bx.clip();
    bx.fillStyle = '#4A2410';
    bx.fillRect(118, 260 - 64 * cf, 104, 64 * cf);
    bx.restore();
    bx.strokeStyle = 'rgba(255,255,255,.5)';
    bx.lineWidth = 3;
    bx.beginPath(); bx.roundRect(118, 196, 104, 64, [4, 4, 18, 18]); bx.stroke();
    bx.fillStyle = '#E8E2D8';
    bx.beginPath(); bx.moveTo(100, 100); bx.lineTo(240, 100); bx.lineTo(194, 190); bx.lineTo(146, 190); bx.fill();
    bx.save();
    bx.beginPath(); bx.moveTo(110, 106); bx.lineTo(230, 106); bx.lineTo(190, 184); bx.lineTo(150, 184); bx.clip();
    bx.fillStyle = '#6B3F22'; bx.fillRect(100, 150, 140, 40);
    bx.fillStyle = 'rgba(110,62,30,.92)'; bx.fillRect(100, wt, 140, 184 - wt);
    if (id === 4) { bx.fillStyle = 'rgba(255,230,190,.6)'; for (let i = 0; i < 8; i++) { bx.beginPath(); bx.arc(130 + ((i * 37) % 80), 140 + ((i * 13) % 16), 2 + bv / 25, 0, 7); bx.fill(); } }
    bx.restore();
    rr(200, 14, 64, 34, 10, '#8A8F96');
    bx.strokeStyle = '#8A8F96';
    bx.lineWidth = 6; bx.lineCap = 'round';
    bx.beginPath(); bx.moveTo(204, 32); bx.lineTo(178, 52); bx.stroke();
    if (run && id < 6) { bx.strokeStyle = 'rgba(170,210,255,.85)'; bx.lineWidth = 4; bx.beginPath(); bx.moveTo(178, 54); bx.lineTo(178, wt); bx.stroke(); }
    if ((run && id < 6) || (id === 6 && lv > 0 && bv > 2)) { bx.fillStyle = '#4A2410'; bx.beginPath(); bx.arc(170, 200 + (bt * 140) % 50, 2.5, 0, 7); bx.fill(); }
  } else if (id === 7) {
    const f2 = bv / 100, fh = f2 * 46;
    bx.fillStyle = '#E5821F';
    for (let i = 0; i < 5; i++) {
      const k = 18 + Math.sin(bt * 10 + i) * 6 + (ph === 'run' ? 10 : 0);
      bx.beginPath();
      bx.moveTo(130 + i * 20, 262);
      bx.lineTo(140 + i * 20, 262 - k);
      bx.lineTo(150 + i * 20, 262);
      bx.fill();
    }
    rr(210, 176, 84, 8, 4, '#6B3F22');
    bx.fillStyle = '#B87333';
    bx.beginPath(); bx.moveTo(138, 150); bx.lineTo(202, 150); bx.lineTo(222, 245); bx.lineTo(118, 245); bx.fill();
    bx.fillStyle = '#D9B98F';
    bx.beginPath(); bx.ellipse(170, 150, 34, fh + 3, 0, Math.PI, 2 * Math.PI); bx.fill();
    bx.fillStyle = '#F0DDBF';
    for (let i = 0; i < 6; i++) { bx.beginPath(); bx.arc(146 + ((i * 17) % 48), 148 - ((i * 7) % Math.max(fh, 1)), 3 + f2 * 3, 0, 7); bx.fill(); }
    if (bv > 92) { bx.fillStyle = '#7B4A28'; bx.fillRect(134, 150, 7, 90); bx.fillRect(199, 150, 7, 85); }
  } else {
    const hot = bv > 72;
    bx.fillStyle = hot ? '#E8A08A' : '#C9CDD2';
    bx.beginPath(); bx.moveTo(122, 110); bx.lineTo(218, 110); bx.lineTo(206, 250); bx.lineTo(134, 250); bx.fill();
    bx.strokeStyle = '#8A8F96';
    bx.lineWidth = 8; bx.lineCap = 'round';
    bx.beginPath(); bx.arc(222, 150, 22, -1.2, 1.2); bx.stroke();
    bx.strokeStyle = '#E4E6E8';
    bx.lineWidth = 6;
    bx.beginPath(); bx.moveTo(262, 30); bx.lineTo(262, 70); bx.lineTo(196, 150); bx.stroke();
    bx.fillStyle = '#FFF4E0';
    bx.beginPath(); bx.ellipse(170, 110, 48, 9, 0, 0, 7); bx.fill();
    const fh = Math.max(((bv - 20) / 60) * 34, 1);
    bx.fillStyle = 'rgba(255,255,255,.88)';
    for (let i = 0; i < 9; i++) { bx.beginPath(); bx.arc(134 + ((i * 37) % 72), 108 - ((i * 13) % fh), 5 + (bv - 20) / 14, 0, 7); bx.fill(); }
    if (run) { bx.strokeStyle = 'rgba(255,255,255,.3)'; bx.lineWidth = 3; for (let i = -1; i < 2; i++) { const o = Math.sin(bt * 6 + i * 2) * 8; bx.beginPath(); bx.moveTo(170 + i * 24, 92); bx.bezierCurveTo(170 + i * 24 + o, 76, 170 + i * 24 - o, 64, 170 + i * 24 + o / 2, 48); bx.stroke(); } }
  }
  bx.restore();
}
function gauge(): void {
  if (!bx || !sg) return;
  const s = sg;
  const X = (v: number): number => 30 + ((v - s.lo) / (s.hi - s.lo)) * 280;
  rr(30, 322, 280, 18, 9, 'rgba(243,230,211,.15)');
  bx.fillStyle = '#3FA66B';
  bx.fillRect(X(s.z[0]), 322, X(s.z[1]) - X(s.z[0]), 18);
  const m = X(bv);
  bx.fillStyle = s.id === 3 && bv > 72 ? '#E5484D' : '#F3E6D3';
  bx.beginPath(); bx.moveTo(m, 319); bx.lineTo(m - 9, 304); bx.lineTo(m + 9, 304); bx.fill();
  bx.textAlign = 'center';
  bx.font = '700 16px Tajawal,sans-serif';
  if (s.hold) {
    bx.fillText(AR(Math.round(bv)) + (s.u ?? ''), m, 296);
    bx.fillStyle = 'rgba(243,230,211,.7)';
    bx.font = '700 14px Tajawal,sans-serif';
    bx.fillText('الهدف: ' + AR(s.z[0]) + ' - ' + AR(s.z[1]) + (s.u ?? ''), 170, 362);
  }
}

function cupTop(x: number, y: number, r: number, o: MenuItemDef, x2: { q: number; left: boolean }): void {
  if (!bx) return;
  const c = (k: number, col: string): void => { bx!.fillStyle = col; bx!.beginPath(); bx!.arc(x, y, k, 0, 7); bx!.fill(); };
  const e = x2.q;
  const q = x2.q;
  c(r + 8, '#F2EEE8'); c(r + 2, '#E4DDD2'); c(r, `hsl(24,${40 + e * 20}%,${44 - e * 14}%)`);
  if (x2.left) { bx.fillStyle = 'rgba(0,0,0,.45)'; bx.beginPath(); bx.arc(x, y, r + 8, 0, 7); bx.fill(); return; }
  bx.fillStyle = '#FFF4E0';
  if (!o.s.includes(3)) {
    if (o.n === 'قهوة تركية' && q >= 0.6) c(r * 0.66, '#D9B98F');
    else if (e >= 0.7 && o.n !== 'V60') c(r * 0.62, 'hsl(30,60%,52%)');
    return;
  }
  bx.save();
  bx.translate(x, y);
  bx.scale(r / 116, r / 116);
  bx.translate(-170, -170);
  if (q >= 0.88) bx.fill(lp);
  else if (q >= 0.7) bx.fill(SH[1]!.p);
  else if (q >= 0.45) { bx.beginPath(); bx.arc(184, 162, 58, 0, 7); bx.fill(); }
  else for (let i = 0; i < 5; i++) { bx.beginPath(); bx.arc(130 + ((i * 47) % 90), 130 + ((i * 31) % 80), 12, 0, 7); bx.fill(); }
  bx.restore();
}

function bdraw(): void {
  if (!bx) return;
  bx.save();
  if (shake) bx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const g = bx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, '#2A1A12'); g.addColorStop(1, '#120B08');
  bx.fillStyle = g;
  bx.fillRect(-12, -12, 364, 424);
  bx.textAlign = 'center';
  bx.fillStyle = '#F3E6D3';
  if (bs < 0) {
    bx.save();
    bx.translate(118, 64); bx.scale(0.3, 0.3); bx.fill(LOGO); bx.restore();
    bx.font = '900 30px Tajawal,sans-serif';
    bx.fillText('ورديّة الباريستا', 170, 175);
    bx.font = '700 17px Tajawal,sans-serif';
    bx.fillText('٣ زبائن بانتظار قهوتك', 170, 212);
    bx.fillText('إسبريسو وV60 وقهوة تركية، قبل أن ينفد صبرهم', 170, 240);
    bx.fillStyle = '#C98A3E';
    bx.fillText('أفضل نتيجة (' + DF[dfi].n + '): ' + AR(store.get('sana_rush' + dfi)) + '٪', 170, 292);
    bx.fillStyle = '#F3E6D3';
    bx.fillText('المس الشاشة لتبدأ الوردية', 170, 340);
  } else if (bs === 9) {
    bx.font = '900 24px Tajawal,sans-serif';
    bx.fillText('انتهت الوردية', 170, 44);
    const c = bx;
    res.forEach((x, i) => {
      const cx = 62 + i * 108;
      cupTop(cx, 150, 44, x.o, x);
      c.fillStyle = '#F3E6D3';
      c.font = '700 15px Tajawal,sans-serif';
      c.fillText(x.o.n, cx, 226);
      c.fillText(x.left ? '😠' : AR(Math.round(x.q * 100)) + '٪', cx, 250);
    });
    bx.fillStyle = 'rgba(243,230,211,.6)';
    bx.font = '700 14px Tajawal,sans-serif';
    bx.fillText('المس الشاشة لوردية جديدة', 170, 350);
  } else if (ph === 'ticket') {
    rr(50, 70, 240, 260, 16, '#FFFDF8');
    bx.fillStyle = '#301A14';
    bx.font = '700 16px Tajawal,sans-serif';
    bx.fillText('الزبون ' + AR(ci + 1) + ' من ٣', 170, 106);
    bx.font = '60px serif';
    if (ord) bx.fillText(ord.e, 170, 188);
    bx.font = '900 32px Tajawal,sans-serif';
    if (ord) bx.fillText(ord.n, 170, 236);
    bx.font = '700 15px Tajawal,sans-serif';
    bx.fillStyle = '#7A6A5F';
    if (ord) { bx.fillText(ord.t, 170, 268); bx.fillText(AR(ord.s.length) + ' خطوات', 170, 296); }
  } else {
    head();
    scene();
    gauge();
    if (ph === 'ready') {
      bx.font = '700 15px Tajawal,sans-serif';
      bx.fillStyle = 'rgba(243,230,211,.85)';
      bx.fillText('اضغط باستمرار ✋', 170, 390);
    }
    if (ph === 'fb') {
      bx.font = '900 28px Tajawal,sans-serif';
      bx.fillStyle = '#FFC83D';
      bx.fillText(fb, 170, 250);
    }
  }
  for (const p of parts) {
    bx.globalAlpha = Math.max(p.l / 0.7, 0);
    bx.fillStyle = p.c;
    bx.fillRect(p.x, p.y, 4, 4);
  }
  bx.globalAlpha = 1;
  bx.restore();
}

function bloop(now: number): void {
  const dt = Math.min((now - (bl || now)) / 1000, 0.05);
  bl = now;
  bupd(dt);
  bdraw();
  rafId = requestAnimationFrame(bloop);
}

/** نقطة الدخول: تُستدعى عند فتح تبويب «ورديّة الباريستا». */
export function startBaristaRush(box: HTMLElement, signal?: AbortSignal): void {
  stopBaristaRush();
  injectBaristaStyles();
  abort = new AbortController();
  const effSig = signal && !signal.aborted ? signal : abort.signal;

  box.innerHTML = `<div class="barista-rush">
    <div class="bc-header">
      <svg class="bc-logo" viewBox="0 0 347 244" role="img" aria-label="شعار سنا"><path fill="currentColor" d="M16,0H72Q88,0 88,16V140A21,21 0 0 0 130,140V16Q130,0 146,0H200Q216,0 216,16V140A22,22 0 0 0 260,140V16Q260,0 276,0H331Q347,0 347,16V222Q347,244 325,244H22Q0,244 0,222V16Q0,0 16,0Z"/></svg>
      <div><h3>ورديّة الباريستا</h3><p class="sub">٣ زبائن ينتظرون قهوتك، هل تلحق؟</p></div>
    </div>
    <section class="stage">
      <canvas id="bcv" width="340" height="400" aria-label="محاكاة تحضير القهوة"></canvas>
      <div class="dif" id="dif" role="group" aria-label="الصعوبة">
        <button data-d="0" aria-pressed="false">سهل</button>
        <button data-d="1" aria-pressed="true">متوسط</button>
        <button data-d="2" aria-pressed="false">صعب</button>
      </div>
      <p id="bh" class="hint"></p>
      <div id="bres" class="res" hidden></div>
    </section>
    <button id="mu" class="mu" aria-label="الصوت">🔊 الصوت</button>
  </div>`;

  canvas = $<HTMLCanvasElement>('#bcv');
  if (!canvas) return;
  canvas.width = 340 * dpr;
  canvas.height = 400 * dpr;
  bx = canvas.getContext('2d');
  if (!bx) return;
  bx.scale(dpr, dpr);

  const dif = box.querySelector<HTMLElement>('#dif');
  dif?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || (bs >= 0 && bs < 9)) return;
    dfi = +b.dataset.d!;
    PAT = DF[dfi].pat;
    dif.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }, { signal: effSig });

  const mu = box.querySelector<HTMLElement>('#mu');
  mu?.addEventListener('click', () => {
    mute = !mute;
    mu.textContent = mute ? '🔇 الصوت' : '🔊 الصوت';
  }, { signal: effSig });

  canvas.addEventListener('pointerdown', (e) => {
    canvas!.setPointerCapture(e.pointerId);
    if (bs < 0 || bs === 9) { startShift(); return; }
    if (ph === 'ready' && sg?.hold) ph = 'run';
    else if (ph === 'run' && !sg?.hold) bstop();
  }, { signal: effSig });
  const brel = (): void => { if (bs >= 0 && bs < 9 && ph === 'run' && sg?.hold) bstop(); };
  canvas.addEventListener('pointerup', brel, { signal: effSig });
  canvas.addEventListener('pointercancel', brel, { signal: effSig });

  const bh = box.querySelector<HTMLElement>('#bh');
  if (bh) bh.textContent = 'المس الشاشة لتبدأ الوردية';
  bl = 0;
  rafId = requestAnimationFrame(bloop);
}

export function stopBaristaRush(): void {
  cancelAnimationFrame(rafId);
  rafId = 0;
  abort?.abort();
  abort = null;
  canvas = null;
  bx = null;
}





