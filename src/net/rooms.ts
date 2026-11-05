/**
 * عمليات الغرف والمباراة عبر Supabase.
 *
 * كل عملية هنا تنادي دالة RPC محمية على الخادم:
 *  create_room · join_room · start_match · current_question · submit_answer · advance_match
 * ولا نكتب أي صف مباشرة في جداول المباراة (RLS يمنع ذلك).
 */
import { currentPlayerId, ensureSession, supabase } from './supabase.ts';

export interface RoomSession {
  roomId: string;
  matchId: string;
  code: string;
}

export interface RoomPlayer {
  playerId: string;
  displayName: string;
  joinedAt: string;
}

export interface CurrentQuestion {
  ok: boolean;
  phase: string;
  matchQuestionId?: string;
  roundIndex: number;
  questionIndex: number;
  questionCount?: number;
  mode?: 'solo' | 'teams';
  prompt?: string;
  choices?: string[];
  startedAt?: string;
  endsAt?: string;
  correctIndex?: number | null;
  explanation?: string | null;
  reason?: string;
}

export interface SubmitOutcome {
  accepted: boolean;
  correct?: boolean;
  points?: number;
  elapsedMs?: number;
  reason?: string;
}

/** سبب عربي مقروء لأخطاء الخادم. */
export function roomErrorText(reason?: string): string {
  switch (reason) {
    case 'unauthenticated':
      return 'لم تبدأ جلسة اللعب بعد.';
    case 'not-found':
      return 'لا توجد غرفة بهذا الرمز.';
    case 'already-started':
      return 'المباراة بدأت بالفعل في هذه الغرفة.';
    case 'expired':
      return 'انتهت صلاحية الغرفة. اطلب رمزاً جديداً.';
    case 'room-full':
      return 'الغرفة ممتلئة (الحد 8 لاعبين).';
    case 'player-count-out-of-range':
      return 'عدد اللاعبين يجب أن يكون بين 1 و8.';
    case 'not-host':
      return 'بدء المباراة متاح لمن أنشأ الغرفة فقط.';
    case 'no-questions':
      return 'لا توجد أسئلة متاحة الآن.';
    case 'no-players':
      return 'لا يوجد لاعبون في الغرفة.';
    case 'not-in-room':
      return 'أنت لست عضواً في هذه الغرفة.';
    case 'not-due':
      return 'لم ينتهِ وقت المرحلة بعد.';
    case 'too-late':
      return 'انتهى وقت السؤال.';
    case 'duplicate':
      return 'سُجّلت إجابتك بالفعل.';
    case 'not-submitter':
      return 'الدور الآن على زميلك في الفريق.';
    default:
      return 'تعذّر إكمال العملية. حاول مرة أخرى.';
  }
}

/** إنشاء غرفة ومباراة، وإرجاع الرمز للمشاركة. */
export async function createRoom(maxPlayers: number): Promise<RoomSession> {
  await ensureSession();
  const { data, error } = await supabase().rpc('create_room', { p_max_players: maxPlayers });
  if (error) throw new Error(roomErrorText(''));

  const result = data as { ok?: boolean; reason?: string; roomId?: string; code?: string; matchId?: string };
  if (!result?.ok) throw new Error(roomErrorText(result?.reason));

  return {
    roomId: result.roomId as string,
    matchId: result.matchId as string,
    code: result.code as string,
  };
}

/**
 * يضبط اسم المضيف في الغرفة (create_room يضع اسماً افتراضياً).
 * نستخدم join_room لأنه يحدّث الاسم لنفس اللاعب (upsert) بلا تكرار.
 */
export async function setMyName(code: string, displayName: string): Promise<void> {
  const name = displayName.trim();
  if (!name) return;
  await supabase().rpc('join_room', { p_code: code.trim(), p_name: name });
}

/**
 * مباراة فردية موثّقة على الخادم: غرفة بسعة لاعب واحد.
 *
 * لماذا؟ حتى تُحتسب XP والترتيب الأسبوعي من الخادم نفسه،
 * ولا يستطيع المتصفح إرسال نتيجة من عنده.
 */
export async function startSoloMatch(displayName: string): Promise<RoomSession> {
  const session = await createRoom(1);
  await setMyName(session.code, displayName);
  await startMatch(session.roomId);
  return session;
}

/**
 * فرق توقيت الخادم عن ساعة الجهاز (بالمللي ثانية).
 * يُستخدم لضبط العدّاد وطلب تقديم المرحلة بدقة، فلا يتأخر العرض
 * إن كانت ساعة الهاتف متأخرة.
 */
export async function fetchServerOffset(): Promise<number> {
  const sentAt = Date.now();
  const { data, error } = await supabase().rpc('server_now');
  const receivedAt = Date.now();

  if (error || !data) return 0;

  const serverTime = new Date(data as string).getTime();
  if (Number.isNaN(serverTime)) return 0;

  // نصف زمن الرحلة تقدير معياري لفرق التوقيت
  const roundTrip = receivedAt - sentAt;
  return serverTime + roundTrip / 2 - receivedAt;
}

/** الانضمام بالرمز. */
export async function joinRoom(code: string, displayName: string): Promise<RoomSession> {
  await ensureSession();
  const { data, error } = await supabase().rpc('join_room', {
    p_code: code.trim(),
    p_name: displayName.trim(),
  });
  if (error) throw new Error(roomErrorText(''));

  const result = data as { ok?: boolean; reason?: string; roomId?: string; matchId?: string; code?: string };
  if (!result?.ok) throw new Error(roomErrorText(result?.reason));

  return {
    roomId: result.roomId as string,
    matchId: result.matchId as string,
    code: result.code as string,
  };
}

