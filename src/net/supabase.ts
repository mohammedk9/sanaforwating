/**
 * عميل Supabase — نسخة واحدة للصفحة كلها.
 *
 * المبادئ:
 *  - المفتاح المستخدم هو sb_publishable_ (عام بطبيعته)؛ الحماية من RLS.
 *  - الدخول مجهول (Anonymous) فلا نطلب جوالاً ولا بريداً للعب.
 *  - لا شيء هنا يقرأ جدول الأسئلة: كل شيء عبر دوال RPC آمنة.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../env.ts';

let client: SupabaseClient | null = null;
let authPromise: Promise<void> | null = null;

/** يعيد العميل (ينشئه مرة واحدة). يرمي رسالة عربية إن لم تُضبط .env. */
export function supabase(): SupabaseClient {
  if (client) return client;
  const { url, publishableKey } = supabaseConfig();
  client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // الجلسة المجهولة تبقى محفوظة فلا يفقد اللاعب هويته عند التحديث
      storageKey: 'sana.auth',
    },
  });
  return client;
}

/**
 * يضمن وجود جلسة: يستخدم الجلسة الحالية، وإلا ينشئ حساباً مجهولاً.
 * تُستدعى قبل أي عملية في الغرف، ومرة واحدة فقط بفضل authPromise.
 */
export function ensureSession(): Promise<void> {
  if (authPromise) return authPromise;

  authPromise = (async () => {
    const db = supabase();
    const { data } = await db.auth.getSession();
    if (data.session) return;

    const { error } = await db.auth.signInAnonymously();
    if (error) {
      authPromise = null;
      throw new Error(
        'تعذّر بدء جلسة اللعب. تأكد من تفعيل Anonymous sign-ins في Supabase (Authentication ← Providers).',
      );
    }
  })();

  return authPromise;
}

/** معرّف اللاعب الحالي (بعد ensureSession). */
export async function currentPlayerId(): Promise<string> {
  const db = supabase();
  const { data } = await db.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('لا توجد جلسة لعب حالياً.');
  return id;
}

/** يعيد قراءة رابط المشروع (لأغراض التشخيص فقط). */
export function projectHost(): string {
  try {
    return new URL(supabaseConfig().url).host;
  } catch {
    return '';
  }
}