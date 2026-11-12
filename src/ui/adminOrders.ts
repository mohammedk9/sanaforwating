/**
 * شاشات إدارة الطلبات (0009):
 *  - الطلبات الحالية (orders) مع تغيير الحالة
 *  - الطلبات الخارجية مع عناصر السلة كاملة
 *  - بحث وفلترة بالحالة
 *  - سجل تغير الحالات
 *  - إدارة الموظفين (للمدير)
 *  - إحصاءات سريعة
 * كل البيانات تقرأ عبر RPC محمية على الخادم.
 */
import { $, toast } from './dom.ts';
import {
  adminStats,
  addStaff,
  listAudit,
  listExternalOrders,
  listInternalOrders,
  listStaff,
  removeStaff,
  setExternalStatus,
  setOrderStatus,
  type AdminStats,
  type AuditRow,
  type ExternalOrder,
  type InternalOrder,
  type StaffRow,
} from '../net/admin.ts';

export type OrderishStatus = 'preparing' | 'ready' | 'cancelled' | 'delivered';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const STATUSES: Array<{ key: OrderishStatus; label: string }> = [
  { key: 'preparing', label: 'قيد التحضير' },
  { key: 'ready', label: 'جاهز' },
  { key: 'delivered', label: 'تم التسليم' },
  { key: 'cancelled', label: 'ملغي' },
];

export function statusLabel(status: string): string {
  return STATUSES.find((s) => s.key === status)?.label ?? status;
}

const statusColor = (status: string): string =>
  status === 'ready'
    ? '#2a7191'
    : status === 'delivered'
      ? '#476b56'
      : status === 'cancelled'
        ? '#a65448'
        : '#a8794f';

const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ar-SA');
};

const maskPhone = (phone: string): string =>
  phone.length >= 6 ? phone.slice(0, 4) + '••••' + phone.slice(-2) : phone;

let showPhones = false;
try { showPhones = localStorage.getItem('sana.admin.showPhones') === '1'; } catch { showPhones = false; }

const phonesVisible = (): boolean => showPhones;

function phoneCell(phone: string): string {
  return `<span dir="ltr">${esc(phonesVisible() ? phone : maskPhone(phone))}</span>`;
}

function toolbar(opts: { status: string; search: string; placeholder: string }): string {
  const options = [
    { key: '', label: 'الكل' },
    ...STATUSES.map((s) => ({ key: s.key as string, label: s.label })),
  ]
    .map(
      (o) =>
        `<option value="${o.key}" ${opts.status === o.key ? 'selected' : ''}>${esc(o.label)}</option>`,
    )
    .join('');
  return `
    <div class="admin-toolbar">
      <input id="adminSearch" placeholder="${esc(opts.placeholder)}" value="${esc(opts.search)}">
      <select id="adminFilter">${options}</select>
      <button class="btn light" id="adminReload" type="button">تحديث</button>
      <button class="btn light" id="adminPhoneToggle" type="button">${phonesVisible() ? '🙈 إخفاء الأرقام' : '👁 إظهار الأرقام'}</button>
    </div>`;
}

function bindToolbar(onChange: (status: string, search: string) => void): void {
  const search = $<HTMLInputElement>('#adminSearch');
  const filter = $<HTMLSelectElement>('#adminFilter');
  const reload = $<HTMLButtonElement>('#adminReload');
  const toggle = $<HTMLButtonElement>('#adminPhoneToggle');

  const emit = (): void => onChange(filter?.value ?? '', search?.value.trim() ?? '');

  let timer: number | undefined;
  search?.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(emit, 350);
  });
  filter?.addEventListener('change', emit);
  reload?.addEventListener('click', emit);
  toggle?.addEventListener('click', () => {
    showPhones = !showPhones;
    try { localStorage.setItem('sana.admin.showPhones', showPhones ? '1' : '0'); } catch { /* ignore */ }
    emit();
  });
}

function busy(btn: HTMLButtonElement, on: boolean, label?: string): void {
  btn.disabled = on;
  if (on) {
    btn.dataset.label = btn.textContent ?? '';
    btn.textContent = label ?? 'جار…';
    btn.style.opacity = '.6';
  } else {
    btn.textContent = btn.dataset.label ?? btn.textContent;
    btn.style.opacity = '';
  }
}

