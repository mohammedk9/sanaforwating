/**
 * صفحة «حسابي و XP» — تبويب اللاعب وتبويب الإدارة في نفس الشاشة.
 *
 * تبويب اللاعب:
 *   - زائر: يحوّل جلسته المجهولة إلى حساب (البريد + كلمة المرور) فلا يفقد XP.
 *   - مسجّل: يرى XP ويعدّل اسمه أو يخرج.
 * تبويب الإدارة:
 *   - يدخل بحساب موظف. التحقق من صلاحية الموظف يحتاج جدول staff_members
 *     (هجرة 0002) — حتى ذلك الحين تظهر رسالة «قيد التجهيز».
 */
import { $, toast } from './dom.ts';
import { renderAdmin } from './admin.ts';
import { showView } from './order.ts';
import { hasSupabase } from '../env.ts';
import { ensureSession } from '../net/supabase.ts';
import { listPublicPrizes, type WeeklyPrize } from '../net/admin.ts';
import {
  getAccount,
  linkAccount,
  loadProfile,
  saveDisplayName,
  signIn,
  signOut,
  weeklyLeaderboard,
  type MyAccount,
  type MyProfile,
} from '../net/account.ts';

let account: MyAccount | null = null;
let profile: MyProfile | null = null;
let busy = false;

/** يعيد قراءة الحساب والملف من الخادم (بعد ضمان وجود جلسة). */
async function loadState(): Promise<void> {
  account = null;
  profile = null;
  if (!hasSupabase()) return;
  try {
    // الزائر يحصل على جلسة مجهولة تلقائياً حتى يبدأ بـ XP = 0 ويمكنه ربطها لاحقاً
    await ensureSession();
    account = await getAccount();
    profile = await loadProfile();
  } catch {
    account = null;
  }
}

/** المحتوى المتغيّر أعلى الصفحة (الهيرو + النقاط). */
function headerMarkup(): string {
  const name = profile?.displayName || (account?.isAnonymous ? 'زائر' : 'مستخدم');
  const xp = profile?.xp ?? 0;
  const email = account?.email ?? '';
  const isGuest = !account || account.isAnonymous;

  return `
    <div class="hero">
      <div>
        <h1>حسابك في سَنا.</h1>
        <p>سجّل حسابك لحفظ نقاط الخبرة XP وسجل مبارياتك ودخول الترتيب الأسبوعي. اللعب متاح دائماً بلا حساب.</p>
      </div>
      <div class="store-label">◎ الحساب</div>
    </div>

    <div class="loyalty-hero">
      <small>SANA · ACCOUNT</small>
      <h2>${name}</h2>
      <p>${isGuest ? 'أنت تلعب كزائر. أنشئ حساباً الآن لتحفظ ما جمعته.' : `مسجّل بـ ${email}`}</p>
    </div>

    <div class="card loyalty-form" style="margin-bottom:16px">
      <h3>نقاطك</h3>
      <div style="display:flex;align-items:baseline;gap:10px;margin:6px 0 10px">
        <div style="font-size:30px;font-weight:700;color:#2a7191">${xp}</div>
        <div style="font-size:11px;color:var(--muted)">XP</div>
      </div>
      <p style="font-size:10px;color:var(--muted);margin:0 0 12px">
        تُضاف النقاط على الخادم بعد كل مباراة (كل 10 نقاط لعب = 1 XP)، ولا يمكن زيادتها من المتصفح.
      </p>
      ${
        isGuest
          ? ''
          : `<div class="field" style="margin-bottom:10px">
              <label for="displayName">اسمك المعروض</label>
              <input id="displayName" maxlength="16" value="${profile?.displayName ?? ''}" placeholder="اسمك">
            </div>
            <button class="btn light" id="saveName">حفظ الاسم</button>`
      }
    </div>`;
}
/** يبني الصفحة كاملة ويعيد ربط الأحداث. */
function render(): void {
  const view = $('#accountView');
  if (!view) return;

  view.innerHTML = `
    ${headerMarkup()}
    <div class="card loyalty-form" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:16px">
        <h3 style="margin:0">حسابك</h3>
        <button class="btn light" id="tabAdmin">⚙ لوحة الإدارة</button>
      </div>
      <div id="tabContent"></div>
    </div>
    <div class="card loyalty-form">
      <h3>الترتيب الأسبوعي</h3>
      <p>أفضل المستخدمين بنقاط هذا الأسبوع — من المباريات وكل ألعاب سَنا.</p>
      <div id="leaderboard"><div style="font-size:11px;color:var(--muted)">جارٍ التحميل…</div></div>
    </div>`;

  $('#tabAdmin')?.addEventListener('click', () => {
    // لوحة الإدارة أصبحت صفحة مستقلة بعرض كامل
    showView('admin');
    void renderAdmin();
  });
  $('#saveName')?.addEventListener('click', () => void handleSaveName());

  renderTab();
  void renderLeaderboard();
}

