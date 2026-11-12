/**
 * واجهة الإدارة — Supabase فعلياً (بعد تشغيل migrations/0004_admin.sql).
 * الموظف يسجّل دخوله، ثم تتحقق require_staff على الخادم قبل أي إجراء.
 * إن لم تُشغَّل الهجرة بعد تظهر رسالة واضحة بدل الفشل الغامض.
 */
import { hasSupabase } from '../env.ts';
import { ensureSession, supabase } from '../net/supabase.ts';

export interface AdminQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  mode: string;
  category: string;
  difficulty: string;
  active: boolean;
}

export type OrderStatus = 'preparing' | 'ready' | 'cancelled' | 'delivered';

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase().rpc(name, args);
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('not-staff') || msg.includes('P0001')) throw new Error('ليس لديك صلاحية موظف. أضِف حسابك إلى جدول staff_members.');
    if (msg.includes('Could not find the function')) throw new Error('لم تُشغَّل هجرة 0004 بعد (الدوّال غير موجودة).');
    throw new Error(msg || 'تعذّر تنفيذ العملية.');
  }
  return data;
}

async function assertStaff(): Promise<void> {
  await ensureSession();
  await rpc('admin_list_questions', {});
}

export async function isStaff(): Promise<boolean> {
  try {
    await assertStaff();
    return true;
  } catch {
    return false;
  }
}

/** حالة طلب للعميل (تُستدعى من صفحة الانتظار). */
export async function fetchOrderStatus(number: string): Promise<OrderStatus | null> {
  if (!hasSupabase()) return null;
  try {
    await ensureSession();
    const data = (await rpc('get_order_status', { p_number: number.trim() })) as {
      ok?: boolean;
      status?: OrderStatus;
    };
    return data?.ok ? (data.status ?? null) : null;
  } catch {
    return null;
  }
}

/** الأدمن: رفع/تغيير حالة طلب. */
export async function setOrderStatus(number: string, status: OrderStatus): Promise<void> {
  const data = (await rpc('admin_upsert_order', { p_number: number, p_status: status })) as {
    ok?: boolean;
    reason?: string;
  };
  if (!data?.ok) throw new Error(adminReason(data?.reason));
}

/** الأدمن: قائمة الأسئلة كاملة (تشمل الإجابة الصحيحة). */
export async function listQuestions(): Promise<AdminQuestion[]> {
  const data = (await rpc('admin_list_questions', {})) as AdminQuestion[];
  return Array.isArray(data) ? data : [];
}

/** الأدمن: إضافة سؤال جديد أو تعديل الموجود. */
export async function upsertQuestion(input: {
  id?: string | null;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  mode: string;
  category: string;
  difficulty: string;
  active: boolean;
}): Promise<void> {
  const data = (await rpc('admin_upsert_question', {
    p_id: input.id ?? null,
    p_prompt: input.prompt,
    p_choices: input.choices,
    p_correct_index: input.correctIndex,
    p_explanation: input.explanation,
    p_mode: input.mode,
    p_category: input.category || null,
    p_difficulty: input.difficulty,
    p_active: input.active,
  })) as { ok?: boolean; reason?: string };
  if (!data?.ok) throw new Error(adminReason(data?.reason));
}

/** الأدمن: حذف سؤال نهائياً. */
export async function deleteQuestion(id: string): Promise<void> {
  const data = (await rpc('admin_delete_question', { p_id: id })) as { ok?: boolean; reason?: string };
  if (!data?.ok) throw new Error(adminReason(data?.reason));
}

/** الأدمن: تفعيل/تعطيل سؤال بدون حذفه. */
export async function setQuestionActive(id: string, active: boolean): Promise<void> {
  const data = (await rpc('admin_set_question_active', { p_id: id, p_active: active })) as {
    ok?: boolean;
    reason?: string;
  };
  if (!data?.ok) throw new Error(adminReason(data?.reason));
}

