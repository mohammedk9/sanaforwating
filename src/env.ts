/**
 * قراءة متغيرات البيئة والتحقق منها.
 *
 * كل ما يبدأ بـ VITE_ يُضمَّن في الحزمة النهائية، لذلك لا يوجد هنا أي مفتاح سرّي.
 * القيم تُقرأ مرة واحدة عند الإقلاع؛ إن نقصت قيمة مطلوبة تظهر رسالة عربية
 * واضحة بدلاً من فشل غامض في الشبكة.
 */

/** قيم Supabase العامة (آمنة للعرض في المتصفح). */
export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

function read(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  return typeof value === 'string' ? value.trim() : '';
}

/** رابط الموقع المنشور أو رابط التطوير — يُستخدم لصناعة رمز QR. */
export function appUrl(): string {
  return read('VITE_APP_URL') || window.location.origin;
}

/** رمز المحل الذي يفتحه رمز QR (مثل SANA-01). */
export function venueCode(): string {
  return read('VITE_VENUE_CODE') || 'SANA-01';
}

/** هل إعدادات Supabase مكتملة؟ (تُستخدم لإخفاء الألعاب الجماعية إن لم تُضبط) */
export function hasSupabase(): boolean {
  return read('VITE_SUPABASE_URL').length > 0 && read('VITE_SUPABASE_PUBLISHABLE_KEY').length > 0;
}

/**
 * يعيد إعدادات Supabase أو يرمي رسالة عربية واضحة.
 * تُستدعى فقط عند فتح وضع الغرف، لا عند تحميل الصفحة.
 */
export function supabaseConfig(): SupabaseConfig {
  const url = read('VITE_SUPABASE_URL');
  const publishableKey = read('VITE_SUPABASE_PUBLISHABLE_KEY');

  if (!url || !publishableKey) {
    throw new Error(
      'إعدادات الأصدقاء غير مكتملة: أضف VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY في ملف .env ثم أعد تشغيل الخادم.',
    );
  }
  if (publishableKey.startsWith('sb_secret_')) {
    throw new Error('مفتاح غير صالح للواجهة: sb_secret_ مخصص للخادم فقط. استخدم sb_publishable_.');
  }

  return { url: url.replace(/\/+$/, ''), publishableKey };
}