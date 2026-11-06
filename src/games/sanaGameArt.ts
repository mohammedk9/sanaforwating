/**
 * آ«ط£ظ„ط¹ط§ط¨ ط³ظژظ†ط§آ» â€” ظ„ط¹ط¨طھط§ظ† ظ„ظˆظ‚طھ ط§ظ„ط§ظ†طھط¸ط§ط± (ظ…ظ† sanagameart.html):
 * 1) ظپظ† ط§ظ„ظ„ط§طھظٹظ‡: ط±ط³ظ… ط¨ط§ظ„ط­ظ„ظٹط¨ ظ…ط¹ ط®ط·ظˆط· ط¥ط±ط´ط§ط¯ظٹط©. 2) طµظٹط¯ ط§ظ„ط­ط¨ظˆط¨: ط­ط±ظ‘ظƒ ط§ظ„ظپظ†ط¬ط§ظ† ظˆط§ظ„طھظ‚ط· ط§ظ„ط­ط¨ظˆط¨.
 * ط§ظ„ط³ظ„ظˆظƒ ظ…ط·ط§ط¨ظ‚ ظ„ظ„ط£طµظ„ظٹطŒ ظ…ط¹ طھظ†ط¸ظٹظپ ظƒط§ظ…ظ„ (RAF + ظ…ط³طھظ…ط¹ط§طھ) ط¹ظ†ط¯ ط§ظ„ط¥ط؛ظ„ط§ظ‚.
 */
import { $ } from '../ui/dom.ts';

const AR = (n: number): string => String(n).replace(/\d/g, (d) => 'ظ ظ،ظ¢ظ£ظ¤ظ¥ظ¦ظ§ظ¨ظ©'[Number(d)]);
const LOGO = new Path2D(
  'M16,0H72Q88,0 88,16V140A21,21 0 0 0 130,140V16Q130,0 146,0H200Q216,0 216,16V140A22,22 0 0 0 260,140V16Q260,0 276,0H331Q347,0 347,16V222Q347,244 325,244H22Q0,244 0,222V16Q0,0 16,0Z',
);

let abort: AbortController | null = null;
let raf = 0;
let beanRunning = false;