function adminReason(reason?: string): string {
  switch (reason) {
    case 'invalid-number':
      return 'رقم الطلب يجب أن يكون 2–12 رقماً.';
    case 'invalid-status':
      return 'حالة غير صالحة.';
    case 'invalid-prompt':
      return 'السؤال فارغ.';
    case 'invalid-choices':
      return 'أدخل 2–6 خيارات غير فارغة.';
    case 'invalid-correct-index':
      return 'الإجابة الصحيحة خارج نطاق الخيارات.';
    case 'invalid-mode':
      return 'النمط يجب أن يكون solo أو team أو any.';
    case 'invalid-difficulty':
      return 'الصعوبة يجب أن تكون easy أو medium أو hard.';
    case 'invalid-id':
      return 'رقم السؤال غير صالح.';
    case 'not-found':
      return 'السؤال غير موجود.';
    default:
      return 'تعذّر تنفيذ العملية.';
  }
}

/* ===== الطلبات الخارجية + المنيو ===== */
export interface MenuItem {
  id: string;
  name: string;
  imageUrl: string;
  allergens: string[];
  price: number;
  description: string;
  active?: boolean;
  sortOrder?: number;
}

export interface ExternalOrderItem {
  name: string;
  quantity: number;
  allergens: string[];
  imageUrl: string;
}

export interface ExternalOrder {
  id: string;
  number: string;
  items: ExternalOrderItem[];
  itemsCount?: number;
  customerName: string;
  phone: string;
  itemName: string;
  quantity: number;
  deliveryType: 'delivery' | 'pickup';
  address: string;
  lat: number | null;
  lng: number | null;
  mapsUrl: string;
  notes: string;
  status: 'preparing' | 'ready' | 'cancelled' | 'delivered';
  createdAt: string;
  updatedAt: string;
}

const FALLBACK_MENU: MenuItem[] = [
  { id: 'local-1', name: 'قهوة عربية أصيلة', imageUrl: '', allergens: [], price: 18, description: 'هيل وقرنفل على النار الهادئة' },
  { id: 'local-2', name: 'لاتيه حليب الشوفان', imageUrl: '', allergens: ['شوفان'], price: 22, description: 'رغوة كريمية وحليب شوفان' },
  { id: 'local-3', name: 'كرواسون بالزبدة', imageUrl: '', allergens: ['جلوتين', 'ألبان'], price: 14, description: 'يُخبز يومياً — يحتوي جلوتين' },
  { id: 'local-4', name: 'شاي مغربي', imageUrl: '', allergens: [], price: 16, description: 'نعناع طازج وعسل' },
];

const extReason = (reason?: string): string => {
  const map: Record<string, string> = {
    'invalid-phone': 'رقم الجوال غير صحيح (05 + 8 أرقام).',
    'invalid-item': 'اختر منتجاً من المنيو.',
    'invalid-quantity': 'الكمّية بين 1 و 20.',
    'invalid-delivery-type': 'نوع التوصيل غير صالح.',
    'missing-address': 'للتوصيل اكتب العنوان أو اضغط «موقعي الحالي».',
    'invalid-name': 'اسم المنتج فارغ.',
    'invalid-image': 'رابط الصورة يجب أن يبدأ بـ https://',
    'invalid-price': 'السعر لا يمكن أن يكون سالباً.',
  };
  return map[reason ?? ''] ?? adminReason(reason);
};

export async function listMenu(): Promise<MenuItem[]> {
  if (!hasSupabase()) return FALLBACK_MENU;
  try {
    await ensureSession();
    const data = (await rpc('list_menu', {})) as MenuItem[];
    return Array.isArray(data) && data.length ? data : FALLBACK_MENU;
  } catch {
    return FALLBACK_MENU;
  }
}

export async function listAdminMenu(): Promise<MenuItem[]> {
  return (await rpc('admin_list_menu', {})) as MenuItem[];
}


export async function upsertMenuItem(input: {
  id?: string | null;
  name: string;
  imageUrl: string;
  allergens: string[];
  price: number;
  description: string;
  active: boolean;
  sortOrder: number;
}): Promise<void> {
  const data = (await rpc('admin_upsert_menu_item', {
    p_id: input.id ?? null,
    p_name: input.name,
    p_image_url: input.imageUrl || null,
    p_allergens: input.allergens,
    p_price: input.price,
    p_description: input.description || null,
    p_active: input.active,
    p_sort: input.sortOrder,
  })) as { ok?: boolean; reason?: string };
  if (!data?.ok) throw new Error(extReason(data?.reason));
}

