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
  const { error } = await supabase()
    .from('profiles')
    .upsert({ id: account.id, display_name: clean }, { onConflict: 'id' });

  if (error) throw new Error('تعذّر حفظ الاسم. حاول مرة أخرى.');
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
  return 'تعذّر إكمال العملية. تحقق من البيانات وحاول مرة أخرى.';
}