const STYLE_ID = 'sana-games-style';
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sana-games .sg-tabs{display:flex;gap:6px;margin-bottom:12px}
    .sana-games .sg-tabs button{flex:1;font:inherit;font-weight:700;padding:11px 8px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
    .sana-games .sg-tabs button[aria-selected="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    .sana-games .sg-stage{background:var(--paper2);border:1px solid var(--line);border-radius:20px;padding:12px}
    .sana-games .sg-wrap{position:relative;width:100%;max-width:340px;margin:0 auto;aspect-ratio:1/1}
    .sana-games .sg-wrap canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;border-radius:50%}
    .sana-games #sgGuide{pointer-events:none}
    .sana-games .sg-tools{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px}
    .sana-games .sg-tools button{font:inherit;font-size:14px;padding:8px 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
    .sana-games .sg-tools button[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 2px var(--ink)}
    .sana-games .sg-sw{width:34px;height:34px;padding:0!important;border-radius:50%!important}
    .sana-games .sg-hint{text-align:center;color:var(--muted);font-size:14px;margin:10px 0 0}
    .sana-games #sgGame{display:block;width:100%;max-width:340px;margin:0 auto;aspect-ratio:340/440;border-radius:14px;background:#1F1511;touch-action:none}
    .sana-games .sg-hud{display:flex;justify-content:space-between;font-weight:700;margin:0 auto 8px;max-width:340px}`;
  document.head.append(style);
}


/** ظٹظپطھط­ ظ„ظˆط­ط© آ«ط£ظ„ط¹ط§ط¨ ط³ظژظ†ط§آ» ط¯ط§ط®ظ„ ظ„ظˆط­ط© ط§ظ„ط£ظ„ط¹ط§ط¨ ط§ظ„ط±ط¦ظٹط³ظٹط©. */
export function startSanaGameArt(): void {
  stopSanaGameArt();
  injectStyle();
  const title = $('#gameTitle');
  const content = $('#gameContent');
  if (title) title.textContent = 'ط£ظ„ط¹ط§ط¨ ط³ظژظ†ط§';
  if (!content) return;

  abort = new AbortController();
  const sig = { signal: abort.signal };

  content.innerHTML = `
    <div class="sana-games">
      <div class="sg-tabs" role="tablist">
        <button role="tab" id="sgT1" aria-selected="true">ط§ط±ط³ظ… ط¹ظ„ظ‰ ظپظ†ط¬ط§ظ†ظƒ</button>
        <button role="tab" id="sgT2" aria-selected="false">طµظٹط¯ ط§ظ„ط­ط¨ظˆط¨</button>
      </div>
      <section id="sgP1" class="sg-stage">
        <div class="sg-wrap">
          <canvas id="sgLatte" aria-label="ط³ط·ط­ ظپظ†ط¬ط§ظ† ظ‚ظ‡ظˆط© ظ„ظ„ط±ط³ظ…"></canvas>
          <canvas id="sgGuide"></canvas>
        </div>
        <div class="sg-tools" id="sgColors"></div>
        <div class="sg-tools" id="sgShapes">
          <button data-g="0" aria-pressed="true">ط±ط³ظ… ط­ط±</button>
          <button data-g="1" aria-pressed="false">ظ‚ظ„ط¨</button>
          <button data-g="2" aria-pressed="false">ظˆط±ظ‚ط©</button>
          <button data-g="3" aria-pressed="false">ظˆط±ط¯ط©</button>
          <button data-g="4" aria-pressed="false">ط´ط¹ط§ط± ط³ظ†ط§</button>
        </div>
        <div class="sg-tools">
          <button id="sgThin">ط±ظپظٹط¹</button><button id="sgThick">ط¹ط±ظٹط¶</button><button id="sgClr">ظ…ط³ط­</button>
        </div>
        <p class="sg-hint">ط§ط³ط­ط¨ ط¨ط¥طµط¨ط¹ظƒ ط¹ظ„ظ‰ ط§ظ„ظ‚ظ‡ظˆط© ظˆط§ط±ط³ظ… ط¨ط§ظ„ط­ظ„ظٹط¨. ط§طھط¨ط¹ ط§ظ„ط®ط· ط§ظ„ط®ظپظٹظپ ظ„طھط®ط±ط¬ ط¨ط´ظƒظ„ ط£ط¬ظ…ظ„.</p>
      </section>
      <section id="sgP2" class="sg-stage" hidden>
        <div class="sg-hud"><span id="sgSc">ط§ظ„ظ†ظ‚ط§ط·: ظ </span><span id="sgLv">â‌¤ï¸ڈâ‌¤ï¸ڈâ‌¤ï¸ڈ</span><span id="sgBs">ط§ظ„ط£ظپط¶ظ„: ظ </span></div>
        <canvas id="sgGame" width="340" height="440" aria-label="ظ„ط¹ط¨ط© ط§ظ„طھظ‚ط§ط· ط­ط¨ظˆط¨ ط§ظ„ظ‚ظ‡ظˆط©"></canvas>
        <p class="sg-hint">ط­ط±ظ‘ظƒ ط§ظ„ظپظ†ط¬ط§ظ† ظˆط§ظ„طھظ‚ط· ط§ظ„ط­ط¨ظˆط¨ ط§ظ„ط·ط§ط²ط¬ط©. ط§ظ„ط­ط¨ط© ط§ظ„ظ…ط­ط±ظˆظ‚ط© (ط§ظ„ط­ظ…ط±ط§ط،) طھظ†ظ‚طµ ظ‚ظ„ط¨ط§ظ‹طŒ ظˆط§ظ„ط­ط¨ط© ط§ظ„طھظٹ طھط³ظ‚ط· ط£ظٹط¶ط§ظ‹.</p>
      </section>
    </div>`;

  const latte = $<HTMLCanvasElement>('#sgLatte');
  const guide = $<HTMLCanvasElement>('#sgGuide');
  const game = $<HTMLCanvasElement>('#sgGame');
  if (!latte || !guide || !game) return;

  const tab = (n: 1 | 2): void => {
    const p1 = $<HTMLElement>('#sgP1');
    const p2 = $<HTMLElement>('#sgP2');
    if (p1) p1.hidden = n !== 1;
    if (p2) p2.hidden = n !== 2;
    $('#sgT1')?.setAttribute('aria-selected', String(n === 1));
    $('#sgT2')?.setAttribute('aria-selected', String(n === 2));
    if (n !== 2) beanRunning = false;
  };
  $('#sgT1')?.addEventListener('click', () => tab(1), sig);

  /* ===== ظ„ط¹ط¨ط© 1: ظپظ† ط§ظ„ظ„ط§طھظٹظ‡ ===== */
  const S = 340;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const setup = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
    c.width = S * dpr;
    c.height = S * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    return ctx;
  };
  const lc = setup(latte);
  const gc = setup(guide);
  let color = '#FFF4E0';
  let size = 9;
  let gShape = 0;

  const base = (): void => {
    lc.clearRect(0, 0, S, S);
    const g = lc.createRadialGradient(170, 170, 10, 170, 170, 160);
    g.addColorStop(0, '#A5683A');
    g.addColorStop(0.7, '#7A4526');
    g.addColorStop(1, '#5A311A');
    lc.fillStyle = '#F2EEE8';
    lc.beginPath();
    lc.arc(170, 170, 168, 0, 7);
    lc.fill();
    lc.fillStyle = '#DDD6CC';
    lc.beginPath();
    lc.arc(170, 170, 156, 0, 7);
    lc.fill();
    lc.fillStyle = g;
    lc.beginPath();
    lc.arc(170, 170, 146, 0, 7);
    lc.fill();
  };

  const drawGuide = (): void => {
    gc.clearRect(0, 0, S, S);
    if (!gShape) return;
    gc.strokeStyle = 'rgba(255,255,255,.55)';
    gc.lineWidth = 2.5;
    gc.setLineDash([7, 7]);
    gc.beginPath();
    if (gShape === 1) {
      gc.moveTo(170, 250);
      gc.bezierCurveTo(70, 180, 95, 90, 170, 130);
      gc.bezierCurveTo(245, 90, 270, 180, 170, 250);
    } else if (gShape === 2) {
      gc.moveTo(170, 80);
      gc.bezierCurveTo(250, 130, 250, 220, 170, 265);
      gc.bezierCurveTo(90, 220, 90, 130, 170, 80);
      gc.moveTo(170, 80);
      gc.lineTo(170, 285);
    } else if (gShape === 3) {
      for (let r = 22; r <= 100; r += 26) {
        gc.moveTo(170 + r, 170);
        gc.arc(170, 170, r, 0, 7);
      }
    } else {
      gc.save();
      gc.translate(83, 109);
      gc.scale(0.5, 0.5);
      gc.setLineDash([14, 14]);
      gc.lineWidth = 5;
      gc.fillStyle = 'rgba(255,255,255,.2)';
      gc.fill(LOGO);
      gc.stroke(LOGO);
      gc.restore();
    }
    gc.stroke();
  };

  base();
  drawGuide();

  const pos = (e: PointerEvent): [number, number] => {
    const r = latte.getBoundingClientRect();
    return [((e.clientX - r.left) * S) / r.width, ((e.clientY - r.top) * S) / r.height];
  };
  let last: [number, number] | null = null;
  const clip = (): void => {
    lc.save();
    lc.beginPath();
    lc.arc(170, 170, 142, 0, 7);
    lc.clip();
  };
  const dot = (p: [number, number]): void => {
    clip();
    lc.fillStyle = color;
    lc.shadowColor = color;
    lc.shadowBlur = 5;
    lc.beginPath();
    lc.arc(p[0], p[1], size / 2, 0, 7);
    lc.fill();
    lc.restore();
  };
  const stroke = (a: [number, number], b: [number, number]): void => {
    clip();
    lc.strokeStyle = color;
    lc.shadowColor = color;
    lc.shadowBlur = 5;
    lc.lineWidth = size;
    lc.lineCap = 'round';
    lc.beginPath();
    lc.moveTo(a[0], a[1]);
    lc.lineTo(b[0], b[1]);
    lc.stroke();
    lc.restore();
  };

  latte.addEventListener('pointerdown', (e) => {
    latte.setPointerCapture(e.pointerId);
    last = pos(e);
    dot(last);
  }, sig);
  latte.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = pos(e);
    stroke(last, p);
    last = p;
  }, sig);
  ['pointerup', 'pointercancel'].forEach((t) =>
    latte.addEventListener(t, () => (last = null), sig),
  );

  const COLS: [string, string][] = [
    ['#FFF4E0', 'ط­ظ„ظٹط¨'],
    ['#5A3420', 'ط´ظˆظƒظˆظ„ط§طھط©'],
    ['#C98A3E', 'ظƒط±ط§ظ…ظٹظ„'],
  ];
  const colorsBox = $('#sgColors');
  COLS.forEach(([c, n], i) => {
    const b = document.createElement('button');
    b.className = 'sg-sw';
    b.style.background = c;
    b.title = n;
    b.setAttribute('aria-label', n);
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => {
      color = c;
      colorsBox?.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }, sig);
    colorsBox?.append(b);
  });

  $('#sgShapes')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    gShape = Number(b.dataset.g ?? 0);
    $('#sgShapes')?.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawGuide();
  }, sig);
  $('#sgThin')?.addEventListener('click', () => (size = 5), sig);
  $('#sgThick')?.addEventListener('click', () => (size = 14), sig);
  $('#sgClr')?.addEventListener('click', base, sig);

  /* ===== ظ„ط¹ط¨ط© 2: طµظٹط¯ ط§ظ„ط­ط¨ظˆط¨ ===== */
  const gx = game.getContext('2d')!;
  interface Bean {
    x: number;
    y: number;
    rot: number;
    bad?: boolean;
    v?: number;
  }
  let beans: Bean[] = [];
  let cupX = 170;
  let score = 0;
  let lives = 3;
  let best = 0;
  let spawnT = 0;
  let speed = 120;
  let loopPrev = 0;

  const px = (e: PointerEvent): number => {
    const r = game.getBoundingClientRect();
    return ((e.clientX - r.left) * 340) / r.width;
  };

  const hud = (): void => {
    const sc = $('#sgSc');
    const lv = $('#sgLv');
    const bs = $('#sgBs');
    if (sc) sc.textContent = 'ط§ظ„ظ†ظ‚ط§ط·: ' + AR(score);
    if (lv) lv.textContent = 'â‌¤ï¸ڈ'.repeat(Math.max(lives, 0)) || 'ًں’”';
    if (bs) bs.textContent = 'ط§ظ„ط£ظپط¶ظ„: ' + AR(best);
  };

  const drawBean = (b: Bean): void => {
    gx.save();
    gx.translate(b.x, b.y);
    gx.rotate(b.rot);
    gx.fillStyle = b.bad ? '#B3261E' : '#6B3F22';
    gx.beginPath();
    gx.ellipse(0, 0, 10, 14, 0, 0, 7);
    gx.fill();
    gx.strokeStyle = b.bad ? '#4A0F0C' : '#2B1A12';
    gx.lineWidth = 2;
    gx.beginPath();
    gx.moveTo(0, -13);
    gx.bezierCurveTo(-6, -4, 6, 4, 0, 13);
    gx.stroke();
    gx.restore();
  };

  const cup = (): void => {
    const y = 392;
    gx.fillStyle = '#F2EEE8';
    gx.beginPath();
    gx.moveTo(cupX - 34, y - 30);
    gx.lineTo(cupX + 34, y - 30);
    gx.lineTo(cupX + 26, y + 22);
    gx.lineTo(cupX - 26, y + 22);
    gx.closePath();
    gx.fill();
    gx.strokeStyle = '#F2EEE8';
    gx.lineWidth = 7;
    gx.beginPath();
    gx.arc(cupX + 38, y - 8, 13, -1.2, 1.2);
    gx.stroke();
    gx.fillStyle = '#301A14';
    gx.fillRect(cupX - 27, y - 12, 54, 26);
    gx.save();
    gx.translate(cupX - 15.6, y - 10);
    gx.scale(0.09, 0.09);
    gx.fillStyle = '#F3E6D3';
    gx.fill(LOGO);
    gx.restore();
  };

  const start = (): void => {
    beanRunning = true;
    beans = [];
    score = 0;
    lives = 3;
    spawnT = 0;
    speed = 120;
    loopPrev = 0;
    hud();
    raf = requestAnimationFrame(loop);
  };

  const loop = (now: number): void => {
    if (!beanRunning) return;
    const dt = Math.min((now - (loopPrev || now)) / 1000, 0.05);
    loopPrev = now;
    gx.clearRect(0, 0, 340, 440);
    spawnT -= dt;
    if (spawnT <= 0) {
      beans.push({
        x: 20 + Math.random() * 300,
        y: -20,
        rot: Math.random() * 6,
        bad: Math.random() < 0.22,
        v: speed + Math.random() * 40,
      });
      spawnT = Math.max(0.35, 0.9 - score * 0.012);
    }
    for (const b of beans) {
      b.y += (b.v ?? speed) * dt;
      b.rot += dt * 2;
    }
    beans = beans.filter((b) => {
      if (b.y > 360 && b.y < 412 && Math.abs(b.x - cupX) < 38) {
        if (b.bad) lives--;
        else score++;
        if (score > best) best = score;
        hud();
        return false;
      }
      if (b.y > 450) {
        if (!b.bad) lives--;
        hud();
        return false;
      }
      return true;
    });
    speed = 120 + score * 3;
    beans.forEach(drawBean);
    cup();
    if (lives <= 0) {
      beanRunning = false;
      gx.fillStyle = 'rgba(0,0,0,.6)';
      gx.fillRect(0, 0, 340, 440);
      gx.fillStyle = '#F3E6D3';
      gx.textAlign = 'center';
      gx.font = '900 30px Tajawal,sans-serif';
      gx.fillText('ط§ظ†طھظ‡طھ ط§ظ„ظ„ط¹ط¨ط©', 170, 190);
      gx.font = '700 20px Tajawal,sans-serif';
      gx.fillText('ظ†ظ‚ط§ط·ظƒ: ' + AR(score), 170, 226);
      gx.fillText('ط§ظ„ظ…ط³ ط§ظ„ط´ط§ط´ط© ظ„ظ„ط¹ط¨ ظ…ظ† ط¬ط¯ظٹط¯', 170, 262);
      loopPrev = 0;
      return;
    }
    raf = requestAnimationFrame(loop);
  };

  game.addEventListener('pointerdown', (e) => {
    game.setPointerCapture(e.pointerId);
    cupX = px(e);
    if (!beanRunning) start();
  }, sig);
  game.addEventListener('pointermove', (e) => {
    cupX = Math.max(36, Math.min(304, px(e)));
  }, sig);

  gx.save();
  gx.translate(118, 70);
  gx.scale(0.3, 0.3);
  gx.fillStyle = '#F3E6D3';
  gx.fill(LOGO);
  gx.restore();
  gx.fillStyle = '#F3E6D3';
  gx.textAlign = 'center';
  gx.font = '900 28px Tajawal,sans-serif';
  gx.fillText('طµظٹط¯ ط§ظ„ط­ط¨ظˆط¨', 170, 170);
  gx.font = '700 18px Tajawal,sans-serif';
  gx.fillText('ط§ظ„ظ…ط³ ط§ظ„ط´ط§ط´ط© ظ„ظ„ط¨ط¯ط،', 170, 210);
  beans = [
    { x: 120, y: 290, rot: 0.5 },
    { x: 220, y: 310, rot: 2 },
  ];
  beans.forEach(drawBean);
  beans = [];
  cup();
}
/** ينظّف كل شيء عند إغلاق اللوحة أو فتح لعبة أخرى. */
export function stopSanaGameArt(): void {
  beanRunning = false;
  cancelAnimationFrame(raf);
  raf = 0;
  abort?.abort();
  abort = null;
}