export async function deleteMenuItem(id: string): Promise<void> {
  const data = (await rpc('admin_delete_menu_item', { p_id: id })) as { ok?: boolean; reason?: string };
  if (!data?.ok) throw new Error(extReason(data?.reason));
}

export async function listExternalOrders(filter?: { status?: string; search?: string }): Promise<ExternalOrder[]> {
  const data = (await rpc('admin_list_external_orders', {
    p_status: filter?.status || null,
    p_search: filter?.search || null,
    p_limit: 200,
  })) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) return [];
  return data.map((row) => normalizeExternalOrder(row));
}

/** يحول صف قاعدة البيانات (introspection RPC) إلى ExternalOrder. */
export function normalizeExternalOrder(row: Record<string, unknown>): ExternalOrder {
  const items = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : [];
  return {
    id: String(row.id ?? ''),
    number: String(row.number ?? ''),
    customerName: String(row.customerName ?? ''),
    phone: String(row.phone ?? ''),
    itemName: String(row.itemName ?? ''),
    quantity: Number(row.quantity ?? 1),
    items: items.map((it) => ({
      name: String(it.name ?? ''),
      quantity: Number(it.quantity ?? 1),
      allergens: Array.isArray(it.allergens) ? it.allergens.map((a) => String(a)) : [],
      imageUrl: String(it.imageUrl ?? ''),
    })),
    itemsCount: Number(row.itemsCount ?? items.reduce((sum, it) => sum + Number(it.quantity ?? 0), 0)),
    deliveryType: (row.deliveryType === 'pickup' ? 'pickup' : 'delivery') as 'delivery' | 'pickup',
    address: String(row.address ?? ''),
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
    mapsUrl: String(row.mapsUrl ?? ''),
    notes: String(row.notes ?? ''),
    status: (row.status ?? 'preparing') as ExternalOrder['status'],
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  };
}
export async function setExternalStatus(number: string, status: ExternalOrder['status']): Promise<void> {
  const data = (await rpc('admin_set_external_status', { p_number: number, p_status: status })) as {
    ok?: boolean;
    reason?: string;
  };
  if (!data?.ok) throw new Error(extReason(data?.reason));
}

export async function createExternalOrder(input: {
  customerName: string;
  phone: string;
  itemId: string | null;
  itemName: string;
  quantity: number;
  extraItems?: Array<{ id: string | null; name: string; quantity: number }>;
  deliveryType: 'delivery' | 'pickup';
  address: string;
  lat: number | null;
  lng: number | null;
  mapsUrl: string;
  notes: string;
}): Promise<{ number: string; orderId: string }> {
  const data = (await rpc('create_external_order', {
    p_customer_name: input.customerName,
    p_phone: input.phone,
    p_item_id: input.itemId,
    p_item_name: input.itemName,
    p_quantity: input.quantity,
    p_extra_items: input.extraItems ?? [],
    p_delivery_type: input.deliveryType,
    p_address: input.address || null,
    p_lat: input.lat,
    p_lng: input.lng,
    p_maps_url: input.mapsUrl || null,
    p_notes: input.notes || null,
  })) as { ok?: boolean; reason?: string; number?: string; orderId?: string };
  if (!data?.ok || !data.number) throw new Error(extReason(data?.reason));
  return { number: data.number, orderId: data.orderId ?? '' };
}

export function extExtraItem(id: string | null, name: string, quantity: number): { id: string | null; name: string; quantity: number } {
  return { id: id || null, name, quantity: Math.min(Math.max(quantity, 1), 20) };
}

export async function getExternalOrderStatus(
  number: string,
  phone: string,
): Promise<ExternalOrder['status'] | null> {
  if (!hasSupabase()) return null;
  try {
    await ensureSession();
    const data = (await rpc('get_external_order', { p_number: number, p_phone: phone })) as {
      ok?: boolean;
      status?: ExternalOrder['status'];
    };
    return data?.ok ? (data.status ?? null) : null;
  } catch {
    return null;
  }
}