function statusBtns(current: string, attr: string, num: string): string {
  return STATUSES.map(
    (s) =>
      `<button class="btn ${s.key === current ? '' : 'light'}" ${attr}="${s.key}" data-num="${esc(num)}" ${s.key === current ? 'disabled' : ''}>${esc(s.label)}</button>`,
  ).join('');
}

/* ===================== الطلبات الحالية (orders) ===================== */

export async function renderOrdersSection(refresh: () => Promise<void>): Promise<void> {
  const body = $('#adminBody');
  if (!body) return;

  let status = '';
  let search = '';

  const paint = async (): Promise<void> => {
    body.innerHTML =
      toolbar({ status, search, placeholder: 'بحث برقم الطلب' }) +
      '<div id="adminList"><p class="admin-empty">جار التحميل…</p></div>' +
      '<div class="notice" id="adminNotice"></div>';
    bindToolbar((s, q) => {
      status = s;
      search = q;
      void paint();
    });

    const list = $<HTMLElement>('#adminList');
    if (!list) return;

    let orders: InternalOrder[] = [];
    try {
      orders = await listInternalOrders({ status, search });
    } catch (error) {
      list.innerHTML = `<p class="admin-empty">${esc(error instanceof Error ? error.message : 'تعذر تحميل الطلبات')}</p>`;
      return;
    }

    if (!orders.length) {
      list.innerHTML = '<p class="admin-empty">لا توجد طلبات مطابقة.</p>';
      return;
    }

    list.innerHTML = orders
      .map(
        (o) => `
        <div class="admin-row">
          <div class="admin-row-head">
            <strong>#${esc(o.number)}</strong>
            <span class="chip" style="color:${statusColor(o.status)}">${esc(statusLabel(o.status))}</span>
          </div>
          <div class="admin-row-meta">آخر تحديث: ${esc(fmtDate(o.updatedAt || o.createdAt))}</div>
          <div class="admin-row-actions">${statusBtns(o.status, 'data-order-status', o.number)}</div>
        </div>`,
      )
      .join('');

    list.querySelectorAll<HTMLButtonElement>('[data-order-status]').forEach((b) => {
      b.addEventListener('click', () => {
        const num = b.dataset.num ?? '';
        const next = b.dataset.orderStatus as OrderishStatus | undefined;
        if (!num || !next) return;
        busy(b, true);
        void setOrderStatus(num, next)
          .then(() => {
            toast(`الطلب ${num}: ${statusLabel(next)}`);
            return refresh();
          })
          .catch((error: unknown) => {
            busy(b, false);
            toast(error instanceof Error ? error.message : 'تعذر تحديث الطلب');
          });
      });
    });
  };

  await paint();
}

/* ===================== الطلبات الخارجية (السلة كاملة) ===================== */

export async function renderExtOrdersSection(refresh: () => Promise<void>): Promise<void> {
  const body = $('#adminBody');
  if (!body) return;

  let status = '';
  let search = '';

  const paint = async (): Promise<void> => {
    body.innerHTML =
      toolbar({ status, search, placeholder: 'بحث برقم الطلب أو الجوال أو الاسم' }) +
      '<div id="adminList"><p class="admin-empty">جار التحميل…</p></div>' +
      '<div class="notice" id="adminNotice"></div>';
    bindToolbar((s, q) => {
      status = s;
      search = q;
      void paint();
    });

    const list = $<HTMLElement>('#adminList');
    if (!list) return;

    let orders: ExternalOrder[] = [];
    try {
      orders = await listExternalOrders({ status, search });
    } catch (error) {
      list.innerHTML = `<p class="admin-empty">${esc(error instanceof Error ? error.message : 'تعذر تحميل الطلبات')}</p>`;
      return;
    }

    if (!orders.length) {
      list.innerHTML = '<p class="admin-empty">لا توجد طلبات مطابقة.</p>';
      return;
    }

    list.innerHTML = orders.map((o) => orderCardHtml(o)).join('');

    list.querySelectorAll<HTMLButtonElement>('[data-ext-status]').forEach((b) => {
      b.addEventListener('click', () => {
        const num = b.dataset.num ?? '';
        const next = b.dataset.extStatus as OrderishStatus | undefined;
        if (!num || !next) return;
        busy(b, true);
        void setExternalStatus(num, next)
          .then(() => {
            toast(`الطلب ${num}: ${statusLabel(next)}`);
            return refresh();
          })
          .catch((error: unknown) => {
            busy(b, false);
            toast(error instanceof Error ? error.message : 'تعذر تحديث الطلب');
          });
      });
    });
  };

  await paint();
}

