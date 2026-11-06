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
import { hasSupabase } from '../env.ts';
import { ensureSession } from '../net/supabase.ts';
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
let tab: 'player' | 'admin' = 'player';
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
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn ${tab === 'player' ? '' : 'light'}" id="tabPlayer" style="flex:1">مستخدم</button>
        <button class="btn ${tab === 'admin' ? '' : 'light'}" id="tabAdmin" style="flex:1">الإدارة</button>
      </div>
      <div id="tabContent"></div>
    </div>
    <div class="card loyalty-form">
      <h3>الترتيب الأسبوعي</h3>
      <p>أفضل المستخدمين بنقاط هذا الأسبوع.</p>
      <div id="leaderboard"><div style="font-size:11px;color:var(--muted)">جارٍ التحميل…</div></div>
    </div>`;

  $('#tabPlayer')?.addEventListener('click', () => {
    tab = 'player';
    render();
  });
  $('#tabAdmin')?.addEventListener('click', () => {
    tab = 'admin';
    render();
  });
  $('#saveName')?.addEventListener('click', () => void handleSaveName());

  renderTab();
  void renderLeaderboard();
}

/** محتوى التبويب المختار. */
function renderTab(): void {
  const box = $('#tabContent');
  if (!box) return;

  if (tab === 'admin') {
    box.innerHTML = `<div style="font-size:11px;color:var(--muted)">جارٍ التحميل…</div>`;
    void renderAdmin();
    return;
  }

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
      <input id="displayName" maxlength="16" placeholder="مثال: سارة">
    </div>
    <div class="form-grid">
      <div class="field"><label for="playerEmail">البريد الإلكتروني</label><input id="playerEmail" type="email" placeholder="you@example.com"></div>
      <div class="field"><label for="playerPassword">كلمة المرور</label><input id="playerPassword" type="password" placeholder="8 أحرف على الأقل"></div>
    </div>
    <button class="btn" id="linkBtn">أنشئ حسابي واحفظ نقاطي</button>
    <button class="btn light" id="loginBtn" style="margin-inline-start:8px">لديّ حساب — دخول</button>
    <div class="notice" id="playerNotice"></div>`;

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

  const rows = await weeklyLeaderboard(20);
  if (rows.length === 0) {
    box.innerHTML = `<div style="font-size:11px;color:var(--muted)">لا توجد نتائج لهذا الأسبوع بعد. العب مباراة لتظهر هنا.</div>`;
    return;
  }

  box.innerHTML = rows
    .map(
      (row) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed #eee7df">
        <span style="font-size:12px">${
          row.place === 1 ? '🥇' : row.place === 2 ? '🥈' : row.place === 3 ? '🥉' : `${row.place}.`
        } ${row.displayName}</span>
        <strong style="font-size:12px;color:#2a7191">${row.weekPoints}</strong>
      </div>`,
    )
    .join('');
}

/** تهيئة صفحة الحساب (تُستدعى مرة من نقطة الدخول). */
export function initAccountView(): void {
  $('#navAccount')?.addEventListener('click', () => {
    void (async () => {
      await loadState();
      render();
    })();
  });
}