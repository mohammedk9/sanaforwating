/**
 * لوحة الإدارة — داخل تبويب «الإدارة» في صفحة الحساب.
 * تتطلب تسجيل موظف + تشغيل migrations/0004_admin.sql + إضافة الحساب إلى staff_members.
 */
import { $, toast } from './dom.ts';
import { hasSupabase } from '../env.ts';
import { signIn, signOut } from '../net/account.ts';
import { isStaff, listQuestions, setOrderStatus, upsertQuestion, deleteQuestion, setQuestionActive, listAdminMenu, upsertMenuItem, deleteMenuItem, listExternalOrders, setExternalStatus, esc, type OrderStatus, type MenuItem, type ExternalOrder } from '../net/admin.ts';

import { listArtworks, deleteArtwork, artworkCardHtml } from '../net/artwork.ts';

let questions: Awaited<ReturnType<typeof listQuestions>> = [];
let menuItems: MenuItem[] = [];
let extOrders: ExternalOrder[] = [];
let artworksCache: Awaited<ReturnType<typeof listArtworks>> = []; // للعرض
let section: 'order' | 'questions' | 'menu' | 'extOrders' | 'artworks' = 'order';

function notice(id: string, msg: string, kind: 'success' | 'error' = 'error'): void {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show', kind);
}

export async function renderAdmin(): Promise<void> {
  const box = $('#tabContent');
  if (!box) return;

  if (!hasSupabase()) {
    box.innerHTML = `<div style="font-size:12px">إعدادات Supabase غير مكتملة (.env). لا يمكن فتح لوحة الإدارة.</div>`;
    return;
  }

  const staff = await isStaff();
  if (!staff) {
    box.innerHTML = `
      <h3>دخول الإدارة</h3>
      <p>مخصّص لموظفي المحل. يتم التحقق من صلاحية الموظف على الخادم قبل أي إجراء.</p>
      <div class="form-grid">
        <div class="field"><label for="adminEmail">البريد الإلكتروني</label><input id="adminEmail" type="email" placeholder="name@cafe.com"></div>
        <div class="field"><label for="adminPassword">كلمة المرور</label><input id="adminPassword" type="password" placeholder="••••••••"></div>
      </div>
      <button class="btn" id="adminLogin">دخول الإدارة</button>
      <div class="notice" id="adminNotice"></div>
      <p style="font-size:10px;color:var(--muted);margin-top:12px">
        إن ظهرت لك رسالة «ليس لديك صلاحية»، أضِف حسابك في Supabase ← جدول staff_members ← user_id = معرّف حسابك.
      </p>`;
    $('#adminLogin')?.addEventListener('click', () => void handleAdminLogin());
    return;
  }

  questions = await listQuestions().catch(() => []);
  menuItems = await listAdminMenu().catch(() => []);
  extOrders = await listExternalOrders().catch(() => []);
  artworksCache = await listArtworks().catch(() => []);
  box.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn ${section === 'order' ? '' : 'light'}" id="secOrder" style="flex:1">حالة الطلب</button>
      <button class="btn ${section === 'questions' ? '' : 'light'}" id="secQuestions" style="flex:1">الأسئلة (${questions.length})</button>
      <button class="btn ${section === 'menu' ? '' : 'light'}" id="secMenu" style="flex:1">المنيو (${menuItems.length})</button>
      <button class="btn ${section === 'extOrders' ? '' : 'light'}" id="secExtOrders" style="flex:1">طلبات خارجية (${extOrders.length})</button>
      <button class="btn ${section === 'artworks' ? '' : 'light'}" id="secArtworks" style="flex:1">الرسومات (${artworksCache.length})</button>
      <button class="btn outline" id="adminLogout">خروج</button>
    </div>
    <div id="adminBody"></div>`;

  $('#secOrder')?.addEventListener('click', () => {
    section = 'order';
    void renderAdmin();
  });
  $('#secQuestions')?.addEventListener('click', () => {
    section = 'questions';
    void renderAdmin();
  });
  $('#secMenu')?.addEventListener('click', () => {
    section = 'menu';
    void renderAdmin();
  });
  $('#secExtOrders')?.addEventListener('click', () => {
    section = 'extOrders';
    void renderAdmin();
  });
  $('#secArtworks')?.addEventListener('click', () => {
    section = 'artworks';
    void renderAdmin();
  });
  $('#adminLogout')?.addEventListener('click', () => {
    void signOut().then(() => void renderAdmin());
    toast('تم تسجيل الخروج');
  });

  if (section === 'order') renderOrderSection();
  else if (section === 'menu') renderMenuSection();
  else if (section === 'extOrders') renderExtOrdersSection();
  else if (section === 'artworks') renderArtworksSection();
  else renderQuestionsSection();
}

function renderArtworksSection(): void {
  const body = $('#adminBody');
  if (!body) return;
  const rows = artworksCache.map((a) => artworkCardHtml(a, true)).join('');
  body.innerHTML = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px">${artworksCache.length} رسمة — زر الحذف متاح لك كأدمن.</div>
    <div class="art-gallery">${rows || '<p class="art-empty">لا توجد رسومات.</p>'}</div>
    <div class="notice" id="adminNotice"></div>`;
  body.querySelectorAll<HTMLElement>('[data-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.dataset.del;
      if (!id || !window.confirm('حذف هذه الصورة نهائياً؟')) return;
      try {
        await deleteArtwork(id);
        toast('تم حذف الصورة');
        await renderAdmin();
      } catch (error) {
        notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر الحذف.');
      }
    });
  });
}