function orderCardHtml(o: ExternalOrder): string {
  const items = o.items.length
    ? o.items
    : [{ name: o.itemName, quantity: o.quantity, allergens: [], imageUrl: '' }];

  const itemsHtml = items
    .map((it) => {
      const allergens = it.allergens.length ? ` · ⚠️ ${esc(it.allergens.join(' '))}` : '';
      return `<div class="order-item"><span>${esc(it.name)} ×${it.quantity}</span><small>${allergens}</small></div>`;
    })
    .join('');

  const maps = o.mapsUrl
    ? `<a href="${esc(o.mapsUrl)}" target="_blank" rel="noopener">رابط الخرائط</a>`
    : '';
  const coords =
    o.lat !== null && o.lng !== null
      ? ` · <a href="https://www.google.com/maps?q=${o.lat},${o.lng}" target="_blank" rel="noopener">الإحداثيات</a>`
      : '';

  return `
    <div class="admin-row">
      <div class="admin-row-head">
        <strong>#${esc(o.number)} · ${esc(o.customerName)}</strong>
        <span class="chip" style="color:${statusColor(o.status)}">${esc(statusLabel(o.status))}</span>
      </div>
      <div class="admin-row-meta">
        ${phoneCell(o.phone)} · ${o.deliveryType === 'pickup' ? 'استلام من المحل' : 'توصيل'} · ${esc(fmtDate(o.createdAt))}
        · ${items.reduce((sum, it) => sum + it.quantity, 0)} حبة
      </div>
      <div class="order-items">${itemsHtml}</div>
      ${o.address ? `<div class="admin-row-meta">📍 ${esc(o.address)}${coords}</div>` : ''}
      ${maps ? `<div class="admin-row-meta">🔗 ${maps}</div>` : ''}
      ${o.notes ? `<div class="admin-row-meta">📝 ${esc(o.notes)}</div>` : ''}
      <div class="admin-row-actions">${statusBtns(o.status, 'data-ext-status', o.number)}</div>
    </div>`;
}

/* ===================== الموظفون (للمدير) ===================== */

