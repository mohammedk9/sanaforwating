-- ============================================================================
-- SANA — صور المنتجات عبر Supabase Storage (0012)
-- الصق كاملاً في Supabase ← SQL Editor ← Run (آمن للتكرار)
--
-- الفكرة:
--   - bucket عام اسمه menu-images يحفظ صور المنيو.
--   - الرفع مسموح للموظف/المدير فقط (authenticated + is_staff).
--   - القراءة عامة (صور المنيو تظهر للجميع) عبر Public URL.
-- ============================================================================

-- 1) إنشاء الحاوية (bucket) عامة القراءة
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  3145728,  -- 3 ميجابايت
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) سياسات القراءة العامة (الكل يرى الصور)
drop policy if exists menu_images_public_read on storage.objects;
create policy menu_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-images');

-- 3) الرفع: الموظف/المدير فقط
drop policy if exists menu_images_staff_insert on storage.objects;
create policy menu_images_staff_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and (select private.is_staff()));

-- 4) التحديث (استبدال): الموظف/المدير فقط
drop policy if exists menu_images_staff_update on storage.objects;
create policy menu_images_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and (select private.is_staff()))
  with check (bucket_id = 'menu-images' and (select private.is_staff()));

-- 5) الحذف: الموظف/المدير فقط
drop policy if exists menu_images_staff_delete on storage.objects;
create policy menu_images_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and (select private.is_staff()));

-- ------------------------------------------------------------- تحقق سريع
select
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'menu-images';