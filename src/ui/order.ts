/**
 * واجهة صفحة الانتظار:
 *  1. بطاقة «متابعة طلبك» (رقم الطلب + الخط الزمني + حالة الطلب).
 *  2. أدوات العرض التجريبي لمحاكاة حالة الطلب.
 *  3. التنقل بين «متابعة الطلب والألعاب» و«نقاط الولاء».
 *  4. نموذج مطالبة الولاء — واجهة فقط في هذه المرحلة (بلا خادم وبلا إضافة نقاط).
 *
 * ملاحظة: منطق الولاء هنا لن يضيف نقاطاً حقيقية؛ النظام الحقيقي يبقى في نظام
 * الولاء الموجود لدى صاحب المشروع، وسيُبنى تدفق المراجعة لاحقاً على الخادم
 * (منع تكرار الفاتورة + حدود المطالبات اليومية). عندها يُفصل هذا إلى ملف مستقل.
 */
import { $, $$, toast } from './dom.ts';
import { hasSupabase } from '../env.ts';
import { ensureSession } from '../net/supabase.ts';
import { listMenu, createExternalOrder, getExternalOrderStatus, fetchOrderStatus, type MenuItem } from '../net/admin.ts';
import { saveOrder, loadSavedOrder, subscribeToOrder, playReadySound, showLocalNotification, registerServiceWorker, canSubscribe } from '../net/push.ts';
import { openGame } from './game.ts';

type OrderStatus = 'preparing' | 'ready' | 'cancelled';

let pollTimer: number | undefined;

function markReady(orderNumber: string): void {
  document.title = '🎉 طلبك جاهز! — SANA';
  playReadySound();
  showLocalNotification({
    title: 'طلبك جاهز! 🎉',
    body: `طلبك #${orderNumber} أصبح جاهزاً للاستلام.`,
    url: './',
    orderNumber,
    tag: `sana-order-${orderNumber}`,
  });
  toast('🎉 طلبك جاهز! تفضل بالاستلام.');
  document.body.classList.add('order-ready');

  const readyMsg = $<HTMLElement>('#readyMessage');
  if (readyMsg) readyMsg.style.display = 'block';
}

async function pollOrderStatus(orderNumber: string): Promise<void> {
  if (!hasSupabase()) return;
  try {
    await ensureSession();

    // جرّب الخارجية أولاً (لها رقم 6 أرقام)، ثم الفاتورية (2-12 رقماً)
    let remote = await getExternalOrderStatus(orderNumber, '');

    if (!remote) {
      remote = await fetchOrderStatus(orderNumber);
    }

    if (!remote) return;

    const saved = loadSavedOrder();
    const prev = saved?.status ?? 'preparing';

    setStatus(remote as OrderStatus);

    if (remote === 'ready' && prev !== 'ready') {
      markReady(orderNumber);
      saveOrder(orderNumber, '', 'ready');
      window.clearInterval(pollTimer);
      return;
    }

    if (remote === 'cancelled') {
      saveOrder(orderNumber, '', 'cancelled');
      window.clearInterval(pollTimer);
      return;
    }

    saveOrder(orderNumber, '', remote);
  } catch { /* ignore — ستعيد المحاولة */ }
}

function startPolling(orderNumber: string): void {
  window.clearInterval(pollTimer);
  void pollOrderStatus(orderNumber);
  pollTimer = window.setInterval(() => {
    void pollOrderStatus(orderNumber);
  }, 15000);
}

/** يحدّث شارة الحالة والخط الزمني ورسالة الجاهزية في بطاقة الطلب. */
function setStatus(status: OrderStatus): void {
  const card = $('#orderCard');
  const badge = $('#statusBadge');
  const hint = $('#statusHint');
  const steps = $$<HTMLElement>('.step');
  const icons = $$<HTMLElement>('.step-icon');

  card?.classList.toggle('ready', status === 'ready');
  if (badge) badge.className = 'status' + (status === 'ready' ? ' ready' : '');

  if (status === 'ready') {
    if (badge) badge.textContent = 'جاهز للاستلام';
    if (hint) hint.textContent = 'تفضل إلى نقطة الاستلام';
    steps[0].className = 'step done';
    steps[1].className = 'step done';
    steps[2].className = 'step current';
    if (icons[1]) icons[1].textContent = '✓';
    if (icons[2]) icons[2].textContent = '✓';
  } else if (status === 'cancelled') {
    if (badge) badge.textContent = 'ملغي';
    if (hint) hint.textContent = 'تم إلغاء الطلب — تواصل مع الفريق';
    steps[0].className = 'step done';
    steps[1].className = 'step';
    steps[2].className = 'step';
    if (icons[1]) icons[1].textContent = '✕';
    if (icons[2]) icons[2].textContent = '✦';
  } else {
    if (badge) badge.textContent = 'قيد التحضير';
    if (hint) hint.textContent = 'يتم تجهيز طلبك الآن';
    steps[0].className = 'step done';
    steps[1].className = 'step current';
    steps[2].className = 'step';
    if (icons[1]) icons[1].textContent = '☕';
    if (icons[2]) icons[2].textContent = '✦';
  }
}