async function handleAdminLogin(): Promise<void> {
  const email = ($<HTMLInputElement>('#adminEmail')?.value ?? '').trim();
  const password = ($<HTMLInputElement>('#adminPassword')?.value ?? '').trim();
  if (!email || !password) {
    notice('#adminNotice', 'أدخل البريد وكلمة المرور.');
    return;
  }
  try {
    await signIn(email, password);
    const staff = await isStaff();
    if (!staff) {
      notice('#adminNotice', 'تم الدخول لكن هذا الحساب ليس موظفاً. أضِفه إلى staff_members.');
      return;
    }
    toast('مرحباً بك في لوحة الإدارة');
    await renderAdmin();
  } catch (error) {
    notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر الدخول.');
  }
}

function renderOrderSection(): void {
  const body = $('#adminBody');
  if (!body) return;
  body.innerHTML = `
    <div class="field" style="margin-bottom:10px">
      <label for="orderNum">رقم الطلب (رقم الفاتورة)</label>
      <input id="orderNum" inputmode="numeric" placeholder="مثال: 890">
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <button class="btn" data-order-status="preparing">قيد التحضير</button>
      <button class="btn light" data-order-status="ready">جاهز للاستلام</button>
      <button class="btn outline" data-order-status="cancelled">ملغي</button>
    </div>
    <div class="notice" id="adminNotice"></div>
    <p style="font-size:10px;color:var(--muted)">تُحفظ الحالة على الخادم ويراها العميل عند إدخال نفس الرقم في «متابعة طلبك».</p>`;

  body.querySelectorAll<HTMLButtonElement>('[data-order-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const num = ($<HTMLInputElement>('#orderNum')?.value ?? '').trim();
      if (!/^\d{2,12}$/.test(num)) {
        notice('#adminNotice', 'أدخل رقم طلب صحيحاً (2–12 رقماً).');
        return;
      }
      try {
        await setOrderStatus(num, btn.dataset.orderStatus as OrderStatus);
        notice('#adminNotice', `تم تحديث الطلب ${num} إلى: ${label(btn.dataset.orderStatus)}`, 'success');
        toast('تم تحديث حالة الطلب');
      } catch (error) {
        notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر التحديث.');
      }
    });
  });
}

const label = (s?: string): string =>
  s === 'ready' ? 'جاهز للاستلام' : s === 'cancelled' ? 'ملغي' : 'قيد التحضير';


