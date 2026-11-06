-- SANA — رسومات فنجان سنا: مشاركة + لايكات + حذف الأدمن (0007)
-- يتطلب 0004 (private.require_staff). الصق كاملاً في Supabase ← SQL Editor ← Run (آمن للتكرار)

create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  image_data text not null check (char_length(image_data) <= 900000),
  author_name text not null default 'ضيف سنا' check (char_length(author_name) between 1 and 40),
  likes_count integer not null default 0 check (likes_count >= 0),
  created_at timestamptz not null default now()
);
alter table public.artworks enable row level security;
revoke all privileges on table public.artworks from PUBLIC, anon, authenticated;
grant select, insert on table public.artworks to anon, authenticated;
grant update, delete on table public.artworks to authenticated;
drop policy if exists artworks_read on public.artworks;
create policy artworks_read on public.artworks for select to anon, authenticated using (true);
drop policy if exists artworks_insert on public.artworks;
create policy artworks_insert on public.artworks for insert to anon, authenticated with check (true);
drop policy if exists artworks_staff_update on public.artworks;
create policy artworks_staff_update on public.artworks for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
drop policy if exists artworks_staff_delete on public.artworks;
create policy artworks_staff_delete on public.artworks for delete to authenticated
  using ((select private.is_staff()));

create table if not exists public.artwork_likes (
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (artwork_id, user_id)
);
alter table public.artwork_likes enable row level security;
revoke all privileges on table public.artwork_likes from PUBLIC, anon, authenticated;
grant select, insert, delete on table public.artwork_likes to anon, authenticated;
drop policy if exists artwork_likes_read on public.artwork_likes;
create policy artwork_likes_read on public.artwork_likes for select to anon, authenticated using (true);
drop policy if exists artwork_likes_insert on public.artwork_likes;
create policy artwork_likes_insert on public.artwork_likes for insert to anon, authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists artwork_likes_delete on public.artwork_likes;
create policy artwork_likes_delete on public.artwork_likes for delete to anon, authenticated
  using (user_id = (select auth.uid()));


create or replace function public.publish_artwork(p_image text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_image text := btrim(coalesce(p_image,''));
  v_name text := btrim(coalesce(p_name,'ضيف سنا'));
  v_id uuid;
begin
  if v_image = '' or v_image !~ '^data:image/(png|jpeg);base64,' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-image');
  end if;
  if char_length(v_image) > 900000 then
    return jsonb_build_object('ok', false, 'reason', 'image-too-large');
  end if;
  if v_name = '' then v_name := 'ضيف سنا'; end if;
  v_name := left(v_name, 40);
  insert into public.artworks (image_data, author_name) values (v_image, v_name) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id::text);
end $$;
revoke all on function public.publish_artwork(text, text) from PUBLIC, anon;
grant execute on function public.publish_artwork(text, text) to anon, authenticated;

create or replace function public.list_artworks()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id::text, 'image', a.image_data, 'name', a.author_name,
      'likes', a.likes_count, 'createdAt', a.created_at
    ) order by a.created_at desc
  ), '[]'::jsonb) into v_rows from (
    select * from public.artworks order by created_at desc limit 120
  ) a;
  return v_rows;
end $$;
revoke all on function public.list_artworks() from PUBLIC, anon;

create or replace function public.like_artwork(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_uid uuid := (select auth.uid());
  v_likes integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no-session'); end if;
  begin v_id := p_id::uuid;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
  if not exists (select 1 from public.artworks where id = v_id) then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  insert into public.artwork_likes (artwork_id, user_id) values (v_id, v_uid)
  on conflict do nothing;
  if found then
    update public.artworks set likes_count = likes_count + 1 where id = v_id;
  end if;
  select likes_count into v_likes from public.artworks where id = v_id;
  return jsonb_build_object('ok', true, 'likes', coalesce(v_likes, 0));
end $$;
revoke all on function public.like_artwork(text) from PUBLIC, anon;
grant execute on function public.like_artwork(text) to anon, authenticated;

create or replace function public.admin_delete_artwork(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_staff();
  begin v_id := p_id::uuid;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'invalid-id'); end;
  delete from public.artworks where id = v_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_delete_artwork(text) from PUBLIC, anon;
grant execute on function public.admin_delete_artwork(text) to authenticated;

select (select count(*) from public.artworks) as artworks_count;

grant execute on function public.list_artworks() to anon, authenticated;