/** التبديل بين الصفحات: الرئيسية (متابعة+ألعاب)، المنيو/الطلب، ألعاب سَنا، الولاء، الحساب. */
export function showView(which: 'order' | 'menu' | 'sana' | 'loyalty' | 'account'): void {
  const isLoyalty = which === 'loyalty';
  const isAccount = which === 'account';
  const isOrder = which === 'order';
  const isMenu = which === 'menu';
  const isSana = which === 'sana';

  $('#homeView')?.classList.toggle('hidden', !isOrder);
  $('#menuView')?.classList.toggle('hidden', !isMenu);
  $('#sanaGamesView')?.classList.toggle('hidden', !isSana);
  $('#loyaltyView')?.classList.toggle('active', isLoyalty);
  $('#accountView')?.classList.toggle('active', isAccount);
  $('#navOrder')?.classList.toggle('active', isOrder || isMenu || isSana);
  $('#navLoyalty')?.classList.toggle('active', isLoyalty);
  $('#navAccount')?.classList.toggle('active', isAccount);
  if (isMenu) {
    // تحديده ضمن التمرير العلوي
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (isSana) {
    openGame('sanaGameArt', 'sana');
  }
}

export function showMenuView(): void {
  showView('menu');
  renderMenuGrid();
}

let menuItemsCache: MenuItem[] = [];
let menuLoaded = false;

/** شبكة منتجات مع صور قابلة للنقر (صفحة منفصلة). */
export function renderMenuGrid(): void {
  const grid = $('#menuGrid');
  const note = $('#menuNote');
  if (!grid) return;
  const paint = (): void => {
    grid.innerHTML = menuItemsCache.map((it) => `<button class="menu-card" data-menu-id="${escHtml(it.id)}" type="button">
      <span class="menu-img">${it.imageUrl ? `<img src="${escHtml(it.imageUrl)}" alt="${escHtml(it.name)}" loading="lazy">` : '☕'}</span>
      <span class="menu-name">${escHtml(it.name)}</span>
      <span class="menu-desc">${escHtml(it.description || '')}</span>
      <span class="menu-price">${it.price ? `${it.price} ر.س` : ''}${it.allergens?.length ? ` · يحتوي: ${it.allergens.join('، ')}` : ''}</span>
    </button>`).join('');
    if (note) note.textContent = menuItemsCache.length ? `${menuItemsCache.length} منتج — النقر يختار المنتج في النموذج.` : 'لا توجد منتجات بعد.';
  };
  if (menuLoaded) { paint(); return; }
  void listMenu().then((data) => {
    menuItemsCache = data;
    menuLoaded = true;
    paint();
  });
}

/** نموذج مطالبة الولاء التجريبي (تحقق في الواجهة فقط). */
function initLoyaltyForm(): void {
  $('#claimBtn')?.addEventListener('click', () => {
    const invoice = ($<HTMLInputElement>('#invoiceInput')?.value ?? '').trim();
    const phone = ($<HTMLInputElement>('#phoneInput')?.value ?? '').replace(/[\s-]/g, '');
    const notice = $('#claimNotice');
    if (!notice) return;

    notice.className = 'notice';

    if (!/^\d{3,14}$/.test(invoice) || !/^(05\d{8}|\+9665\d{8})$/.test(phone)) {
      notice.textContent = 'تحقق من رقم الفاتورة ورقم الجوال ثم حاول مرة أخرى.';
      notice.classList.add('show', 'error');
      return;
    }

    notice.textContent =
      'تم تسجيل طلب المراجعة التجريبي. في النظام الحقيقي سيصل الطلب إلى الموظف للتحقق من الفاتورة قبل إضافة النقاط.';
    notice.classList.add('show', 'success');

    const invoiceInput = $<HTMLInputElement>('#invoiceInput');
    const phoneInput = $<HTMLInputElement>('#phoneInput');
    if (invoiceInput) invoiceInput.value = '';
    if (phoneInput) phoneInput.value = '';
  });
}

/** تهيئة كل أحداث صفحة الانتظار. تُستدعى مرة واحدة من نقطة الدخول. */
export function initOrderView(): void {
  void registerServiceWorker();

  // استعادة طلب سابق (لو أغلق العميل وعاد)
  const saved = loadSavedOrder();
  const savedNum = $('#orderNumber');
  const savedInput = $<HTMLInputElement>('#orderInput');
  if (saved?.number) {
    if (savedNum) savedNum.textContent = saved.number;
    if (savedInput) savedInput.value = saved.number;
    if (saved.status === 'ready') markReady(saved.number);
    else startPolling(saved.number);
  }

  // عرض حالة الطلب بعد إدخال رقم الطلب (حقيقية إن كانت Supabase مضبوطة)
  $('#lookupBtn')?.addEventListener('click', async () => {
    const value = ($<HTMLInputElement>('#orderInput')?.value ?? '').trim();
    if (!/^\d{2,12}$/.test(value)) {
      toast('أدخل رقم طلب صحيحاً');
      return;
    }
    const orderNumber = $('#orderNumber');
    if (orderNumber) orderNumber.textContent = value;

    saveOrder(value, '', 'preparing');
    startPolling(value);

    // اشتراك Push (إن أمكن) حتى يصل الإشعار بعد الإغلاق
    if (canSubscribe()) {
      toast('جارٍ تفعيل الإشعارات…');
      const ok = await subscribeToOrder(value, '');
      toast(ok ? 'سيصلك إشعار عند الجاهزية حتى بعد إغلاق الصفحة ✅' : 'لم يُفعَّل الإشعار — ستُحدَّث الحالة تلقائياً كل 15 ثانية');
    }

    if (hasSupabase()) {
      try {
        await ensureSession();
        const remote = await getExternalOrderStatus(value, '');
        if (remote) {
          setStatus(remote as OrderStatus);
          if (remote === 'ready') markReady(value);
          toast(remote === 'ready' ? 'طلبك جاهز!' : remote === 'cancelled' ? 'الطلب ملغي' : 'طلبك قيد التحضير');
          return;
        }
        toast('لا يوجد طلب بهذا الرقم بعد');
        return;
      } catch {
        toast('تعذّر الاتصال — حالة تجريبية');
      }
    }
    toast('تم عرض حالة الطلب التجريبية');
  });

  initExternalOrderForm();

  // أدوات العرض التجريبي — لن تظهر في نظام الموظف الحقيقي
  $$<HTMLButtonElement>('[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const requested = btn.dataset.status;
      setStatus(requested === 'ready' ? 'ready' : 'preparing');
      toast(requested === 'ready' ? 'تمت محاكاة جاهزية الطلب' : 'تم تحديث حالة الطلب');
    });
  });

  // التنقل بين الصفحات المنفصلة
  $('#navOrder')?.addEventListener('click', () => showView('order'));
  $('#navLoyalty')?.addEventListener('click', () => showView('loyalty'));
  $('#navAccount')?.addEventListener('click', () => showView('account'));
  $('#sideGameBtn')?.addEventListener('click', () => showView('sana'));
  $('#goOrder')?.addEventListener('click', () => showMenuView());
  $('#goGames')?.addEventListener('click', () => showView('sana'));

  $('#menuGrid')?.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-menu-id]');
    if (!card?.dataset.menuId) return;
    const sel = $<HTMLSelectElement>('#extItem');
    if (!sel) return;
    sel.value = card.dataset.menuId;
    sel.dispatchEvent(new Event('change'));
    $('#menuGrid')?.querySelectorAll('.menu-card').forEach((c) => c.classList.toggle('selected', c === card));
    toast('تم اختيار المنتج — أكمل البيانات وأكّد الطلب');
    $('#externalOrderCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  initLoyaltyForm();
  initExternalOrderForm();
}

