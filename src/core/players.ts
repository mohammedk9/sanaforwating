/**
 * حدود اللاعبين في مباراة SANA — مصدر واحد للحقيقة.
 *
 *  1 لاعب  ⇒ لعب فردي (لاعب واحد يلعب لوحده).
 *  8 لاعبين ⇒ الحد الأقصى في Pass & Play (هاتف واحد بالتناوب).
 *
 * الفحص هنا في طبقة المنطق لا في الواجهة فقط، حتى لا يعتمد أي نمط لعب
 * (Pass & Play أو الغرف لاحقاً) على تحقق الواجهة.
 */
import type { Team } from './teams.ts';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;

export interface PlayerCountCheck {
  ok: boolean;
  /** رسالة عربية جاهزة للعرض عند الرفض */
  message?: string;
}

/** يتحقق من صلاحية عدد اللاعبين في مباراة واحدة. */
export function checkPlayerCount(count: number): PlayerCountCheck {
  if (!Number.isInteger(count)) {
    return { ok: false, message: 'عدد اللاعبين غير صالح.' };
  }
  if (count < MIN_PLAYERS) {
    return { ok: false, message: `أضف لاعباً واحداً على الأقل للمتابعة.` };
  }
  if (count > MAX_PLAYERS) {
    return { ok: false, message: `الحد الأقصى ${MAX_PLAYERS} لاعبين في المباراة الواحدة.` };
  }
  return { ok: true };
}

/**
 * يقصّ قائمة اللاعبين إلى الحد الأقصى ويحذف الفراغات والأسماء المكررة.
 * الهدف: ألا يصل للعبة أكثر من ثمانية لاعبين مهما كان مدخل الواجهة.
 */
export function normalizePlayerNames(names: readonly string[]): string[] {
  const cleaned = names.map((name) => name.trim()).filter((name) => name.length > 0);
  return cleaned.slice(0, MAX_PLAYERS);
}

/**
 * يقسّم اللاعبين إلى تحدٍّ متاح بحسب العدد:
 *  - لاعب واحد: تحدي فردي خالص بلا جولات فرق.
 *  - لاعبان فأكثر: المباراة الديناميكية كاملة (فردي ← فرق ← مواجهة).
 */
export function isSoloMatch(playerCount: number): boolean {
  return playerCount < 2;
}

/** عدد أعضاء أكبر فريق (يُستخدم للتحقق من إمكانية تكوين فرق). */
export function largestTeamSize(teams: readonly Team[]): number {
  return teams.reduce((largest, team) => Math.max(largest, team.memberIds.length), 0);
}
