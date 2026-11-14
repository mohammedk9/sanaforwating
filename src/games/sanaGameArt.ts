/**
 * «ألعاب سَنا» — صفحة منفصلة داخل لوحة اللعب:
 * تبويب 1: ارسم على فنجانك (مع مشاركة + لايكات + حذف الأدمن)
 * تبويب 2: اصطد الحبوب
 * تبويب 3: ورديّة الباريستا
 * تبويب 4: برج الأكواب
 * تبويب 5: ادمج القهوة
 * يُكتب عبر editor فقط (بدون shell) لتفادي تلف ترميز العربية.
 */
import { $, toast } from '../ui/dom.ts';
import { isStaff } from '../net/admin.ts';
import { publishArtwork, listArtworks, likeArtwork, deleteArtwork, artworkCardHtml, likedLocally, markLiked, type Artwork } from '../net/artwork.ts';
import { startBaristaRush, stopBaristaRush, injectBaristaStyles } from './baristaRush.ts';
import { startCupTower, stopCupTower, injectCupTowerStyles } from './cupTower.ts';
import { startMergeCoffee, stopMergeCoffee, injectMergeCoffeeStyles } from './mergeCoffee.ts';

const AR = (n: number): string => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
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
    .sana-games .sg-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
    .sana-games .sg-tabs button{flex:1 1 auto;font:inherit;font-weight:700;font-size:13px;padding:10px 8px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
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
    .sana-games .sg-hud{display:flex;justify-content:space-between;font-weight:700;margin:0 auto 8px;max-width:340px}
    .sana-games .sg-share{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px;align-items:center}
    .sana-games .sg-share input{border:1px solid var(--line);background:#fffefa;border-radius:999px;padding:9px 13px;font:inherit;font-size:13px;min-width:160px}
    .sana-games .sg-share button.primary{border:0;border-radius:999px;padding:10px 18px;font-weight:700;background:var(--ink);color:var(--paper);cursor:pointer}
    .sana-games .sg-share button.ghost{border:1px solid var(--line);background:transparent;border-radius:999px;padding:10px 14px;cursor:pointer}
    .art-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:16px}
    .art-card{background:#fffdfa;border:1px solid var(--line);border-radius:16px;overflow:hidden}
    .art-img{aspect-ratio:1/1;background:#f3eee6}
    .art-img img{width:100%;height:100%;object-fit:cover;display:block}
    .art-meta{display:flex;justify-content:space-between;padding:8px 10px 0;font-size:12px}
    .art-actions{display:flex;gap:6px;justify-content:space-between;padding:8px 10px 10px}
    .art-like{border:1px solid var(--line);background:#fff;padding:6px 12px;border-radius:999px;cursor:pointer;font-size:13px}
    .art-like.liked{background:#fbe9e7;border-color:#e8b4ae}
    .art-del{border:1px solid #e1b9b1;background:#f8ece9;color:#914f43;padding:6px 12px;border-radius:999px;cursor:pointer;font-size:12px}
    .art-empty{grid-column:1/-1;text-align:center;color:var(--muted);font-size:13px;padding:18px}`;
  document.head.append(style);
}

export function startSanaGameArt(): void {
  stopSanaGameArt();
  injectStyle();
  const content = $('#sanaGamesContent') ?? $('#gameContent');
  if (!content) return;

  abort = new AbortController();
  const sig = { signal: abort.signal };

  content.innerHTML = `<div class="sana-games">
      <div class="sg-tabs" role="tablist">
        <button role="tab" id="sgT1" aria-selected="true">ارسم على فنجانك</button>
        <button role="tab" id="sgT2" aria-selected="false">اصطد الحبوب</button>
        <button role="tab" id="sgT3" aria-selected="false">ورديّة الباريستا</button>
        <button role="tab" id="sgT4" aria-selected="false">برج الأكواب</button>
        <button role="tab" id="sgT5" aria-selected="false">ادمج القهوة</button>
      </div>
      <section id="sgP1" class="sg-stage">
        <div class="sg-wrap">
          <canvas id="sgLatte" width="340" height="340" aria-label="سطح فنجان قهوة اللاتيه"></canvas>
          <canvas id="sgGuide" width="340" height="340"></canvas>
        </div>
        <div class="sg-tools" id="sgColors"></div>
        <div class="sg-tools" id="sgShapes">
          <button data-g="0" aria-pressed="true">ارسم حر</button>
          <button data-g="1" aria-pressed="false">قلب</button>
          <button data-g="2" aria-pressed="false">ورقة</button>
          <button data-g="3" aria-pressed="false">دوائر</button>
          <button data-g="4" aria-pressed="false">شعار سنا</button>
        </div>
        <div class="sg-tools">
          <button id="sgThin">رفيع</button><button id="sgThick">عريض</button><button id="sgClr">مسح</button>
        </div>
        <div class="sg-share">
          <input id="sgName" maxlength="40" placeholder="اسمك (يظهر مع الرسم)">
          <button class="primary" id="sgShare">📤 مشاركة الرسم</button>
          <button class="ghost" id="sgDownload">⬇️ تنزيل</button>
        </div>
        <p class="sg-hint">اسحب بإصبعك على الفنجان للرسم. اضغط «مشاركة الرسم» ليظهر للجميع.</p>
        <h4 style="margin:18px 0 4px;font-size:15px">🖼️ رسومات روّاد سنا</h4>
        <div class="art-gallery" id="artGallery"><p class="art-empty">جارٍ تحميل الرسومات…</p></div>
      </section>
      <section id="sgP2" class="sg-stage" hidden>
        <div class="sg-hud"><span id="sgSc">النقاط: ٠</span><span id="sgLv">❤️❤️❤️</span><span id="sgBs">الأفضل: ٠</span></div>
        <canvas id="sgGame" width="340" height="440" aria-label="لعبة اصطد الحبوب"></canvas>
        <p class="sg-hint">حرّك الفنجان باللمس. الحبوب الصحيحة تزيد نقاطك، والحمراء تنقص قلباً.</p>
      </section>
      <section id="sgP3" class="sg-stage" hidden>
        <div id="sgBarista"></div>
      </section>
      <section id="sgP4" class="sg-stage" hidden>
        <div id="sgCups"></div>
      </section>
      <section id="sgP5" class="sg-stage" hidden>
        <div id="sgMerge"></div>
      </section>
    </div>`;

  const latency = $<HTMLCanvasElement>('#sgLatte');
  const guide = $<HTMLCanvasElement>('#sgGuide');
  const game = $<HTMLCanvasElement>('#sgGame');
  if (!latency || !guide || !game) return;

  injectBaristaStyles();
  injectCupTowerStyles();
  injectMergeCoffeeStyles();

  const baristaBox = $<HTMLElement>('#sgBarista');
  let baristaActive = false;
  const setBarista = (on: boolean): void => {
    if (!baristaBox) return;
    if (on && !baristaActive) {
      baristaActive = true;
      startBaristaRush(baristaBox, abort?.signal);
    } else if (!on && baristaActive) {
      baristaActive = false;
      stopBaristaRush();
    }
  };

  const cupsBox = $<HTMLElement>('#sgCups');
  let cupsActive = false;
  const setCups = (on: boolean): void => {
    if (!cupsBox) return;
    if (on && !cupsActive) {
      cupsActive = true;
      startCupTower(cupsBox, abort?.signal);
    } else if (!on && cupsActive) {
      cupsActive = false;
      stopCupTower();
    }
  };

  const mergeBox = $<HTMLElement>('#sgMerge');
  let mergeActive = false;
  const setMerge = (on: boolean): void => {
    if (!mergeBox) return;
    if (on && !mergeActive) {
      mergeActive = true;
      startMergeCoffee(mergeBox, abort?.signal);
    } else if (!on && mergeActive) {
      mergeActive = false;
      stopMergeCoffee();
    }
  };

  const tab = (n: 1 | 2 | 3 | 4 | 5): void => {
    for (let i = 1; i <= 5; i++) {
      const panel = $<HTMLElement>('#sgP' + i);
      if (panel) panel.hidden = i !== n;
      $('#sgT' + i)?.setAttribute('aria-selected', String(i === n));
    }
    if (n !== 2) beanRunning = false;
    setBarista(n === 3);
    setCups(n === 4);
    setMerge(n === 5);
  };
  $('#sgT1')?.addEventListener('click', () => tab(1), sig);
  $('#sgT2')?.addEventListener('click', () => tab(2), sig);
  $('#sgT3')?.addEventListener('click', () => tab(3), sig);
  $('#sgT4')?.addEventListener('click', () => tab(4), sig);
  $('#sgT5')?.addEventListener('click', () => tab(5), sig);
  // تفعيل أول تبويب عند الفتح (يُليه مرة واحدة فقط عند الإقلاع)
  tab(1);
  /* ===== اللعبة 1: فنجان اللاتيه ===== */
  const S = mS();
  function mS(): number { return 340; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const setup = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
    c.width = S * dpr;
    c.height = S * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    return ctx;
  };
  const lc = setup(latency);
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
    gc.strokeStyle = 'rgba(255,244,224,.85)';
    gc.lineWidth = 2;
    gc.setLineDash([6, 6]);
    gc.beginPath();
    if (gShape === 0) {
      gc.moveTo(90, 170);
      gc.lineTo(250, 170);
    } else if (gShape === 1) {
      gc.moveTo(170, 95);
      gc.bezierCurveTo(120, 130, 95, 160, 95, 190);
      gc.bezierCurveTo(95, 225, 130, 245, 170, 255);
      gc.bezierCurveTo(210, 245, 245, 225, 245, 190);
      gc.bezierCurveTo(245, 160, 220, 130, 170, 95);
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
    const r = latency.getBoundingClientRect();
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

  latency.addEventListener('pointerdown', (e) => {
    latency.setPointerCapture(e.pointerId);
    last = pos(e);
    dot(last);
  }, sig);
  latency.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = pos(e);
    stroke(last, p);
    last = p;
  }, sig);
  ['pointerup', 'pointercancel'].forEach((t) =>
    latency.addEventListener(t, () => (last = null), sig),
  );
  const COLS: [string, string][] = [
    ['#FFF4E0', 'حليب'],
    ['#5A3420', 'قهوة داكنة'],
    ['#C98A3E', 'كراميل'],
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

  const exportPng = (): string => {
    const tmp = document.createElement('canvas');
    tmp.width = S;
    tmp.height = S;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(latency, 0, 0, S, S);
    return tmp.toDataURL('image/png');
  };

  $('#sgDownload')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = exportPng();
    a.download = 'sana-cup.png';
    a.click();
  }, sig);

  // --- معرض الرسومات ---
  let artworks: Artwork[] = [];
  let canDelete = false;

  const renderGallery = (): void => {
    const box = $('#artGallery');
    if (!box) return;
    if (!artworks.length) {
      box.innerHTML = '<p class="art-empty">لا توجد رسومات بعد — كن أول من يشارك رسمته! ☕</p>';
      return;
    }
    box.innerHTML = artworks.map((a) => artworkCardHtml(a, canDelete)).join('');
  };

  const loadGallery = async (): Promise<void> => {
    try {
      artworks = await listArtworks();
      canDelete = await isStaff().catch(() => false);
    } catch { canDelete = false; }
    renderGallery();
  };
  void loadGallery();

  $('#artGallery')?.addEventListener('click', (e) => {
    const likeBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-like]');
    const delBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-del]');
    if (likeBtn?.dataset.like) {
      const id = likeBtn.dataset.like;
      if (likedLocally(id)) return;
      likeBtn.setAttribute('disabled', 'true');
      void likeArtwork(id).then((likes) => {
        markLiked(id);
        const art = artworks.find((a) => a.id === id);
        if (art) art.likes = likes;
        renderGallery();
      }).catch(() => { likeBtn.removeAttribute('disabled'); });
    } else if (delBtn?.dataset.del) {
      const id = delBtn.dataset.del;
      if (!window.confirm('حذف هذه الصورة نهائياً؟')) return;
      void deleteArtwork(id).then(() => {
        toast('تم حذف الصورة');
        void loadGallery();
      }).catch((err) => toast(err instanceof Error ? err.message : 'تعذّر الحذف.'));
    }
  }, sig);

  $('#sgShare')?.addEventListener('click', async () => {
    const name = ($<HTMLInputElement>('#sgName')?.value ?? '').trim() || 'ضيف سنا';
    const btn = $<HTMLButtonElement>('#sgShare');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ النشر…'; }
    try {
      const item = await publishArtwork(exportPng(), name);
      artworks = [item, ...artworks.filter((a) => a.id !== item.id)];
      renderGallery();
      toast('تمت مشاركة رسمتك! 🎉');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'تعذّر النشر.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📤 مشاركة الرسم'; }
    }
  }, sig);
  /* ===== اللعبة 2: اصطد الحبوب ===== */
  const gx = game.getContext('2d')!;
  interface Bean { x: number; y: number; rot: number; bad?: boolean; v?: number }
  let beans2: Bean[] = [];
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
    if (sc) sc.textContent = 'النقاط: ' + AR(score);
    if (lv) lv.textContent = '❤️'.repeat(Math.max(lives, 0)) || '💔';
    if (bs) bs.textContent = 'الأفضل: ' + AR(best);
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
    beans2 = [];
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
      beans2.push({
        x: 20 + Math.random() * 300,
        y: -20,
        rot: Math.random() * 6,
        bad: Math.random() < 0.22,
        v: speed + Math.random() * 40,
      });
      spawnT = Math.max(0.35, 0.9 - score * 0.012);
    }
    for (const b of beans2) {
      b.y += (b.v ?? speed) * dt;
      b.rot += dt * 2;
    }
    beans2 = beans2.filter((b) => {
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
    beans2.forEach(drawBean);
    cup();
    if (lives <= 0) {
      beanRunning = false;
      gx.fillStyle = 'rgba(0,0,0,.6)';
      gx.fillRect(0, 0, 340, 440);
      gx.fillStyle = '#F3E6D3';
      gx.textAlign = 'center';
      gx.font = '900 30px Tajawal,sans-serif';
      gx.fillText('انتهت اللعبة!', 170, 190);
      gx.font = '700 20px Tajawal,sans-serif';
      gx.fillText('نقاطك: ' + AR(score), 170, 226);
      gx.fillText('المس الشاشة لبدء جولة جديدة', 170, 262);
      loopPrev = 0;
      return;
    }
    raf = requestAnimationFrame(loop);
  };

  game.addEventListener('pointerdown', (e) => {
    game.setPointerCapture(e.pointerId);
    cupX = Math.max(36, Math.min(304, px(e)));
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
  gx.fillText('اصطد الحبوب', 170, 170);
  gx.font = '700 18px Tajawal,sans-serif';
  gx.fillText('المس الشاشة للبدء', 170, 210);
  beans2 = [
    { x: 120, y: 290, rot: 0.5 },
    { x: 220, y: 310, rot: 2 },
  ];
  beans2.forEach(drawBean);
  beans2 = [];
  cup();
}

/** ينظّف كل شيء عند إغلاق اللوحة أو فتح لعبة أخرى. */
export function stopSanaGameArt(): void {
  stopBaristaRush();
  stopCupTower();
  stopMergeCoffee();
  beanRunning = false;
  cancelAnimationFrame(raf);
  raf = 0;
  abort?.abort();
  abort = null;
}