function renderQuestionsSection(): void {
  const body = $('#adminBody');
  if (!body) return;

  const rows = questions
    .map(
      (q) => `
      <div style="border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:8px;background:#fffdfa">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
          <strong style="font-size:12px;flex:1">${esc(q.prompt)}</strong>
          <span style="font-size:10px;color:${q.active ? '#2a7191' : '#a65448'}">${q.active ? '● نشط' : '○ معطّل'}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);margin:4px 0">
          الإجابة الصحيحة: <b>${esc(q.choices[q.correctIndex] ?? '')}</b> · ${esc(q.mode)} · ${esc(q.difficulty)} · ${esc(q.category || 'بدون تصنيف')}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <button class="btn light" data-edit="${q.id}">تعديل</button>
          <button class="btn light" data-toggle="${q.id}">${q.active ? 'تعطيل' : 'تفعيل'}</button>
          <button class="btn outline" data-del="${q.id}">حذف</button>
        </div>
      </div>`,
    )
    .join('');

  body.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
      <button class="btn" id="addQ">+ إضافة سؤال جديد</button>
      <span style="font-size:11px;color:var(--muted)">${questions.length} سؤالاً · النشطة تظهر في اللعب الجماعي</span>
    </div>
    <div id="qForm"></div>
    ${rows || '<div style="font-size:11px;color:var(--muted)">لا توجد أسئلة بعد.</div>'}
    <div class="notice" id="adminNotice"></div>`;

  $('#addQ')?.addEventListener('click', () => showQuestionForm(null));

  body.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) => {
    b.addEventListener('click', () => {
      const q = questions.find((x) => x.id === b.dataset.edit);
      if (q) showQuestionForm(q);
    });
  });
  body.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) => {
    b.addEventListener('click', async () => {
      const q = questions.find((x) => x.id === b.dataset.toggle);
      if (!q) return;
      try {
        await setQuestionActive(q.id, !q.active);
        toast(q.active ? 'تم تعطيل السؤال' : 'تم تفعيل السؤال');
        await renderAdmin();
      } catch (error) {
        notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر التغيير.');
      }
    });
  });
  body.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!b.dataset.del || !window.confirm('حذف هذا السؤال نهائياً؟')) return;
      try {
        await deleteQuestion(b.dataset.del);
        toast('تم حذف السؤال');
        await renderAdmin();
      } catch (error) {
        notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر الحذف.');
      }
    });
  });
}


function showQuestionForm(q: Awaited<ReturnType<typeof listQuestions>>[number] | null): void {
  const form = $('#qForm');
  if (!form) return;
  const choices = q?.choices ?? ['', '', '', ''];
  form.innerHTML = `
    <div style="border:1px dashed var(--line);border-radius:14px;padding:12px;margin-bottom:12px;background:#fcf9f4">
      <strong style="font-size:12px">${q ? 'تعديل سؤال' : 'سؤال جديد'}</strong>
      <div class="field" style="margin-top:8px"><label>نص السؤال</label><input id="qPrompt" value="${esc(q?.prompt ?? '')}" placeholder="اكتب السؤال"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <div class="field"><label>الخيار 1</label><input id="qA0" value="${esc(choices[0] ?? '')}"></div>
        <div class="field"><label>الخيار 2</label><input id="qA1" value="${esc(choices[1] ?? '')}"></div>
        <div class="field"><label>الخيار 3</label><input id="qA2" value="${esc(choices[2] ?? '')}"></div>
        <div class="field"><label>الخيار 4</label><input id="qA3" value="${esc(choices[3] ?? '')}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <div class="field"><label>رقم الإجابة الصحيحة (1–4)</label><input id="qCorrect" type="number" min="1" max="4" value="${(q?.correctIndex ?? 0) + 1}"></div>
        <div class="field"><label>النمط</label>
          <select id="qMode" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;font:inherit">
            <option value="solo" ${q?.mode === 'solo' ? 'selected' : ''}>solo (فردي)</option>
            <option value="team" ${q?.mode === 'team' ? 'selected' : ''}>team (فرق)</option>
            <option value="any" ${q?.mode === 'any' || !q ? 'selected' : ''}>any (الكل)</option>
          </select>
        </div>
        <div class="field"><label>الصعوبة</label>
          <select id="qDiff" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:12px;font:inherit">
            <option value="easy" ${q?.difficulty === 'easy' ? 'selected' : ''}>easy</option>
            <option value="medium" ${q?.difficulty === 'medium' || !q ? 'selected' : ''}>medium</option>
            <option value="hard" ${q?.difficulty === 'hard' ? 'selected' : ''}>hard</option>
          </select>
        </div>
        <div class="field"><label>التصنيف</label><input id="qCat" value="${esc(q?.category ?? '')}" placeholder="علوم / تاريخ / فضاء…"></div>
      </div>
      <div class="field" style="margin-top:8px"><label>شرح الإجابة</label><input id="qEx" value="${esc(q?.explanation ?? '')}" placeholder="يظهر بعد الإجابة"></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-top:8px">
        <input id="qActive" type="checkbox" ${q?.active === false ? '' : 'checked'}> سؤال نشط
      </label>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn" id="saveQ">حفظ</button>
        <button class="btn light" id="cancelQ">إلغاء</button>
      </div>
    </div>`;

  $('#cancelQ')?.addEventListener('click', () => (form.innerHTML = ''));
  $('#saveQ')?.addEventListener('click', async () => {
    const prompt = ($<HTMLInputElement>('#qPrompt')?.value ?? '').trim();
    const choices = [0, 1, 2, 3].map((i) => ($<HTMLInputElement>(`#qA${i}`)?.value ?? '').trim()).filter(Boolean);
    const correct = Math.min(Math.max(Number(($<HTMLInputElement>('#qCorrect')?.value ?? '1')) - 1, 0), Math.max(choices.length - 1, 0));
    if (!prompt || choices.length < 2) {
      notice('#adminNotice', 'أدخل السؤال و2 خيارات على الأقل.');
      return;
    }
    try {
      await upsertQuestion({
        id: q?.id ?? null,
        prompt,
        choices,
        correctIndex: correct,
        explanation: ($<HTMLInputElement>('#qEx')?.value ?? '').trim(),
        mode: ($<HTMLSelectElement>('#qMode')?.value ?? 'any'),
        category: ($<HTMLInputElement>('#qCat')?.value ?? '').trim(),
        difficulty: ($<HTMLSelectElement>('#qDiff')?.value ?? 'medium'),
        active: ($<HTMLInputElement>('#qActive')?.checked ?? true),
      });
      toast(q ? 'تم تحديث السؤال' : 'تمت إضافة السؤال');
      await renderAdmin();
    } catch (error) {
      notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر الحفظ.');
    }
  });
}

