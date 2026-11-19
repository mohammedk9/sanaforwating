/**
 * حسابات اللاعبين — كل شيء عبر Supabase Auth والملف الشخصي.
 *
 * المبادئ:
 *  - اللعب العادي بلا حساب (جلسة مجهولة).
 *  - من يريد حفظ XP يربط الجلسة المجهولة ببريد وكلمة مرور عبر updateUser،
 *    فيبقى نفس المستخدم (نفس auth.uid) ولا تُفقد نقاطه.
 *  - XP لا يُكتب من المتصفح إطلاقاً: قواعد البيانات تمنح الخادم فقط صلاحية ذلك.
 */
import { ensureSession, supabase } from './supabase.ts';

export interface MyAccount {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface MyProfile {
  id: string;
  displayName: string;
  xp: number;
}

export interface LeaderboardRow {
  place: number;
  playerId: string;
  displayName: string;
  weekPoints: number;
}

/** المستخدم الحالي (أو null). */
export async function getAccount(): Promise<MyAccount | null> {
  const { data } = await supabase().auth.getUser();
  const user = data.user;
  if (!user) return null;
  const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous ?? !user.email;
  return { id: user.id, email: user.email ?? null, isAnonymous };
}

/** ملف اللاعب (XP والاسم). يعيد null إن لم يُنشأ بعد. */
export async function loadProfile(): Promise<MyProfile | null> {
  const account = await getAccount();
  if (!account) return null;

  const { data, error } = await supabase()
    .from('profiles')
    .select('id, display_name, xp')
    .eq('id', account.id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    displayName: (data.display_name as string | null) ?? '',
    xp: (data.xp as number | null) ?? 0,
  };
}

/** يحفظ الاسم فقط (XP غير قابل للتعديل من المتصفح). */
export async function saveDisplayName(displayName: string): Promise<void> {
  await ensureSession();
  const account = await getAccount();
  if (!account) throw new Error('لا توجد جلسة.');

  const clean = displayName.trim().slice(0, 16);
  if (clean.length < 2) throw new Error('الاسم قصير جداً (حرفان على الأقل).');

  // نجرّب التحديث أولاً (الحالة الأكثر شيوعاً: صف شخصي موجود)، ثم الإدراج إن لم يوجد.
  // لماذا؟ بعض إعدادات RLS/الأعمدة تسمح بالتحديث لكن ليس الإدراج (أو العكس)،
  // لذا استخدام upsert وحده قد يفشل بصمت لأحد السببين. التحديث ثم الإدراج أوضح وأدق تشخيصاً.
  const { data: existing, error: readError } = await supabase()
    .from('profiles')
    .select('id')
    .eq('id', account.id)
    .maybeSingle();

  // خطأ القراءة (RLS/صلاحيات) نُظهره مباشرة لأنه يكشف السبب الجذري
  if (readError) throw new Error(translateProfileError(readError.message));

  if (existing) {
    const { error } = await supabase()
      .from('profiles')
      .update({ display_name: clean })
      .eq('id', account.id);
    if (error) throw new Error(translateProfileError(error.message));
    return;
  }

  const { error: insertError } = await supabase()
    .from('profiles')
    .insert({ id: account.id, display_name: clean });
  if (insertError) throw new Error(translateProfileError(insertError.message));
}

/** رسائل عربية أوضح لأخطاء جدول profiles الشائعة (تساعد على التشخيص). */
function translateProfileError(message: string): string {
  const text = (message || '').toLowerCase();
  if (text.includes('row-level security') || text.includes('violates row-level')) {
    return 'رفض الخادم الحفظ (RLS): تأكد أن سياسات profiles مفعّلة في هجرة 0001.';
  }
  if (text.includes('permission denied') || text.includes('privilege')) {
    return 'لا توجد صلاحية على جدول profiles: شغّل الـ grants في هجرة 0001 (insert/update على display_name).';
  }
  if (text.includes('jwt') || text.includes('anonymous') || text.includes('not authenticated')) {
    return 'الجلسة غير صالحة. سجّل الدخول/الخروج ثم أعد المحاولة.';
  }
  if (text.includes('duplicate') || text.includes('unique')) {
    return 'الملف الشخصي موجود بالفعل. حدّث الصفحة ثم أعد المحاولة.';
  }
  return 'تعذّر حفظ الاسم: ' + (message || 'خطأ غير معروف.');
}

/**
 * يربط الجلسة المجهولة بحساب دائم (بريد + كلمة مرور).
 * نفس المعرّف ⇒ نفس XP وسجل المباريات.
 */
export async function linkAccount(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean }> {
  await ensureSession();
  const { data, error } = await supabase().auth.updateUser({ email, password });
  if (error) throw new Error(translateAuthError(error.message));

  // إن كان تأكيد البريد مفعّلاً، يبقى البريد بانتظار التحقق
  const needsConfirmation = !data.user?.email_confirmed_at;
  return { needsConfirmation };
}

/** دخول إلى حساب موجود (يستبدل الجلسة الحالية). */
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
}

