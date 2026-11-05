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

type OrderStatus = 'preparing' | 'ready';

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

/** التبديل بين «متابعة الطلب» و«نقاط الولاء» و«الحساب». */
export function showView(which: 'order' | 'loyalty' | 'account'): void {
  const isLoyalty = which === 'loyalty';
  const isAccount = which === 'account';
  const isOrder = which === 'order';

  $('#homeView')?.classList.toggle('hidden', !isOrder);
  $('#loyaltyView')?.classList.toggle('active', isLoyalty);
  $('#accountView')?.classList.toggle('active', isAccount);
  $('#navOrder')?.classList.toggle('active', isOrder);
  $('#navLoyalty')?.classList.toggle('active', isLoyalty);
  $('#navAccount')?.classList.toggle('active', isAccount);
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  // عرض حالة الطلب بعد إدخال رقم الطلب
  $('#lookupBtn')?.addEventListener('click', () => {
    const value = ($<HTMLInputElement>('#orderInput')?.value ?? '').trim();
    if (!/^\d{2,12}$/.test(value)) {
      toast('أدخل رقم طلب صحيحاً');
      return;
    }
    const orderNumber = $('#orderNumber');
    if (orderNumber) orderNumber.textContent = value;
    toast('تم عرض حالة الطلب التجريبية');
  });

  // أدوات العرض التجريبي — لن تظهر في نظام الموظف الحقيقي
  $$<HTMLButtonElement>('[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const requested = btn.dataset.status;
      setStatus(requested === 'ready' ? 'ready' : 'preparing');
      toast(requested === 'ready' ? 'تمت محاكاة جاهزية الطلب' : 'تم تحديث حالة الطلب');
    });
  });

  // التنقل
  $('#navOrder')?.addEventListener('click', () => showView('order'));
  $('#navLoyalty')?.addEventListener('click', () => showView('loyalty'));
  $('#navAccount')?.addEventListener('click', () => showView('account'));
  $('#sideGameBtn')?.addEventListener('click', () => {
    showView('order');
    $('.games-head')?.scrollIntoView({ behavior: 'smooth' });
  });

  initLoyaltyForm();
}