/* ===== الطلبات الداخلية + السجل + الموظفون + الإحصاءات (0009) ===== */

export interface InternalOrder {
  number: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRow {
  entity: string;
  entityId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export interface StaffRow {
  userId: string;
  email: string | null;
  role: 'admin' | 'staff';
  createdAt: string;
}

export interface AdminStats {
  pending: number;
  ready: number;
  today: number;
  itemsToday: number;
  topItems: Array<{ name: string; qty: number }>;
}

/** قائمة الطلبات الداخلية (حالة الفاتورة). */
export async function listInternalOrders(filter?: { status?: string; search?: string }): Promise<InternalOrder[]> {
  const data = (await rpc('admin_list_orders', {
    p_status: filter?.status || null,
    p_search: filter?.search || null,
    p_limit: 200,
  })) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    number: String(row.number ?? ''),
    status: (row.status ?? 'preparing') as OrderStatus,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  }));
}

/** سجل تغير حالات الطلبات. */
export async function listAudit(limit = 100): Promise<AuditRow[]> {
  const data = (await rpc('admin_list_audit', { p_limit: limit })) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    entity: String(row.entity ?? ''),
    entityId: String(row.entityId ?? ''),
    action: String(row.action ?? ''),
    fromStatus: row.fromStatus ? String(row.fromStatus) : null,
    toStatus: row.toStatus ? String(row.toStatus) : null,
    actorEmail: row.actorEmail ? String(row.actorEmail) : null,
    createdAt: String(row.createdAt ?? ''),
  }));
}

/** قائمة الموظفين (للمدير). */
export async function listStaff(): Promise<StaffRow[]> {
  const data = (await rpc('admin_list_staff', {})) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    userId: String(row.userId ?? ''),
    email: row.email ? String(row.email) : null,
    role: (row.role === 'admin' ? 'admin' : 'staff') as 'admin' | 'staff',
    createdAt: String(row.createdAt ?? ''),
  }));
}

/** إضافة موظف بالبريد (يجب أن يكون مسجلا في Supabase). */
export async function addStaff(email: string): Promise<void> {
  const data = (await rpc('admin_add_staff', { p_email: email })) as { ok?: boolean; reason?: string };
  if (!data?.ok) throw new Error(staffReason(data?.reason));
}

/** إزالة موظف. */
export async function removeStaff(userId: string): Promise<void> {
  const data = (await rpc('admin_remove_staff', { p_user_id: userId })) as { ok?: boolean; reason?: string };
  if (!data?.ok) throw new Error(staffReason(data?.reason));
}

/** إحصاءات سريعة للوحة. */
export async function adminStats(): Promise<AdminStats> {
  const data = (await rpc('admin_stats', {})) as Record<string, unknown> | null;
  if (!data) return { pending: 0, ready: 0, today: 0, itemsToday: 0, topItems: [] };
  const top = Array.isArray(data.topItems) ? (data.topItems as Array<Record<string, unknown>>) : [];
  return {
    pending: Number(data.pending ?? 0),
    ready: Number(data.ready ?? 0),
    today: Number(data.today ?? 0),
    itemsToday: Number(data.itemsToday ?? 0),
    topItems: top.map((t) => ({ name: String(t.name ?? ''), qty: Number(t.qty ?? 0) })),
  };
}

/** تفعيل/تعطيل منتج (نفد المخزون). */
export async function setMenuActive(id: string, active: boolean): Promise<void> {
  const data = (await rpc('admin_set_menu_active', { p_id: id, p_active: active })) as { ok?: boolean; reason?: string };
  if (!data?.ok) throw new Error(extReason(data?.reason));
}

function staffReason(reason?: string): string {
  switch (reason) {
    case 'user-not-found':
      return 'لا يوجد حساب بهذا البريد في Supabase.';
    case 'last-admin':
      return 'لا يمكن إزالة آخر مدير في النظام.';
    case 'invalid-id':
      return 'معرف غير صالح.';
    case 'invalid-email':
      return 'أدخل بريدا صحيحا.';
    case 'not-admin':
      return 'هذه العملية للمدير فقط.';
    default:
      return 'تعذر تنفيذ العملية.';
  }
}