/**
 * إرسال رابط دخول سحري إلى البريد (بدون رقم تحقق).
 * عند الضغط على الرابط في البريد يعود المستخدم إلى الموقع وتُلتقط الجلسة تلقائياً.
 * shouldCreateUser: false يمنع إنشاء حساب جديد ⇒ الدخول محصور بالمستخدم الموجود.
 * appUrl: الرابط الذي يعود إليه المستخدم بعد الضغط (افتراضاً صفحة الحساب).
 */
export async function sendMagicLink(email: string, redirectTo?: string): Promise<void> {
  const clean = email.trim();
  if (!clean) throw new Error('أدخل البريد الإلكتروني.');
  const { error } = await supabase().auth.signInWithOtp({
    email: clean,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo ?? defaultRedirect(),
    },
  });
  if (error) throw new Error(translateAuthError(error.message));
}

/**
 * إتمام دخول الرابط السحري عند الهبوط على الموقع.
 * يستدعى مرة عند الإقلاع: إن كان الرابط يحتوي علامة الدخول (auth=admin) ينتظر
 * التقاط الجلسة من الرابط، ثم ينظّف الرابط حتى لا يتكرر عند التحديث.
 * يعيد true إن اكتمل دخول فعلي (توجد جلسة).
 */
export async function completeMagicLinkRedirect(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  if (params.get('auth') !== 'admin') return false;

  // إنشاء العميل أولاً يفعّل التقاط الجلسة من رابط URL (detectSessionInUrl).
  const db = supabase();
  const { data } = await db.auth.getSession();

  // تنظيف علامة الدخول من الرابط كي لا يُعاد التوجيه عند كل تحديث.
  params.delete('auth');
  const qs = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));

  return !!data.session;
}

/** رابط العودة الافتراضي: نفس الصفحة الحالية مع علامة لفتح لوحة الإدارة. */
function defaultRedirect(): string {
  const base = window.location.origin + window.location.pathname;
  return base + '?auth=admin';
}

/** تعيين/تغيير كلمة مرور الحساب الحالي (يتطلب جلسة نشطة). */
export async function setPassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('كلمة المرور قصيرة: استخدم 8 أحرف أو أكثر.');
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(translateAuthError(error.message));
}

/** إنشاء حساب جديد مستقل ثم الدخول به. */
export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase().auth.signUp({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
  return { needsConfirmation: !data.session };
}

/** خروج. */
export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

/** الترتيب الأسبوعي (دالة محمية على الخادم). */
export async function weeklyLeaderboard(limit = 20): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase().rpc('weekly_leaderboard', { p_limit: limit });
  if (error) return [];

  return ((data ?? []) as {
    place: number;
    player_id: string;
    display_name: string;
    week_points: number;
  }[]).map((row) => ({
    place: row.place,
    playerId: row.player_id,
    displayName: row.display_name,
    weekPoints: row.week_points,
  }));
}

/** رسائل عربية لأخطاء المصادقة الشائعة. */
function translateAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'البريد أو كلمة المرور غير صحيحة.';
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'هذا البريد مسجّل بالفعل. استخدم «دخول» بدلاً من «إنشاء حساب».';
  }
  if (text.includes('password') && text.includes('characters')) {
    return 'كلمة المرور قصيرة: استخدم 8 أحرف أو أكثر.';
  }
  if (text.includes('invalid email')) return 'صيغة البريد غير صحيحة.';
  if (text.includes('anonymous')) return 'جلسة اللعب الحالية غير صالحة. أعد تحميل الصفحة.';
  if (text.includes('otp_expired') || text.includes('token has expired') || text.includes('expired'))
    return 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.';
  if (text.includes('invalid token') || text.includes('token is invalid') || text.includes('invalid_otp'))
    return 'الرمز غير صحيح. تأكد من الرمز المكوّن من 6 أرقام.';
  if (text.includes('email not confirmed')) return 'لم يُؤكَّد البريد بعد. استخدم رمز الدخول لإتمام التأكيد.';
  if (text.includes('signups not allowed') || text.includes('user not found') || text.includes('email address') && text.includes('not authorized'))
    return 'هذا البريد غير مسجّل. لا يمكن الدخول إلا بحساب موجود.';
  if (text.includes('rate limit') || text.includes('too many') || text.includes('security purposes'))
    return 'محاولات كثيرة. انتظر دقيقة ثم اطلب رمزاً جديداً.';
  if (text.includes('password should be') || (text.includes('password') && text.includes('characters')))
    return 'كلمة المرور قصيرة: استخدم 8 أحرف أو أكثر.';
  if (text.includes('same password') || text.includes('should be different'))
    return 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.';
  return 'تعذّر إكمال العملية. تحقق من البيانات وحاول مرة أخرى.';
}