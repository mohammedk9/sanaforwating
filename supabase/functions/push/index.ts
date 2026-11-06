// ================================================================
//  Supabase Edge Function — Web Push «طلبك جاهز»
//  الاسم: push   ·   ملف: supabase/functions/push/index.ts
//  التشغيل: Deno (في Supabase Edge Functions) — NOT Node / NOT Vite
//  VS Code: هذا الملف خارج tsconfig.json للمشروع (include: src/tests/vite.config فقط)
//           الأخطاء الحمراء هنا لا تعني أن الكود مكسور — هي حدود المحرّر فقط.
//
//  متغيرات Secrets في Supabase Dashboard ← Edge Functions ← push ← Settings:
//    VAPID_PUBLIC_KEY            (من .env: VITE_VAPID_PUBLIC_KEY)
//    VAPID_PRIVATE_KEY           (ولّده بنفس الطريقة — لا يُعرض في الواجهة أبداً)
//    SUPABASE_URL
//    SUPABASE_SERVICE_ROLE_KEY
// ================================================================

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`sb ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'authorization,content-type,apikey',
      },
    });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: 'missing-server-env' }, 500);

  const body = (await req.json().catch(() => ({}))) as { orderNumber?: unknown };
  const orderNumber = String(body.orderNumber ?? '');
  if (!orderNumber) return json({ ok: false, error: 'missing-orderNumber' }, 400);

  const { data: subs } = await sb<{ data: SubscriptionRow[] | null }>(
    `push_subscriptions?select=endpoint,p256dh,auth&order_number=eq.${encodeURIComponent(orderNumber)}`,
  );

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!vapidPublic || !vapidPrivate) return json({ ok: false, error: 'missing-vapid' }, 500);

  const payload = JSON.stringify({
    title: 'طلبك جاهز! 🎉',
    body: `طلبك #${orderNumber} أصبح جاهزاً للاستلام.`,
    url: '/',
    orderNumber,
    tag: `sana-order-${orderNumber}`,
    icon: '/assets/sana-logo.svg',
  });

  let sent = 0;
  for (const s of subs ?? []) {
    try {
      const res = await sendWebPush(s, payload, vapidPublic, vapidPrivate);
      if (res.ok) sent++;
    } catch {
      // اشتراك منتهي — حدّثه لاحقاً
    }
  }

  return json({ ok: true, sent, total: subs?.length ?? 0 });
});

type WebPush = {
  sendNotification(opts: {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    payload: string;
    vapidDetails: { subject: string; publicKey: string; privateKey: string };
    TTL?: number;
    UCN?: boolean;
    contentEncoding?: string;
  }): Promise<Response>;
};

async function loadWebPush(): Promise<WebPush> {
  // Deno: الاستيراد الديناميكي بدون خريطة أنواع (allowJs/skipLibCheck يغطي الأنواع)
  // tsc: allowJs يقرأ JS، و tsconfig.json في هذا المجلد مهيأ لذلك.
  const url = 'https://cdn.skypack.dev/web-push@3.6.7';
  const mod = (await import(/* @vite-ignore */ /* @ts-ignore */ url)) as {
    default?: WebPush;
    WebPush?: WebPush;
    sendNotification?: WebPush['sendNotification'];
  };
  if (mod.default && typeof mod.default.sendNotification === 'function') return mod.default;
  if (mod.WebPush && typeof mod.WebPush.sendNotification === 'function') return mod.WebPush;
  if (typeof mod.sendNotification === 'function')
    return { sendNotification: mod.sendNotification };
  throw new Error('webpush module shape unknown');
}

async function sendWebPush(
  s: SubscriptionRow,
  payload: string,
  vapidPublic: string,
  vapidPrivate: string,
): Promise<Response> {
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:cafe@sana.sa';
  const webpush = await loadWebPush();
  return webpush.sendNotification({
    subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
    payload,
    vapidDetails: { subject, publicKey: vapidPublic, privateKey: vapidPrivate },
    TTL: 60 * 60 * 24,
    UCN: true,
    contentEncoding: 'aes128gcm',
  });
}

// ⛔ ممنوع إدراج import بهذا السطر بدون declare/moduleResolution خاص لـ Deno:
//    tsc يحاول عبورياً resolve كل ما يخص Deno (jsr:/https:) وهي ليست جزءاً من tsc أصلاً.

