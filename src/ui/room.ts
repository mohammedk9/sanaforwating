/**
 * غرفة الأصدقاء — لعب جماعي حقيقي عبر Supabase.
 *
 * المسار: صندوق الغرفة (إنشاء/انضمام) ← اللوبي داخل لوحة اللعب ← المباراة.
 *
 * المبادئ:
 *  - لا نحسب شيئاً محلياً: الوقت من ends_at والنقاط من الخادم.
 *  - أي لاعب يستطيع طلب تقديم المرحلة؛ الخادم يرفض إن لم ينتهِ وقتها.
 *  - الأحداث تُعيد القراءة من القاعدة، فلا يفسد فقدان حدث أي مباراة.
 */
import { $, $$, toast } from './dom.ts';
import { currentPlayerId, ensureSession } from '../net/supabase.ts';
import {
  advanceMatch,
  createRoom,
  fetchCurrentQuestion,
  fetchMatchState,
  fetchServerOffset,
  joinRoom,
  listMatchAnswers,
  listPlayers,
  listQuestionAnswers,
  listTeams,
  roomErrorText,
  setMyName,
  startMatch,
  startSoloMatch,
  submitAnswer,
  type AnswerRow,
  type CurrentQuestion,
  type RoomPlayer,
  type RoomSession,
} from '../net/rooms.ts';
import { subscribeRoom, type RoomSubscription } from '../net/channel.ts';
import { loadProfile } from '../net/account.ts';

const MAX_PLAYERS = 8;

let session: RoomSession | null = null;
let subscription: RoomSubscription | null = null;
let meId = '';
let players: RoomPlayer[] = [];
let isHostFlag = false;
let answers: AnswerRow[] = [];
let teams: { teamId: string; name: string; memberIds: string[] }[] = [];
let current: CurrentQuestion | null = null;
let matchPhase = 'lobby';
let phaseEndsAt: string | null = null;
let timerId: number | undefined;
let advancedFor: string | null = null;
let refreshTimer: number | undefined;
/** فرق توقيت الخادم عن ساعة الجهاز بالمللي ثانية. */
let clockOffset = 0;
/** اسم اللاعب الحالي كما سيظهر داخل الغرفة. */
let myName = 'أنت';
/** XP الحالية للاعب (تُحدَّث من القاعدة بعد كل مباراة). */
let myXp = 0;

/** الوقت الحالي بمرجع الخادم (يصمد أمام ساعة هاتف غير مضبوطة). */
function serverNow(): number {
  return Date.now() + clockOffset;
}

/**
 * يحدّث الاسم و XP من القاعدة.
 * يُستدعى عند الدخول وبعد نهاية كل مباراة (لأن XP تُمنح على الخادم).
 */
async function refreshAccount(): Promise<void> {
  try {
    const profile = await loadProfile();
    if (!profile) return;
    myName = profile.displayName || myName;
    myXp = profile.xp;
  } catch {
    // لا نعطّل اللعب بسبب فشل قراءة الملف الشخصي
  }
}

/** الاسم الحقيقي لمضيف الغرفة (من قائمة اللاعبين، وأولهم هو المضيف). */
function hostDisplayName(): string {
  const host = players[0];
  if (!host) return 'المضيف';
  return host.playerId === meId ? myName : host.displayName;
}

/** اسم اللاعب من المعرّف. */
function nameOf(playerId: string): string {
  if (playerId === meId) return myName;
  return players.find((player) => player.playerId === playerId)?.displayName ?? 'لاعب';
}

/** اسم اللاعب للعرض في الشرائح والقوائم. */
function labelOf(playerId: string): string {
  if (playerId === meId) return `${myName} (أنت)`;
  return players.find((player) => player.playerId === playerId)?.displayName ?? 'لاعب';
}

/** جدول النقاط المجمّع من الإجابات. */
function standings(): { name: string; points: number }[] {
  const totals = new Map<string, number>();
  for (const answer of answers) {
    const key = answer.teamId ? `team:${answer.teamId}` : answer.playerId;
    totals.set(key, (totals.get(key) ?? 0) + answer.points);
  }
  return [...totals.entries()]
    .map(([key, points]) => ({
      name: key.startsWith('team:') ? `فريق ${key.slice(5)}` : nameOf(key),
      points,
    }))
    .sort((a, b) => b.points - a.points);
}

