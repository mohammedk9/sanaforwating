/**
 * رسومات فنجان سنا — مشاركة ولايكات وحذف الأدمن.
 * يعمل عبر Supabase RPC (هجرة 0007) مع تراجع محلي (localStorage) حتى يعمل المعرض قبل تشغيل الهجرة.
 */
import { hasSupabase } from '../env.ts';
import { ensureSession, supabase } from './supabase.ts';

export interface Artwork {
  id: string;
  image: string;
  name: string;
  likes: number;
  createdAt: string;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase().rpc(name, args);
  if (error) throw new Error(error.message || 'تعذّر تنفيذ العملية.');
  return data;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
export { esc };

// --- Local fallback ---
const LS_KEY = 'sana.artworks.local.v1';
function readLocal(): Artwork[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Artwork[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writeLocal(items: Artwork[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, 60))); } catch { /* ignore */ }
}
export function likedLocally(id: string): boolean {
  try { return localStorage.getItem('sana.liked.' + id) === '1'; } catch { return false; }
}
export function markLiked(id: string): void {
  try { localStorage.setItem('sana.liked.' + id, '1'); } catch { /* ignore */ }
}

export async function publishArtwork(image: string, name: string): Promise<Artwork> {
  const cleanName = (name || 'ضيف سنا').trim().slice(0, 40) || 'ضيف سنا';
  if (!image.startsWith('data:image/png') && !image.startsWith('data:image/jpeg')) {
    throw new Error('صورة غير صالحة.');
  }
  if (!hasSupabase()) {
    const items = readLocal();
    const item: Artwork = { id: 'local-' + Date.now().toString(36), image, name: cleanName, likes: 0, createdAt: new Date().toISOString() };
    writeLocal([item, ...items]);
    return item;
  }
  try {
    await ensureSession();
    const data = (await rpc('publish_artwork', { p_image: image, p_name: cleanName })) as { ok?: boolean; reason?: string; id?: string };
    if (!data?.ok || !data.id) throw new Error(data?.reason || 'تعذّر النشر.');
    return { id: data.id, image, name: cleanName, likes: 0, createdAt: new Date().toISOString() };
  } catch {
    const items = readLocal();
    const item: Artwork = { id: 'local-' + Date.now().toString(36), image, name: cleanName, likes: 0, createdAt: new Date().toISOString() };
    writeLocal([item, ...items]);
    return item;
  }
}

export async function likeArtwork(id: string): Promise<number> {
  if (!hasSupabase() || id.startsWith('local-')) {
    const items = readLocal().map((a) => (a.id === id ? { ...a, likes: a.likes + 1 } : a));
    writeLocal(items);
    const found = items.find((a) => a.id === id);
    return found?.likes ?? 0;
  }
  try {
    await ensureSession();
    const data = (await rpc('like_artwork', { p_id: id })) as { ok?: boolean; reason?: string; likes?: number };
    if (!data?.ok) throw new Error(data?.reason || 'تعذّر الإعجاب.');
    return data.likes ?? 0;
  } catch {
    const items = readLocal().map((a) => (a.id === id ? { ...a, likes: a.likes + 1 } : a));
    writeLocal(items);
    return items.find((a) => a.id === id)?.likes ?? 0;
  }
}

export async function listArtworks(): Promise<Artwork[]> {
  if (!hasSupabase()) return readLocal();
  try {
    await ensureSession();
    const data = (await rpc('list_artworks', {})) as Array<Record<string, unknown>>;
    if (Array.isArray(data) && data.length) {
      return data.map((r) => ({
        id: String(r.id ?? ''),
        image: String(r.image ?? ''),
        name: String(r.name ?? 'ضيف سنا'),
        likes: Number(r.likes ?? 0),
        createdAt: String(r.createdAt ?? r.created_at ?? new Date().toISOString()),
      }));
    }
    return readLocal();
  } catch {
    return readLocal();
  }
}

export async function deleteArtwork(id: string): Promise<void> {
  if (id.startsWith('local-')) {
    writeLocal(readLocal().filter((a) => a.id !== id));
    return;
  }
  await ensureSession();
  const data = (await rpc('admin_delete_artwork', { p_id: id })) as { ok?: boolean; reason?: string };
  if (!data?.ok) throw new Error(data?.reason === 'not-staff' ? 'ليس لديك صلاحية موظف.' : 'تعذّر الحذف.');
}

export function artworkCardHtml(a: Artwork, canDelete: boolean): string {
  const liked = likedLocally(a.id);
  const date = a.createdAt ? new Date(a.createdAt).toLocaleDateString('ar-SA') : '';
  return `<article class="art-card" data-id="${esc(a.id)}">
    <div class="art-img"><img src="${esc(a.image)}" alt="رسم ${esc(a.name)}" loading="lazy" decoding="async" width="150" height="150"></div>
    <div class="art-meta"><strong>${esc(a.name)}</strong><span>${esc(date)}</span></div>
    <div class="art-actions">
      <button class="art-like${liked ? ' liked' : ''}" data-like="${esc(a.id)}" ${liked ? 'disabled' : ''} aria-pressed="${liked}">❤️ ${a.likes}</button>
      ${canDelete ? `<button class="art-del" data-del="${esc(a.id)}">حذف</button>` : ''}
    </div>
  </article>`;
}