/** محتوى التبويب المختار. */
function renderTab(): void {
  const box = $('#tabContent');
  if (!box) return;

  if (!account) {
    box.innerHTML = `<div style="font-size:12px;color:#8b8178">تعذّر الاتصال بالخادم. تحقق من إعدادات .env.</div>`;
    return;
  }

  if (!account.isAnonymous) {
    box.innerHTML = `
      <h3>حسابك مفعّل</h3>
      <p>${account.email ?? ''}</p>
      <button class="btn light" id="signOutBtn">تسجيل الخروج</button>
      <div class="notice" id="playerNotice"></div>
      <p style="font-size:10px;color:var(--muted);margin-top:12px">
        بعد الخروج تبدأ جلسة زائر جديدة. XP المحفوظة تبقى مع حسابك عند الدخول مرة أخرى.
      </p>`;
    $('#signOutBtn')?.addEventListener('click', () => void handleSignOut());
    return;
  }

  box.innerHTML = `
    <h3>أنت تلعب كزائر</h3>
    <p>أضف بريداً وكلمة مرور لتحفظ XP وسجل مبارياتك، وتبقى نقاطك الحالية كما هي.</p>
    <div class="field" style="margin-bottom:10px">
      <label for="displayName">اسمك المعروض (اختياري)</label>
      <input id="displayName" maxlength="16" value="${profile?.displayName ?? ''}" placeholder="مثال: سارة">
    </div>
    <div style="margin-bottom:14px">
      <button class="btn light" id="saveNameGuest" type="button">حفظ الاسم</button>
    </div>
    <div class="form-grid">
      <div class="field"><label for="playerEmail">البريد الإلكتروني</label><input id="playerEmail" type="email" placeholder="you@example.com"></div>
      <div class="field"><label for="playerPassword">كلمة المرور</label><input id="playerPassword" type="password" placeholder="8 أحرف على الأقل"></div>
    </div>
    <button class="btn" id="linkBtn">أنشئ حسابي واحفظ نقاطي</button>
    <button class="btn light" id="loginBtn" style="margin-inline-start:8px">لديّ حساب — دخول</button>
    <div class="notice" id="playerNotice"></div>`;

  const saveBtn = $('#saveNameGuest') ?? $('#saveName');
  saveBtn?.addEventListener('click', () => void handleSaveName());

  $('#linkBtn')?.addEventListener('click', () => void handleLink());
  $('#loginBtn')?.addEventListener('click', () => void handleLogin());
}

/** رسالة داخل التبويب. */
function notice(id: string, text: string, kind: 'success' | 'error'): void {
  const box = $(id);
  if (!box) return;
  box.className = 'notice show ' + kind;
  box.textContent = text;
}

/** قراءة الحقول المشتركة. */
function credentials(emailId: string, passwordId: string): { email: string; password: string } {
  return {
    email: ($<HTMLInputElement>(emailId)?.value ?? '').trim(),
    password: ($<HTMLInputElement>(passwordId)?.value ?? '').trim(),
  };
}

/** تحويل الجلسة المجهولة إلى حساب دائم (بلا فقدان XP). */
async function handleLink(): Promise<void> {
  if (busy) return;
  const { email, password } = credentials('#playerEmail', '#playerPassword');
  if (!email || password.length < 8) {
    notice('#playerNotice', 'أدخل بريداً صحيحاً وكلمة مرور من 8 أحرف على الأقل.', 'error');
    return;
  }

  busy = true;
  try {
    const result = await linkAccount(email, password);
    // حقل الاسم الاختياري (إن ظهر) يُحفظ فوراً حتى لا يبقى «لاعب» بدل «مستخدم»
    const typed = ($<HTMLInputElement>('#displayName')?.value ?? '').trim();
    if (typed) {
      try {
        await saveDisplayName(typed);
      } catch {
        // لا نعطّل إنشاء الحساب بسبب فشل حفظ الاسم
      }
    }
    await loadState();
    render();
    notice(
      '#playerNotice',
      result.needsConfirmation
        ? 'تم إنشاء الحساب. تحقق من بريدك لتأكيده، وستبقى نقاطك محفوظة.'
        : 'تم ربط حسابك بنجاح — نقاطك محفوظة الآن.',
      'success',
    );
  } catch (error) {
    notice('#playerNotice', error instanceof Error ? error.message : 'تعذّر إنشاء الحساب.', 'error');
  } finally {
    busy = false;
  }
}

/** دخول لحساب موجود (يستبدل جلسة الزائر). */
async function handleLogin(): Promise<void> {
  if (busy) return;
  const { email, password } = credentials('#playerEmail', '#playerPassword');
  if (!email || !password) {
    notice('#playerNotice', 'أدخل البريد وكلمة المرور.', 'error');
    return;
  }

  busy = true;
  try {
    await signIn(email, password);
    await loadState();
    render();
    toast('تم تسجيل الدخول');
  } catch (error) {
    notice('#playerNotice', error instanceof Error ? error.message : 'تعذّر الدخول.', 'error');
  } finally {
    busy = false;
  }
}