export async function renderStaffSection(refresh: () => Promise<void>): Promise<void> {
  const body = $('#adminBody');
  if (!body) return;

  body.innerHTML = `
    <div class="admin-card">
      <h4>إضافة موظف</h4>
      <div class="admin-toolbar">
        <input id="staffEmail" type="email" placeholder="name@cafe.com" dir="ltr">
        <button class="btn" id="staffAdd" type="button">إضافة</button>
      </div>
      <p class="admin-hint">يجب أن يكون الحساب مسجلا في Supabase (Authentication ← Users) بنفس البريد.</p>
    </div>
    <div id="staffList"><p class="admin-empty">جار التحميل…</p></div>
    <div class="notice" id="adminNotice"></div>`;

  const list = $<HTMLElement>('#staffList');
  const email = $<HTMLInputElement>('#staffEmail');
  const addBtn = $<HTMLButtonElement>('#staffAdd');

  const load = async (): Promise<void> => {
    if (!list) return;
    let staff: StaffRow[] = [];
    try {
      staff = await listStaff();
    } catch (error) {
      list.innerHTML = `<p class="admin-empty">${esc(error instanceof Error ? error.message : 'تعذر تحميل الموظفين')}</p>`;
      return;
    }
    list.innerHTML = staff.length
      ? staff
          .map(
            (s) => `
        <div class="admin-row">
          <div class="admin-row-head">
            <strong>${esc(s.email ?? s.userId)}</strong>
            <span class="chip" style="color:${s.role === 'admin' ? '#2a7191' : '#8a684b'}">${s.role === 'admin' ? 'مدير' : 'موظف'}</span>
          </div>
          <div class="admin-row-actions">
            <button class="btn outline" data-staff-del="${esc(s.userId)}">إزالة</button>
          </div>
        </div>`,
          )
          .join('')
      : '<p class="admin-empty">لا يوجد موظفون.</p>';

    list.querySelectorAll<HTMLButtonElement>('[data-staff-del]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.staffDel ?? '';
        if (!id || !window.confirm('إزالة هذا الموظف من لوحة الإدارة')) return;
        busy(b, true);
        void removeStaff(id)
          .then(() => {
            toast('تمت إزالة الموظف');
            return load();
          })
          .catch((error: unknown) => {
            busy(b, false);
            toast(error instanceof Error ? error.message : 'تعذر الحذف');
          });
      });
    });
  };

  addBtn?.addEventListener('click', () => {
    const value = email?.value.trim() ?? '';
    if (!value) {
      toast('أدخل بريد الموظف');
      return;
    }
    busy(addBtn, true);
    void addStaff(value)
      .then(() => {
        toast('تمت إضافة الموظف');
        if (email) email.value = '';
        return load();
      })
      .catch((error: unknown) => {
        busy(addBtn, false);
        toast(error instanceof Error ? error.message : 'تعذر الإضافة');
      });
  });

  await load();
  void refresh;
}

/* ===================== سجل تغير الحالات ===================== */

export async function renderAuditSection(refresh: () => Promise<void>): Promise<void> {
  const body = $('#adminBody');
  if (!body) return;
  body.innerHTML = '<p class="admin-empty">جار التحميل…</p>';

  let rows: AuditRow[] = [];
  try {
    rows = await listAudit(120);
  } catch (error) {
    body.innerHTML = `<p class="admin-empty">${esc(error instanceof Error ? error.message : 'تعذر تحميل السجل')}</p>`;
    return;
  }

  const entityLabel = (entity: string): string =>
    entity === 'external_orders' ? 'طلب خارجي' : entity === 'orders' ? 'طلب داخلي' : entity;

  body.innerHTML = rows.length
    ? rows
        .map(
          (r) => `
      <div class="admin-row">
        <div class="admin-row-head">
          <strong>#${esc(r.entityId)} · ${esc(entityLabel(r.entity))}</strong>
          <span class="chip">${esc(statusLabel(r.toStatus ?? ''))}</span>
        </div>
        <div class="admin-row-meta">
          ${esc(statusLabel(r.fromStatus ?? ''))} ← ${esc(statusLabel(r.toStatus ?? ''))}
          · ${esc(r.actorEmail ?? 'غير معروف')}
          · ${esc(fmtDate(r.createdAt))}
        </div>
      </div>`,
        )
        .join('')
    : '<p class="admin-empty">لا توجد عمليات مسجلة بعد.</p>';

  void refresh;
}

/* ===================== إحصاءات سريعة ===================== */

export async function renderStatsBar(): Promise<void> {
  const box = $('#adminStats');
  if (!box) return;
  let stats: AdminStats;
  try {
    stats = await adminStats();
  } catch {
    box.innerHTML = '';
    return;
  }
  const top = stats.topItems.length
    ? stats.topItems.map((t) => `${esc(t.name)} ×${t.qty}`).join(' · ')
    : '—';
  box.innerHTML = `
    <div class="stat"><b>${stats.pending}</b><span>قيد التحضير</span></div>
    <div class="stat"><b>${stats.ready}</b><span>جاهز</span></div>
    <div class="stat"><b>${stats.today}</b><span>طلب اليوم</span></div>
    <div class="stat"><b>${stats.itemsToday}</b><span>حبة اليوم</span></div>
    <div class="stat wide"><b>الأكثر طلبا (٧ أيام)</b><span>${top}</span></div>`;
}