/** نموذج الطلب الخارجي: منيو + نوع (توصيل/استلام) + عنوان + موقع GPS + رابط خرائط. */
function initExternalOrderForm(): void {
  const btn = $('#externalOrderBtn');
  if (!btn) return;

  let items: MenuItem[] = [];
  void listMenu().then((data) => {
    items = data;
    renderMenuItems();
  });

  let lat: number | null = null;
  let lng: number | null = null;

  const renderMenuItems = (): void => {
    const select = $<HTMLSelectElement>('#extItem');
    if (!select) return;
    select.innerHTML = items
      .map((it) => `<option value="${it.id}" data-name="${escHtml(it.name)}" data-allergens="${escHtml((it.allergens ?? []).join('، '))}">${it.name}${it.allergens?.length ? ` — يحتوي: ${it.allergens.join('، ')}` : ''}</option>`)
      .join('');
    updateAllergenHint();
  };

  const updateAllergenHint = (): void => {
    const select = $<HTMLSelectElement>('#extItem');
    const hint = $('#extAllergenHint');
    if (!select || !hint) return;
    const opt = select.selectedOptions[0];
    const allergens = opt?.dataset.allergens ?? '';
    hint.textContent = allergens ? `⚠️ يحتوي على: ${allergens}` : 'لا تحتوي على مسببات حساسية معروفة.';
  };

  $('#extItem')?.addEventListener('change', updateAllergenHint);
  $('#extDeliveryType')?.addEventListener('change', () => {
    const type = ($<HTMLSelectElement>('#extDeliveryType')?.value ?? 'delivery');
    const addrBox = $<HTMLElement>('#extAddressBox');
    if (addrBox) addrBox.style.display = type === 'pickup' ? 'none' : '';
  });

  $('#locateBtn')?.addEventListener('click', () => {
    const status = $('#locateStatus');
    if (!navigator.geolocation) {
      if (status) status.textContent = 'المتصفح لا يدعم تحديد الموقع.';
      return;
    }
    if (status) status.textContent = 'جارٍ تحديد موقعك…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        const addr = $<HTMLInputElement>('#extAddress');
        const full = `${lat}, ${lng}`;
        if (addr && !addr.value.trim()) addr.value = full;
        if (status) status.textContent = `تم تحديد موقعك: ${full}`;
        // رابط خرائط تلقائي اختياري
        const maps = $<HTMLInputElement>('#extMaps');
        if (maps && !maps.value.trim()) maps.value = `https://www.google.com/maps?q=${lat},${lng}`;
      },
      () => {
        if (status) status.textContent = 'تعذّر تحديد الموقع — أدخل العنوان يدوياً.';
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });

  btn.addEventListener('click', async () => {
    const name = ($<HTMLInputElement>('#extName')?.value ?? '').trim() || 'مستخدم';
    const phone = ($<HTMLInputElement>('#extPhone')?.value ?? '').replace(/[\s-]/g, '');
    const qty = Math.min(Math.max(Number($<HTMLInputElement>('#extQty')?.value ?? 1), 1), 20);
    const type = ($<HTMLSelectElement>('#extDeliveryType')?.value ?? 'delivery') as 'delivery' | 'pickup';
    const address = ($<HTMLInputElement>('#extAddress')?.value ?? '').trim();
    const mapsUrl = ($<HTMLInputElement>('#extMaps')?.value ?? '').trim();
    const notes = ($<HTMLInputElement>('#extNotes')?.value ?? '').trim();

    const sel = $<HTMLSelectElement>('#extItem');
    const opt = sel?.selectedOptions[0];
    const itemName = opt?.dataset.name ?? (sel ? sel.value : '');
    const itemId = opt ? opt.value : null;

    if (!itemName) {
      note('اختر منتجاً من المنيو.');
      return;
    }
    if (!/^(05\d{8}|\+9665\d{8})$/.test(phone)) {
      note('رقم الجوال غير صحيح (05 + 8 أرقام).');
      return;
    }
    if (type === 'delivery' && !address) {
      note('للتوصيل اكتب العنوان أو اضغط «موقعي الحالي».');
      return;
    }
    if (mapsUrl && !/^https?:\/\//.test(mapsUrl)) {
      note('رابط الخرائط يجب أن يبدأ بـ https://');
      return;
    }

    if (!hasSupabase()) {
      note('Supabase غير مضبوط — الطلب يُحفظ محلياً كعرض تجريبي فقط.', 'success');
      toast('طلب تجريبي (لا يُرسل للخادم)');
      return;
    }

    try {
      await ensureSession();
      const result = await createExternalOrder({
        customerName: name,
        phone,
        itemId,
        itemName,
        quantity: qty,
        deliveryType: type,
        address,
        lat,
        lng,
        mapsUrl,
        notes,
      });
      note(`تم إنشاء طلبك! رقم الطلب: ${result.number} — احتفظ به للمتابعة.`, 'success');
      toast(`طلبك: ${result.number}`);
      const num = $('#orderNumber');
      if (num) num.textContent = result.number;
      saveOrder(result.number, phone, 'preparing');
      startPolling(result.number);
      if (canSubscribe()) {
        void subscribeToOrder(result.number, phone).then((ok) =>
          toast(ok ? 'سيصلك إشعار عند الجاهزية حتى بعد إغلاق الصفحة ✅' : 'الإشعارات غير مفعّلة — الحالة تُحدَّث تلقائياً كل 15 ثانية'),
        );
      }
    } catch (error) {
      note(error instanceof Error ? error.message : 'تعذّر إنشاء الطلب.');
    }
  });

  function note(msg: string, kind: 'success' | 'error' = 'error'): void {
    const el = $('#extNotice');
    if (!el) return;
    el.textContent = msg;
    el.className = 'notice show ' + kind;
  }
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

