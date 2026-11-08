/**
 * Web Push «طلبك جاهز» — حقيقي (حتى بعد إغلاق الصفحة)
 *
 * 1) العميل يشترك عبر PushManager بمفتاح VAPID العام (VITE_VAPID_PUBLIC_KEY).
 * 2) الاشتراك يُحفظ في push_subscriptions مربوط برقم الطلب (أو كل رقم).
 * 3) عند تغيير الحالة إلى ready:
 *    - إذا كان pg_net مفعّلاً: الـ Trigger يرسل HTTP إلى Edge Function `push`
 *    - وإلا: Supabase Webhook (orders/external_orders UPDATE) ينادي نفس الدالة.
 *    - Edge Function `push` تقرأ الاشتراكات وترسل push فعلياً.
 *
 * إن لم تُضبط VAPID: يبقى إشعار Local (Toast + رنين + تغيّر ألوان + polling).
 */
import { ensureSession, supabase } from './supabase.ts';

const VAPID_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? '';
const LS_KEY = 'sana.push.order';
const LS_SUB = 'sana.push.subscribed'; // علامة أن هذا الجهاز مشترك (لمنع طلب إذن متكرر)

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  orderNumber?: string;
  tag?: string;
  icon?: string;
}

export interface PushStatus {
  supported: boolean;      // هل تحصل على Web Push؟ (متصفح حديث + VAPID مضبوط)
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;     // هل هذا الجهاز مشترك للمحادثة الحالية؟
  how: 'vapid' | 'local';  // إن لم يكن VAPID: إشعارات محلية فقط
}

const base64ToUint8 = (b64: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw.split('').map((c) => c.charCodeAt(0)));
};

export function getVapidKey(): string {
  return VAPID_KEY;
}

export function loadSavedOrder(): { number: string; phone: string; status: string } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveOrder(number: string, phone: string, status = 'preparing'): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ number, phone, status })); } catch { /* ignore */ }
}

export function clearSavedOrder(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch { return null; }
}

export function canSubscribe(): boolean {
  return 'PushManager' in window && 'Notification' in window && Boolean(VAPID_KEY);
}

/** الحالة الحالية لإشعارات الجاهزية لهذا الجهاز. */
export function pushStatus(): PushStatus {
  if (!('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, permission: 'unsupported', subscribed: false, how: 'local' };
  }
  const subscribed = (() => { try { return localStorage.getItem(LS_SUB) === '1'; } catch { return false; } })();
  return {
    supported: canSubscribe(),
    permission: Notification.permission,
    subscribed,
    how: canSubscribe() ? 'vapid' : 'local',
  };
}

/** علامة «مشترك» محلية (لا حاجة ليتكرر طلب الإذن). */
export function markSubscribed(): void {
  try { localStorage.setItem(LS_SUB, '1'); } catch { /* ignore */ }
}

export async function subscribeToOrder(orderNumber: string, phone: string): Promise<boolean> {
  if (!canSubscribe()) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const sw = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
    if (!sw) return false;

    let sub = await sw.pushManager.getSubscription();
    if (!sub) {
      sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(VAPID_KEY),
      });
    }

    const ok = await saveSubscription(sub.toJSON(), orderNumber, phone);
    if (ok) markSubscribed();
    return ok;
  } catch { return false; }
}

async function saveSubscription(subscription: object, orderNumber: string, phone: string): Promise<boolean> {
  // محاولة عبر Edge Function (push-subscribe) ثم عبر الجدول مباشرة كبديل أصلي
  try {
    await ensureSession();
    const { error } = await supabase().functions.invoke('push-subscribe', {
      body: { subscription, orderNumber, phone },
    });
    if (!error) return true;
  } catch { /* ignore — جرب الجدول */ }
  try {
    await ensureSession();
    const s = subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return false;
    const { error } = await supabase().from('push_subscriptions').insert({
      order_number: orderNumber,
      phone: phone || null,
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
    });
    return !error;
  } catch { return false; }
}

/** تسريع: تأكيد حالة الإذن بدون الحاجة لطلب جديد (للزر). */
export async function ensureSubscribed(orderNumber: string, phone: string): Promise<boolean> {
  if (!canSubscribe()) return false;
  if (pushStatus().subscribed) return true;
  return subscribeToOrder(orderNumber, phone);
}

export function showLocalNotification(payload: PushPayload): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.ready.then((sw) =>
      sw.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon ?? './assets/sana-logo.svg',
        badge: './assets/sana-logo.svg',
        dir: 'rtl',
        lang: 'ar',
        tag: payload.tag ?? payload.orderNumber ?? 'sana-order-ready',
        data: { url: payload.url ?? './', orderNumber: payload.orderNumber },
        requireInteraction: false,
        vibrate: [200, 100, 200],
      } as NotificationOptions),
    );
    return;
  }

  try {
    new Notification(payload.title, { body: payload.body, icon: payload.icon ?? './assets/sana-logo.svg' });
  } catch { /* ignore */ }
}

let audioCtx: AudioContext | null = null;
export function playReadySound(): void {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.4);
    });
  } catch { /* ignore */ }
}
