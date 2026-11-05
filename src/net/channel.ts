/**
 * قناة Realtime للغرفة والمباراة.
 *
 * التقسيم (حسب توصيات Supabase):
 *   Presence  → من متصل الآن في الغرفة.
 *   Postgres  → مصدر الحقيقة: صفوف room_players و matches و match_questions و answers.
 *
 * القاعدة الأمنية: الحدث إشارة فقط؛ عند وصوله نعيد قراءة الحالة من القاعدة.
 * لذلك لا يفسد فقدان حدث أي مباراة.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';

export interface RoomChannelHandlers {
  /** تغيّرت قائمة اللاعبين في الغرفة */
  onPlayersChanged: () => void;
  /** تغيّرت حالة المباراة (مرحلة/سؤال) */
  onMatchChanged: () => void;
  /** وصلت إجابة جديدة */
  onAnswerAdded: () => void;
}

export interface RoomSubscription {
  channel: RealtimeChannel;
  unsubscribe: () => Promise<void>;
}

/** يشترك في كل ما يخص الغرفة والمباراة عبر قناة واحدة. */
export function subscribeRoom(
  roomId: string,
  matchId: string,
  handlers: RoomChannelHandlers,
): RoomSubscription {
  const channel = supabase()
    .channel(`sana-room-${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      () => handlers.onPlayersChanged(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      () => handlers.onMatchChanged(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'answers', filter: `match_id=eq.${matchId}` },
      () => handlers.onAnswerAdded(),
    )
    .subscribe();

  return {
    channel,
    unsubscribe: async () => {
      await supabase().removeChannel(channel);
    },
  };
}