function renderMenuSection(): void {
  const body = $('#adminBody');
  if (!body) return;

  const rows = menuItems.map((m) => `
    <div style="display:flex;gap:10px;border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:8px;background:#fffdfa;align-items:center">
      ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:10px;flex:none">` : `<div style="width:52px;height:52px;border-radius:10px;background:#f3eee6;display:grid;place-items:center;flex:none;font-size:18px">☕</div>`}
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
          <strong style="font-size:12px">${esc(m.name)}</strong>
          <span style="font-size:10px;color:${m.active ? '#2a7191' : '#a65448'}">${m.active ? '● نشط' : '○ معطّل'}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);margin:2px 0">${esc(m.description || '')}</div>
        <div style="font-size:11px;color:var(--muted)">السعر: ${m.price} ر.س${m.allergens?.length ? ` · يحتوي: ${m.allergens.map((a) => esc(a)).join('، ')}` : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <button class="btn light" data-medit="${m.id}">تعديل</button>
          <button class="btn outline" data-mdel="${m.id}">حذف</button>
        </div>
      </div>
    </div>`).join('');

  body.innerHTML = `
    <button class="btn" id="addItem" style="margin-bottom:10px">+ إضافة منتج للمنيو</button>
    <div id="mForm"></div>
    ${rows || '<div style="font-size:11px;color:var(--muted)">لا توجد منتجات بعد.</div>'}
    <div class="notice" id="adminNotice"></div>`;

  $('#addItem')?.addEventListener('click', () => showMenuForm(null));

  body.querySelectorAll<HTMLButtonElement>('[data-medit]').forEach((b) => {
    b.addEventListener('click', () => {
      const item = menuItems.find((x) => x.id === b.dataset.medit);
      if (item) showMenuForm(item);
    });
  });
  body.querySelectorAll<HTMLButtonElement>('[data-mdel]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!b.dataset.mdel || !window.confirm('حذف هذا المنتج من المنيو نهائياً؟')) return;
      try {
        await deleteMenuItem(b.dataset.mdel);
        toast('تم حذف المنتج');
        await renderAdmin();
      } catch (error) {
        notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر الحذف.');
      }
    });
  });
}

function showMenuForm(item: MenuItem | null): void {
  const form = $('#mForm');
  if (!form) return;
  form.innerHTML = `
    <div style="border:1px dashed var(--line);border-radius:14px;padding:12px;margin-bottom:12px;background:#fcf9f4">
      <strong style="font-size:12px">${item ? 'تعديل منتج' : 'منتج جديد'}</strong>
      <div class="field" style="margin-top:8px"><label>اسم المنتج</label><input id="mName" value="${esc(item?.name ?? '')}" placeholder="قهوة عربية أصيلة"></div>
      <div class="field" style="margin-top:8px"><label>رابط الصورة (https://…)</label><input id="mImage" dir="ltr" value="${esc(item?.imageUrl ?? '')}" placeholder="https://…"></div>
      <div class="field" style="margin-top:8px"><label>الوصف</label><input id="mDesc" value="${esc(item?.description ?? '')}" placeholder="وصف قصير"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <div class="field"><label>السعر (ر.س)</label><input id="mPrice" type="number" min="0" step="0.5" value="${item?.price ?? 0}"></div>
        <div class="field"><label>ترتيب العرض</label><input id="mSort" type="number" min="0" value="${item?.sortOrder ?? 0}"></div>
      </div>
      <div class="field" style="margin-top:8px"><label>مسببات الحساسية (مفصولة بفاصلة ،)</label><input id="mAllergens" value="${esc((item?.allergens ?? []).join('، '))}" placeholder="جلوتين، ألبان، مكسرات"></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-top:8px">
        <input id="mActive" type="checkbox" ${item?.active === false ? '' : 'checked'}> منتج نشط (يظهر للعميل)
      </label>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn" id="saveM">حفظ</button>
        <button class="btn light" id="cancelM">إلغاء</button>
      </div>
    </div>`;

  $('#cancelM')?.addEventListener('click', () => (form.innerHTML = ''));
  $('#saveM')?.addEventListener('click', async () => {
    const name = ($<HTMLInputElement>('#mName')?.value ?? '').trim();
    const imageUrl = ($<HTMLInputElement>('#mImage')?.value ?? '').trim();
    const price = Number(($<HTMLInputElement>('#mPrice')?.value ?? '0'));
    const sortOrder = Number(($<HTMLInputElement>('#mSort')?.value ?? '0'));
    const allergens = ($<HTMLInputElement>('#mAllergens')?.value ?? '').split(/[،,]/).map((s) => s.trim()).filter(Boolean);
    if (!name) {
      notice('#adminNotice', 'اسم المنتج فارغ.');
      return;
    }
    if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
      notice('#adminNotice', 'رابط الصورة يجب أن يبدأ بـ https://');
      return;
    }
    try {
      await upsertMenuItem({
        id: item?.id ?? null,
        name,
        imageUrl,
        allergens,
        price: Number.isFinite(price) && price > 0 ? price : 0,
        description: ($<HTMLInputElement>('#mDesc')?.value ?? '').trim(),
        active: ($<HTMLInputElement>('#mActive')?.checked ?? true),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      });
      toast(item ? 'تم تحديث المنتج' : 'تمت إضافة المنتج');
      await renderAdmin();
    } catch (error) {
      notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر الحفظ.');
    }
  });
}


function renderExtOrdersSection(): void {
  const body = $('#adminBody');
  if (!body) return;

  const rows = extOrders.map((o) => `
    <div style="border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:8px;background:#fffdfa">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
        <strong style="font-size:12px">طلب #${esc(o.number)} — ${esc(o.itemName)} × ${o.quantity}</strong>
        <span style="font-size:10px;color:${o.status === 'ready' ? '#2a7191' : o.status === 'delivered' ? '#476b56' : o.status === 'cancelled' ? '#a65448' : '#a8794f'}">${statusLabel(o.status)}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin:4px 0">
        ${esc(o.customerName)} · ${esc(o.phone)} · ${o.deliveryType === 'pickup' ? 'استلام من المحل' : 'توصيل'} · ${new Date(o.createdAt).toLocaleString('ar-SA')}
      </div>
      ${o.address ? `<div style="font-size:11px;margin:2px 0">📍 ${esc(o.address)}${o.lat && o.lng ? ` <a href="https://www.google.com/maps?q=${o.lat},${o.lng}" target="_blank" rel="noopener">(خريطة)</a>` : ''}</div>` : ''}
      ${o.mapsUrl ? `<div style="font-size:11px;margin:2px 0">🔗 <a href="${esc(o.mapsUrl)}" target="_blank" rel="noopener">رابط الخرائط</a></div>` : ''}
      ${o.notes ? `<div style="font-size:11px;margin:2px 0;color:#8a684b">📝 ${esc(o.notes)}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        <button class="btn light" data-ext-status="preparing" data-num="${o.number}">قيد التحضير</button>
        <button class="btn light" data-ext-status="ready" data-num="${o.number}">جاهز</button>
        <button class="btn light" data-ext-status="delivered" data-num="${o.number}">تم التوصيل</button>
        <button class="btn outline" data-ext-status="cancelled" data-num="${o.number}">ملغي</button>
      </div>
    </div>`).join('');

  body.innerHTML = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px">${extOrders.length} طلب خارجي — الأحدث أولاً.</div>
    ${rows || '<div style="font-size:11px;color:var(--muted)">لا توجد طلبات خارجية بعد.</div>'}
    <div class="notice" id="adminNotice"></div>`;

  body.querySelectorAll<HTMLButtonElement>('[data-ext-status]').forEach((b) => {
    b.addEventListener('click', async () => {
      const num = b.dataset.num ?? '';
      const status = b.dataset.extStatus as ExternalOrder['status'];
      if (!num || !status) return;
      try {
        await setExternalStatus(num, status);
        toast(`طلب ${num}: ${statusLabel(status)}`);
        await renderAdmin();
      } catch (error) {
        notice('#adminNotice', error instanceof Error ? error.message : 'تعذّر التحديث.');
      }
    });
  });
}

const statusLabel = (s: string): string =>
  s === 'ready' ? 'جاهز' : s === 'delivered' ? 'تم التوصيل' : s === 'cancelled' ? 'ملغي' : 'قيد التحضير';