/** يبدأ المباراة (المضيف فقط). */
export async function startMatch(roomId: string): Promise<void> {
  await ensureSession();
  const { data, error } = await supabase().rpc('start_match', { p_room_id: roomId });
  if (error) throw new Error(roomErrorText(''));

  const result = data as { ok?: boolean; reason?: string };
  if (!result?.ok) throw new Error(roomErrorText(result?.reason));
}

/** قائمة لاعبي الغرفة (RLS يسمح لأعضاء الغرفة فقط). */
/** السؤال الحالي — بلا الإجابة الصحيحة قبل الكشف. */
export async function fetchCurrentQuestion(matchId: string): Promise<CurrentQuestion> {
  const { data, error } = await supabase().rpc('current_question', { p_match_id: matchId });
  if (error) throw new Error(roomErrorText(''));
  return data as CurrentQuestion;
}

/** إرسال إجابة — الخادم هو من يحسب الزمن والنقاط. */
export async function submitAnswer(
  matchQuestionId: string,
  choiceIndex: number,
): Promise<SubmitOutcome> {
  const { data, error } = await supabase().rpc('submit_answer', {
    p_match_question: matchQuestionId,
    p_choice: choiceIndex,
  });
  if (error) throw new Error(roomErrorText(''));
  return data as SubmitOutcome;
}

/** يطلب من الخادم تقديم المرحلة (يرفض إن لم ينتهِ وقتها). */
export async function advanceMatch(
  matchId: string,
): Promise<{ advanced: boolean; phase?: string; reason?: string }> {
  const { data, error } = await supabase().rpc('advance_match', { p_match_id: matchId });
  if (error) return { advanced: false, reason: 'error' };
  return data as { advanced: boolean; phase?: string; reason?: string };
}

/** حالة المباراة (المرحلة وأوقاتها) — المرجع في الواجهة. */
export async function fetchMatchState(matchId: string): Promise<{
  phase: string;
  roundIndex: number;
  questionIndex: number;
  phaseEndsAt: string | null;
} | null> {
  const { data, error } = await supabase()
    .from('matches')
    .select('phase, round_index, question_index, phase_ends_at')
    .eq('id', matchId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    phase: data.phase as string,
    roundIndex: data.round_index as number,
    questionIndex: data.question_index as number,
    phaseEndsAt: (data.phase_ends_at as string | null) ?? null,
  };
}
export async function listPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await supabase()
    .from('room_players')
    .select('player_id, display_name, joined_at')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error) return [];
  return (data ?? []).map((row) => ({
    playerId: row.player_id as string,
    displayName: row.display_name as string,
    joinedAt: row.joined_at as string,
  }));
}

/** هل أنا من أنشأ الغرفة؟ (لإظهار زر البدء) */
export async function isHost(roomId: string): Promise<boolean> {
  const me = await currentPlayerId();
  const { data, error } = await supabase()
    .from('rooms')
    .select('host_id')
    .eq('id', roomId)
    .maybeSingle();
  if (error || !data) return false;
  return (data.host_id as string) === me;
}

/** حالة الغرفة (لانتظار انطلاق المباراة في اللوبي). */
export async function fetchRoomStatus(roomId: string): Promise<string | null> {
  const { data, error } = await supabase()
    .from('rooms')
    .select('status')
    .eq('id', roomId)
    .maybeSingle();
  if (error || !data) return null;
  return data.status as string;
}

export interface AnswerRow {
  playerId: string;
  teamId: string | null;
  choiceIndex: number;
  correct: boolean;
  points: number;
  elapsedMs: number;
}

/** إجابات سؤال واحد (يُستخدم لعرض من أجاب وما اختاره). */
export async function listQuestionAnswers(matchQuestionId: string): Promise<AnswerRow[]> {
  const { data, error } = await supabase()
    .from('answers')
    .select('player_id, team_id, choice_index, correct, points, elapsed_ms')
    .eq('match_question_id', matchQuestionId);

  if (error) return [];
  return (data ?? []).map((row) => ({
    playerId: row.player_id as string,
    teamId: (row.team_id as string | null) ?? null,
    choiceIndex: row.choice_index as number,
    correct: row.correct as boolean,
    points: row.points as number,
    elapsedMs: row.elapsed_ms as number,
  }));
}

/** كل إجابات المباراة (لحساب لوحة النقاط أثناء اللعب). */
export async function listMatchAnswers(matchId: string): Promise<AnswerRow[]> {
  const { data, error } = await supabase()
    .from('answers')
    .select('player_id, team_id, choice_index, correct, points, elapsed_ms')
    .eq('match_id', matchId);

  if (error) return [];
  return (data ?? []).map((row) => ({
    playerId: row.player_id as string,
    teamId: (row.team_id as string | null) ?? null,
    choiceIndex: row.choice_index as number,
    correct: row.correct as boolean,
    points: row.points as number,
    elapsedMs: row.elapsed_ms as number,
  }));
}

/** الفرق وأعضاؤها في المباراة (لعرض من عليه دور الإرسال). */
export async function listTeams(
  matchId: string,
): Promise<{ teamId: string; name: string; memberIds: string[] }[]> {
  const { data: teams, error } = await supabase()
    .from('match_teams')
    .select('team_id, name')
    .eq('match_id', matchId);
  if (error || !teams) return [];

  const { data: members } = await supabase()
    .from('match_team_members')
    .select('team_id, player_id')
    .eq('match_id', matchId);

  return teams.map((team) => ({
    teamId: team.team_id as string,
    name: team.name as string,
    memberIds: (members ?? [])
      .filter((row) => row.team_id === team.team_id)
      .map((row) => row.player_id as string),
  }));
}