/** حفظ الاسم المعروض (XP غير قابل للتعديل). */
async function handleSaveName(): Promise<void> {
  const value = ($<HTMLInputElement>('#displayName')?.value ?? '').trim();
  if (value.length < 2) {
    toast('الاسم قصير جداً');
    return;
  }
  try {
    await saveDisplayName(value);
    await loadState();
    render();
    toast('تم حفظ الاسم');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'تعذّر الحفظ');
  }
}

/** خروج من الحساب. */
async function handleSignOut(): Promise<void> {
  try {
    await signOut();
    await loadState();
    render();
    toast('تم تسجيل الخروج');
  } catch {
    toast('تعذّر تسجيل الخروج');
  }
}

/** الترتيب الأسبوعي (يعمل بعد تشغيل رقعة SQL). */
async function renderLeaderboard(): Promise<void> {
  const box = $('#leaderboard');
  if (!box) return;

  const [rows, prizes, account] = await Promise.all([
    weeklyLeaderboard(10),
    listPublicPrizes(),
    getAccount(),
  ]);

  const myId = account?.id ?? '';
  const myIndex = rows.findIndex((r) => r.playerId === myId);
  const myRow = myIndex >= 0 ? rows[myIndex] : null;

  const medal = (place: number): string =>
    place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}.`;

  // جائزة موحّدة تظهر بجانب الترتيب (لا داخل كل صف)
  const prizesHtml = renderUnifiedPrize(prizes);

  const rowsHtml = rows.length
    ? rows
        .map((row) => {
          const isMe = row.playerId === myId;
          return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 10px;border-bottom:1px dashed #eee7df;border-radius:10px;${isMe ? 'background:#eef6fa;' : ''}">
            <span style="font-size:12px;display:flex;align-items:center;gap:6px;min-width:0">
              <span>${medal(row.place)}</span>
              <span style="${isMe ? 'font-weight:700;color:#2a7191' : ''}">${row.displayName}${isMe ? ' (أنت)' : ''}</span>
            </span>
            <strong style="font-size:12px;color:#2a7191;white-space:nowrap">${row.weekPoints}</strong>
          </div>`;
        })
        .join('')
    : `<div style="font-size:11px;color:var(--muted)">لا توجد نتائج لهذا الأسبوع بعد. العب أي مباراة أو لعبة من ألعاب سَنا لتظهر هنا باسمك.</div>`;

  // بطاقة «مركزك الحالي» — تظهر للاعب المسجّل الموجود في الترتيب
  let myCardHtml = '';
  if (myRow) {
    myCardHtml = `<div style="margin-top:12px;background:#2a7191;color:#fff;border-radius:14px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="display:flex;flex-direction:column;gap:2px">
          <span style="font-size:11px;opacity:.85">مركزك هذا الأسبوع</span>
          <strong style="font-size:15px">${medal(myRow.place)} ${myRow.displayName}</strong>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:700">${myRow.weekPoints}</div>
          <div style="font-size:10px;opacity:.8">نقطة</div>
        </div>
      </div>`;
  } else if (account && !account.isAnonymous) {
    myCardHtml = `<div style="margin-top:12px;font-size:11px;color:var(--muted);background:#f7f1e8;border-radius:12px;padding:10px 12px">لم تدخل الترتيب هذا الأسبوع بعد — العب مباراة لتظهر نتيجتك.</div>`;
  }

  box.innerHTML = prizesHtml + rowsHtml + myCardHtml;
}

/**
 * جائزة موحّدة واحدة تظهر بجانب الترتيب (تنطبق على المراكز الثلاثة الأولى).
 * لا تُكرَّر لكل مركز — نص واحد فقط.
 */
function renderUnifiedPrize(prizes: WeeklyPrize[]): string {
  const filled = prizes.filter((p) => p.title.trim());
  if (filled.length === 0) return '';
  // جائزة واحدة موحّدة: نأخذ أول نص محدد (الأولوية للمركز الأول ثم من يليه)
  const top = filled.find((p) => p.place === 1) ?? filled[0];
  const title = top.title.trim();
  const note = (top.note ?? '').trim();
  return `<div style="background:linear-gradient(180deg,#fff7ec,#fdf1e2);border:1px solid #f0e0cc;border-radius:14px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px">
    <div style="font-size:26px;line-height:1;flex:none">🎁</div>
    <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
      <span style="font-size:11px;color:#a8794f;font-weight:700">جائزة المراكز الثلاثة الأولى</span>
      <strong style="font-size:14px;color:var(--ink)">${title}${note ? ` — ${note}` : ''}</strong>
    </div>
  </div>`;
}

/** تهيئة صفحة الحساب (تُستدعى مرة من نقطة الدخول). */
export function initAccountView(): void {
  $('#navAccount')?.addEventListener('click', () => {
    void (async () => {
      await loadState();
      render();
    })();
  });

  // زر «لوحة الإدارة» في القائمة الجانبية → صفحة الإدارة المستقلة
  $('#navAdmin')?.addEventListener('click', () => {
    showView('admin');
    void renderAdmin();
  });
}