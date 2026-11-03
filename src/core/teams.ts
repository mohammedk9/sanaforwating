/**
 * تشكيل الفرق (Dynamic Match) — منطق نقي بلا DOM وبلا شبكة.
 *
 * القواعد المعتمدة:
 *  1. الخادم هو من يكوّن الفرق ويحفظها، ولا تُرسل بذرة عشوائية إلى المتصفح.
 *     (في Pass & Play على هاتف واحد يُستخدم نفس المنطق محلياً للتجربة فقط.)
 *  2. توازن النتائج: توزيع «الثعبان» ⇒ الأقوى مع الأضعف، ثم الثاني مع الثاني من الآخر.
 *  3. تجنّب تكرار زملاء الجولة السابقة قدر الإمكان (بتبديل واحد يقلّل التكرار).
 *  4. أحجام الفرق متقاربة ولا يبقى فريق فارغاً.
 */
import { expectedTeamCount } from './matchPlan.ts';

export interface Team {
  id: string;
  name: string;
  /** معرّفات الأعضاء بترتيب التوزيع */
  memberIds: string[];
}

export interface AssignTeamsInput {
  playerIds: string[];
  /** حجم الفريق المطلوب: 2 ⇒ ستة لاعبين = ثلاثة فرق */
  teamSize: number;
  /** نقاط كل لاعب حتى اللحظة، لتوزيع متوازن (الافتراضي: صفر للجميع) */
  pointsByPlayer?: Record<string, number>;
  /** تشكيلات سابقة، لتفادي تكرار زملاء الفريق */
  previousTeams?: Team[];
}

const TEAM_NAMES = [
  'الفريق الأول',
  'الفريق الثاني',
  'الفريق الثالث',
  'الفريق الرابع',
  'الفريق الخامس',
  'الفريق السادس',
];

/** يوزّع اللاعبين على فرق متوازنة ويثبّت الناتج من نفس المدخلات. */
export function assignTeams(input: AssignTeamsInput): Team[] {
  const { playerIds, teamSize } = input;
  if (playerIds.length === 0 || teamSize <= 0) return [];

  const pointsOf = (id: string) => input.pointsByPlayer?.[id] ?? 0;

  // ترتيب تنازلي بالنقاط، والفصل النهائي بالمعرّف ليكون الناتج ثابتاً
  const ordered = [...playerIds].sort((a, b) => {
    const byPoints = pointsOf(b) - pointsOf(a);
    return byPoints !== 0 ? byPoints : a.localeCompare(b);
  });

  const teamCount = expectedTeamCount(ordered.length, teamSize);
  const baseSize = Math.floor(ordered.length / teamCount);
  const remainder = ordered.length % teamCount;
  const sizes = Array.from({ length: teamCount }, (_unused, i) => baseSize + (i < remainder ? 1 : 0));

  const teams: Team[] = sizes.map((_size, i) => ({
    id: `team-${i + 1}`,
    name: TEAM_NAMES[i] ?? `الفريق ${i + 1}`,
    memberIds: [],
  }));

  // توزيع الثعبان: تمريرة بالأمام ثم تمريرة بالخلف
  let cursor = 0;
  let forward = true;
  while (cursor < ordered.length) {
    const order = teams.map((_team, i) => i);
    if (!forward) order.reverse();

    let assignedThisPass = 0;
    for (const teamIndex of order) {
      if (cursor >= ordered.length) break;
      if (teams[teamIndex].memberIds.length >= sizes[teamIndex]) continue;
      teams[teamIndex].memberIds.push(ordered[cursor]);
      cursor += 1;
      assignedThisPass += 1;
    }

    // حماية من أي حلقة لا نهائية إن لم يتبقَّ مكان شاغر
    if (assignedThisPass === 0) break;
    forward = !forward;
  }

  return avoidRepeatedTeammates(teams, input.previousTeams ?? []);
}

/** مفتاح ثابت للزوج بغض النظر عن الترتيب. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** كل الأزواج المتشاركة في نفس الفريق. */
function teammatePairs(teams: readonly Team[]): Set<string> {
  const pairs = new Set<string>();
  for (const team of teams) {
    for (let i = 0; i < team.memberIds.length; i++) {
      for (let j = i + 1; j < team.memberIds.length; j++) {
        pairs.add(pairKey(team.memberIds[i], team.memberIds[j]));
      }
    }
  }
  return pairs;
}

/** عدد أزواج الزملاء المتكررة مقارنة بالجولة السابقة. */
function countRepeats(teams: readonly Team[], previousPairs: ReadonlySet<string>): number {
  let repeats = 0;
  for (const pair of teammatePairs(teams)) {
    if (previousPairs.has(pair)) repeats += 1;
  }
  return repeats;
}

function cloneTeams(teams: readonly Team[]): Team[] {
  return teams.map((team) => ({ ...team, memberIds: [...team.memberIds] }));
}

/**
 * تقليل تكرار أزواج الزملاء: يبحث عن تبديل واحد يخفّض عدد التكرارات،
 * ويعيد التطبيق حتى لا يبقى تحسين ممكن (بحد أقصى محدد).
 */
function avoidRepeatedTeammates(teams: Team[], previousTeams: readonly Team[]): Team[] {
  if (previousTeams.length === 0) return teams;

  const previousPairs = teammatePairs(previousTeams);
  let best = cloneTeams(teams);
  let bestRepeats = countRepeats(best, previousPairs);

  let guard = 0;
  while (bestRepeats > 0 && guard < 50) {
    guard += 1;
    let foundImprovement = false;

    search: for (let a = 0; a < best.length; a++) {
      for (let b = a + 1; b < best.length; b++) {
        for (let i = 0; i < best[a].memberIds.length; i++) {
          for (let j = 0; j < best[b].memberIds.length; j++) {
            const candidate = cloneTeams(best);
            const swap = candidate[a].memberIds[i];
            candidate[a].memberIds[i] = candidate[b].memberIds[j];
            candidate[b].memberIds[j] = swap;

            const candidateRepeats = countRepeats(candidate, previousPairs);
            if (candidateRepeats < bestRepeats) {
              best = candidate;
              bestRepeats = candidateRepeats;
              foundImprovement = true;
              break search;
            }
          }
        }
      }
    }

    if (!foundImprovement) break;
  }

  return best;
}

/** مجموع نقاط فريق من نقاط أعضائه (يُستخدم في الواجهة). */
export function teamScore(team: Team, pointsByPlayer: Record<string, number>): number {
  return team.memberIds.reduce((total, id) => total + (pointsByPlayer[id] ?? 0), 0);
}
