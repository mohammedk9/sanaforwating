/**
 * أدوات صندوق الغرفة (إظهار/إخفاء).
 * منطق الغرفة الحقيقي في src/ui/room.ts — لم يبقَ هنا أي «لاعب تجريبي».
 */
import { $ } from './dom.ts';

/** إظهار صندوق الغرفة. */
export function showRoomBox(): void {
  $('#roomBox')?.classList.add('show');
}

/** إخفاء صندوق الغرفة (يُستدعى عند فتح لعبة محلية). */
export function hideRoomBox(): void {
  $('#roomBox')?.classList.remove('show');
}