/** فتح لوحة اللعب على غرفة الأصدقاء. */
function openPanel(title: string): void {
  const panel = $('#gamePanel');
  const heading = $('#gameTitle');
  if (heading) heading.textContent = title;
  panel?.classList.add('open');
  panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** صندوق الغرفة: حالة غير متصل ⇒ إنشاء/انضمام، وحالة متصلة ⇒ الرمز واللاعبون. */
function renderRoomBox(): void {
  const box = $('#roomBox');
  if (!box) return;
  // لا نُظهر الصندوق تلقائياً: يبقى الظهور على زر «الغرفة» كما في التصميم الأصلي.

  if (!session) {
    box.innerHTML = `
      <div style="font-size:12px;font-weight:700;text-align:center">غرفة الأصدقاء</div>
      <p style="font-size:11px;color:var(--muted);text-align:center;margin:5px 0">
        كل لاعب يستخدم هاتفه. أنشئ غرفة وشارك الرمز، أو انضم برمز صديقك.
      </p>
      <div class="field" style="margin:10px 0 6px">
        <input id="roomName" maxlength="14" placeholder="اسمك" value="أنت"
          style="border:1px solid #e9e0d5;background:#fffefa;border-radius:12px;padding:10px 12px;font:inherit;font-size:12px;width:100%">
      </div>
      <div class="field" style="margin-bottom:10px">
        <input id="joinCode" maxlength="5" placeholder="رمز الغرفة (إن انضممت)"
          style="border:1px solid #e9e0d5;background:#fffefa;border-radius:12px;padding:10px 12px;font:inherit;font-size:12px;width:100%;text-align:center;letter-spacing:4px">
      </div>
      <div class="room-actions">
        <button class="btn" id="createRoomBtn">أنشئ غرفة</button>
        <button class="btn light" id="joinRoomBtn">انضم برمز</button>
      </div>
      <div class="room-actions" style="margin-top:8px">
        <button class="btn outline" id="soloBtn">العب لوحدي (تُحتسب XP)</button>
      </div>
      <div id="roomHint" style="text-align:center;font-size:10px;color:#8c7a6b;margin-top:9px">بلا حساب — اللعب العادي متاح للجميع.</div>`;

    $('#createRoomBtn')?.addEventListener('click', () => void handleCreate());
    $('#joinRoomBtn')?.addEventListener('click', () => void handleJoin());
    $('#soloBtn')?.addEventListener('click', () => void handleSolo());
    return;
  }

  box.innerHTML = `
    <div style="font-size:12px;font-weight:700;text-align:center">غرفة الأصدقاء</div>
    <p style="font-size:11px;color:var(--muted);text-align:center;margin:5px 0">شارك الرمز مع أصدقائك لينضموا من هواتفهم.</p>
    <div class="room-code" id="roomCode">${session.code}</div>
    <div class="room-actions">
      <button class="btn light" id="copyRoom">نسخ الرمز</button>
      <button class="btn outline" id="leaveRoom">خروج</button>
    </div>
    <div id="roomPlayers" style="text-align:center;font-size:11px;color:#8c7a6b;margin-top:10px">
      ${players.length} / ${MAX_PLAYERS} · ${players.map((player) => labelOf(player.playerId)).join(' · ')}
    </div>`;

  $('#copyRoom')?.addEventListener('click', () => {
    const code = session?.code ?? '';
    navigator.clipboard?.writeText(code).then(
      () => toast('تم نسخ رمز الغرفة'),
      () => toast('رمز الغرفة: ' + code),
    );
  });
  $('#leaveRoom')?.addEventListener('click', () => void leaveRoom());
}

async function handleCreate(): Promise<void> {
  const name = ($<HTMLInputElement>('#roomName')?.value ?? '').trim() || 'أنت';
  try {
    await ensureSession();
    meId = await currentPlayerId();
    session = await createRoom(MAX_PLAYERS);
    isHostFlag = true;
    // نضبط اسم المضيف حتى يظهر اسمه للجميع بدل الاسم الافتراضي
    await setMyName(session.code, name);
    myName = name;
    await refreshAccount();
    await refreshPlayers();
    await openLobby(name);
  } catch (error) {
    toast(error instanceof Error ? error.message : roomErrorText());
  }
}

/**
 * اللعب الفردي: مباراة موثّقة على الخادم بلاعب واحد.
 * الوقت والنقاط من الخادم، لذلك تُحتسب XP والترتيب الأسبوعي بلا أي احتمال غش.
 */
async function handleSolo(): Promise<void> {
  const name = ($<HTMLInputElement>('#roomName')?.value ?? '').trim() || 'أنت';
  try {
    await ensureSession();
    meId = await currentPlayerId();
    session = await startSoloMatch(name);
    isHostFlag = true;
    myName = name;
    await refreshAccount();
    players = await listPlayers(session.roomId);
    openPanel('تحدي المعرفة — لعبة فردية');
    await connectChannel();
    await refresh();
  } catch (error) {
    toast(error instanceof Error ? error.message : roomErrorText());
  }
}

async function handleJoin(): Promise<void> {
  const name = ($<HTMLInputElement>('#roomName')?.value ?? '').trim() || 'أنت';
  const code = ($<HTMLInputElement>('#joinCode')?.value ?? '').trim();
  if (code.length < 4) {
    toast('أدخل رمز الغرفة كاملاً');
    return;
  }
  try {
    await ensureSession();
    meId = await currentPlayerId();
    session = await joinRoom(code, name);
    isHostFlag = false;
    myName = name;
    await refreshAccount();
    await refreshPlayers();
    await openLobby(name);
  } catch (error) {
    toast(error instanceof Error ? error.message : roomErrorText());
  }
}


/** قراءة اللاعبين من القاعدة. */
async function refreshPlayers(): Promise<void> {
  if (!session) return;
  players = await listPlayers(session.roomId);
  renderRoomBox();
}

/** يفتح اللوبي في اللوحة ويربط قناة المزامنة. */
async function openLobby(hostName: string): Promise<void> {
  openPanel('غرفة الأصدقاء');
  renderLobby(hostName);
  await connectChannel();
}

/** اللوبي: الرمز واللاعبون وزر البدء (للمضيف). */
function renderLobby(hostName: string): void {
  const content = $('#gameContent');
  if (!content || !session) return;

  content.innerHTML = `
    <div style="text-align:center;padding:6px 2px 0">
      <div style="font-size:10px;color:#9a8878">رمز الغرفة</div>
      <div style="font-size:30px;letter-spacing:8px;font-weight:700;color:#2e1b15">${session.code}</div>
      <p style="font-size:11px;color:#8c8178;margin:6px 0 0">شاركه مع أصدقائك لينضموا من هواتفهم.</p>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin:14px 0 4px">
      ${players
        .map(
          (player) =>
            `<span style="font-size:11px;padding:5px 11px;border-radius:999px;border:1px solid ${
              player.playerId === meId ? '#e2d3c2' : '#e9e0d5'
            };background:${player.playerId === meId ? '#f1e8dc' : '#fffdfa'};font-weight:${
              player.playerId === meId ? '700' : '500'
            }">${labelOf(player.playerId)}</span>`,
        )
        .join('')}
    </div>
    <div style="text-align:center;font-size:10px;color:#9a8878">${players.length} من ${MAX_PLAYERS} لاعبين</div>
    <div style="text-align:center;margin-top:10px">
      <span style="display:inline-flex;align-items:baseline;gap:7px;background:#e9f4f9;border-radius:999px;padding:5px 12px">
        <span style="font-size:10px;color:#2a7191">رصيدك</span>
        <strong style="font-size:13px;color:#2a7191">${myXp} XP</strong>
      </span>
    </div>
    <div class="game-actions" style="justify-content:center;margin-top:16px">
      ${
        isHostFlag
          ? `<button class="btn" id="beginOnline">ابدأ المباراة</button>`
          : `<small>بانتظار أن يبدأ ${hostName || 'المضيف'} المباراة…</small>`
      }
    </div>`;

  $('#beginOnline')?.addEventListener('click', () => void handleStart());
}

/** المضيف يبدأ المباراة على الخادم. */
async function handleStart(): Promise<void> {
  if (!session) return;
  try {
    await startMatch(session.roomId);
    await refresh();
  } catch (error) {
    toast(error instanceof Error ? error.message : roomErrorText());
  }
}

/** ربط قناة Realtime: أي حدث يعيد القراءة من القاعدة. */
async function connectChannel(): Promise<void> {
  if (!session) return;
  if (subscription) await subscription.unsubscribe();

  // نضبط فرق التوقيت مرة عند الدخول حتى يكون العدّاد مطابقاً للخادم
  clockOffset = await fetchServerOffset();
  debug('clock_offset', String(Math.round(clockOffset)));

  subscription = subscribeRoom(session.roomId, session.matchId, {
    onPlayersChanged: () => void refresh(),
    onMatchChanged: () => void refresh(),
    onAnswerAdded: () => void refresh(),
  });
}

/** إعادة قراءة الحالة ورسم الشاشة المناسبة. */
function refresh(): Promise<void> {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  return new Promise((resolve) => {
    refreshTimer = window.setTimeout(async () => {
      if (!session) {
        resolve();
        return;
      }
      await refreshPlayers();
      const state = await fetchMatchState(session.matchId);
      if (!state) {
        resolve();
        return;
      }
      matchPhase = state.phase;
      phaseEndsAt = state.phaseEndsAt;

      if (state.phase === 'lobby') {
        renderLobby(hostDisplayName());
        startClock();
        resolve();
        return;
      }

      current = await fetchCurrentQuestion(session.matchId);
      teams =
        current.mode === 'teams' ? await listTeams(session.matchId) : [];
      answers = current.matchQuestionId
        ? await listQuestionAnswers(current.matchQuestionId)
        : await listMatchAnswers(session.matchId);

      // عند نهاية المباراة: الخادم منح XP للتو ⇒ نعيد قراءتها لتظهر في الواجهة
      if (state.phase === 'match_end') {
        await refreshAccount();
      }

      renderMatch();
      startClock();
      resolve();
    }, 120);
  });
}

/** مؤقّت محلي: يرسم العدّاد ويطلب من الخادم تقديم المرحلة عند انتهاء الوقت. */
function startClock(): void {
  window.clearInterval(timerId);
  timerId = window.setInterval(() => {
    if (!session || !phaseEndsAt) return;
    const remaining = new Date(phaseEndsAt).getTime() - serverNow();

    const num = $('#timerNum');
    if (num && matchPhase === 'question_open') {
      num.textContent = String(Math.max(0, Math.ceil(remaining / 1000)));
    }
    const fill = $('#timerFill') as HTMLElement | null;
    if (fill && current?.endsAt && current.startedAt && matchPhase === 'question_open') {
      const total = new Date(current.endsAt).getTime() - new Date(current.startedAt).getTime();
      if (total > 0) fill.style.width = `${Math.max(0, Math.min(1, remaining / total)) * 100}%`;
    }

    // انتهى الوقت: نطلب من الخادم التقديم. إن رفض (لم يحن بعد) نعيد المحاولة
    // في الدورة التالية — لأن ساعة الجهاز قد تسبق ساعة الخادم بقليل.
    const key = `${matchPhase}:${current?.questionIndex ?? 0}`;
    if (remaining <= 0 && advancedFor !== key) {
      advancedFor = key;
      void advanceMatch(session.matchId).then((result) => {
        if (!result.advanced) {
          advancedFor = null; // إعادة المحاولة في الدورة التالية
          if (result.reason && result.reason !== 'not-due') {
            debug('advance_failed', result.reason);
          }
          return;
        }
        debug('advanced', result.phase ?? '');
        void refresh();
      });
    }

    // شبكة أمان: إن تجاوزنا وقت المرحلة بأكثر من 6 ثوانٍ ولم يتغيّر شيء
    // (حدث Realtime مفقود أو تعطّل الاتصال) نعيد قراءة الحالة من القاعدة.
    if (remaining < -6000) {
      debug('stuck_reload', matchPhase);
      void refresh();
    }
  }, 300);
}

/** تشخيص خفيف يساعد في اكتشاف مشاكل المزامنة (يُقرأ من الاختبارات الآلية). */
interface DebugSnapshot {
  hasSession: boolean;
  matchId: string | null;
  phase: string;
  phaseEndsAt: string | null;
  questionIndex: number | null;
  hasQuestion: boolean;
  lastEvent: string;
}
let lastDebug = '';
function debug(event: string, extra = ''): void {
  lastDebug = extra ? `${event}:${extra}` : event;
}
declare global {
  interface Window {
    __sanaDebug?: () => DebugSnapshot;
  }
}
window.__sanaDebug = () => ({
  hasSession: Boolean(session),
  matchId: session?.matchId ?? null,
  phase: matchPhase,
  phaseEndsAt,
  questionIndex: current?.questionIndex ?? null,
  hasQuestion: Boolean(current?.prompt),
  lastEvent: lastDebug,
});

/** شاشة المباراة: تُرسم من حالة الخادم فقط. */
function renderMatch(): void {
  const content = $('#gameContent');
  if (!content || !session || !current) return;

  const phase = matchPhase;
  const qIndex = current.questionIndex;
  const qNumber = qIndex + 1;
  const qCount = current.questionCount ?? 1;

  if (phase === 'round_intro') {
    content.innerHTML = `
      <div style="text-align:center;padding:22px 6px">
        <div style="font-size:10px;color:#9a8878">الجولة ${current.roundIndex}</div>
        <h3 style="margin:6px 0 2px">${current.mode === 'teams' ? 'فرق ثنائية' : 'منافسة فردية'}</h3>
        <p style="font-size:11px;color:#8c8178;margin:0">استعد… تبدأ الأسئلة تلقائياً</p>
      </div>`;
    return;
  }

  const rows = standings();
  const scoreRows = rows
    .map(
      (row, i) =>
        `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed #eee7df">
          <span style="font-size:12px">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} ${row.name}</span>
          <strong style="font-size:12px;color:#2a7191">${row.points}</strong>
        </div>`,
    )
    .join('');

  if (phase === 'match_end') {
    content.innerHTML = `
      <div style="text-align:center;padding:8px 2px 0">
        <div style="font-size:32px">🏆</div>
        <h3 style="margin:6px 0 10px">انتهت المباراة</h3>
        <div style="display:inline-flex;align-items:baseline;gap:8px;background:#e9f4f9;border-radius:999px;padding:7px 15px;margin-bottom:12px">
          <span style="font-size:10px;color:#2a7191">رصيدك</span>
          <strong style="font-size:18px;color:#2a7191">${myXp} XP</strong>
        </div>
      </div>
      ${scoreRows}
      <div class="game-actions" style="justify-content:center;margin-top:14px">
        <button class="btn" id="backToLobby">العودة للغرفة</button>
      </div>`;
    $('#backToLobby')?.addEventListener('click', () => void leaveRoom());
    return;
  }

  if (phase === 'round_summary') {
    content.innerHTML = `
      <div style="text-align:center;padding:6px 2px 0">
        <div style="font-size:10px;color:#9a8878">انتهت الجولة ${current.roundIndex}</div>
        <h3 style="margin:6px 0 10px">الترتيب حتى الآن</h3>
      </div>
      ${scoreRows}
      <p style="text-align:center;font-size:10px;color:#9a8878;margin-top:10px">الجولة التالية تبدأ تلقائياً…</p>`;
    return;
  }

  // question_open أو question_reveal
  const isReveal = phase === 'question_reveal';
  const myAnswer = answers.find((answer) => answer.playerId === meId);
  const answeredIds = new Set(answers.map((answer) => answer.playerId));
  const answeredTeams = new Set(answers.map((answer) => answer.teamId ?? ''));
  const myTeam = teams.find((team) => team.memberIds.includes(meId));
  const myTeamAnswered = myTeam ? answeredTeams.has(myTeam.teamId) : false;
  const expectedSubmitter = myTeam ? myTeam.memberIds[qIndex % myTeam.memberIds.length] : meId;
  const canAnswer = !isReveal && !myAnswer && !myTeamAnswered && expectedSubmitter === meId;

  const chips =
    current.mode === 'teams'
      ? teams
          .map((team) => {
            const done = answeredTeams.has(team.teamId);
            return `<span style="font-size:10px;padding:4px 9px;border-radius:999px;border:1px solid ${
              done ? '#cfe6f2' : '#e9e0d5'
            };background:${done ? '#e9f4f9' : '#fffdfa'};color:${done ? '#2a7191' : '#8b8178'}">${team.name}${done ? ' ✓' : ''}</span>`;
          })
          .join('')
      : players
          .map((player) => {
            const done = answeredIds.has(player.playerId);
            return `<span style="font-size:10px;padding:4px 9px;border-radius:999px;border:1px solid ${
              done ? '#cfe6f2' : '#e9e0d5'
            };background:${done ? '#e9f4f9' : '#fffdfa'};color:${done ? '#2a7191' : '#8b8178'}">${
              labelOf(player.playerId)
            }${done ? ' ✓' : ''}</span>`;
          })
          .join('');

  const turnHint =
    !isReveal && current.mode === 'teams' && expectedSubmitter !== meId
      ? `<div class="game-feedback" style="margin:8px 0 0;color:#2a7191;font-weight:700">دور ${nameOf(expectedSubmitter)} في الإرسال</div>`
      : '';

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;color:#8c7f73;font-size:10px">
      <span>الجولة ${current.roundIndex} · السؤال ${qNumber} من ${qCount}</span>
      <span>${current.mode === 'teams' ? 'فرق ثنائية' : 'منافسة فردية'}</span>
    </div>
    ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:9px">${chips}</div>` : ''}
    ${turnHint}
    <div class="timer-row">
      <span class="timer" id="timerNum">${isReveal ? '—' : '15'}</span>
      <div class="timer-track"><div class="timer-fill" id="timerFill" style="width:${isReveal ? 0 : 100}%"></div></div>
    </div>
    <div class="question">${current.prompt ?? ''}</div>
    <div class="answers">
      ${(current.choices ?? [])
        .map(
          (choice, i) =>
            `<button class="answer${
              isReveal && i === current?.correctIndex
                ? ' correct'
                : isReveal && i === myAnswer?.choiceIndex
                  ? ' wrong'
                  : ''
            }" data-answer="${i}" ${canAnswer ? '' : 'disabled'}>${choice}</button>`,
        )
        .join('')}
    </div>
    <div class="game-feedback" id="feedback">${
      isReveal
        ? `${myAnswer ? (myAnswer.correct ? 'إجابة صحيحة! ' : 'إجابة غير صحيحة. ') : 'انتهى الوقت. '}${
            myAnswer ? `(+${myAnswer.points} نقطة) ` : ''
          }${current.explanation ?? ''}`
        : ''
    }</div>
    <div class="game-actions">
      <small>${
        isReveal
          ? 'النقاط محسوبة على الخادم.'
          : canAnswer
            ? 'أجب بسرعة لتحصل على نقاط أكثر.'
            : myAnswer || myTeamAnswered
              ? 'تم تسجيل إجابتك — بانتظار الآخرين…'
              : 'بانتظار دورك…'
      }</small>
    </div>`;

  $$<HTMLButtonElement>('[data-answer]').forEach((button) => {
    button.addEventListener('click', () => void handleOnlineAnswer(Number(button.dataset.answer)));
  });
}
/** إرسال إجابة للخادم ثم إعادة القراءة. */
async function handleOnlineAnswer(choiceIndex: number): Promise<void> {
  if (!session || !current?.matchQuestionId) return;
  try {
    const result = await submitAnswer(current.matchQuestionId, choiceIndex);
    if (!result.accepted) {
      toast(roomErrorText(result.reason));
      return;
    }
    await refresh();
  } catch (error) {
    toast(error instanceof Error ? error.message : roomErrorText());
  }
}

/** إنهاء الجلسة والعودة لحالة البداية. */
async function leaveRoom(): Promise<void> {
  window.clearInterval(timerId);
  if (refreshTimer) window.clearTimeout(refreshTimer);
  if (subscription) await subscription.unsubscribe();

  subscription = null;
  session = null;
  players = [];
  answers = [];
  teams = [];
  current = null;
  matchPhase = 'lobby';
  phaseEndsAt = null;
  advancedFor = null;

  $('#gamePanel')?.classList.remove('open');
  renderRoomBox();
}

/** تهيئة صندوق الغرفة (تُستدعى مرة من نقطة الدخول). */
export function initRoomUi(): void {
  renderRoomBox();

  // زر «اكتشف الغرفة» الموجود في البطاقة الجانبية
  $('#showRoom')?.addEventListener('click', () => {
    const box = $('#roomBox');
    box?.classList.add('show');
    box?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}
