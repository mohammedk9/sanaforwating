-- ======================================================================
-- SANA — Web Push «طلبك جاهز» (0006) — نسخة مُصحَّحة وكاملة
-- يتطلب: 0004_admin.sql + تشغيل supabase/functions/push/index.ts فعلياً
-- (Web Push بلا Edge Function = بلا إشعارات بعد الإغلاق).
-- الخطوات الكاملة في: supabase/functions/push/README.md
-- الصق كاملاً في Supabase ← SQL Editor ← Run (آمن للتكرار)
-- ======================================================================

-- ---------------------------------------------------------------- push_subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  phone text,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

drop policy if exists push_customer on public.push_subscriptions;
create policy push_customer on public.push_subscriptions
  for all to anon, authenticated using (true) with check (true);

revoke all privileges on table public.push_subscriptions from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to anon, authenticated;

-- ---------------------------------------------------------------- notify: عند ready أرسل عبر pg_net إن وُجدت
-- (Webhooks المعتمدة هي المسار الموصى به — لكن pg_net يُبقي الذنب محتملاً)
create or replace function private.notify_order_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
begin
  v_number := coalesce(new.number, old.number);
  if new.status = 'ready' and (old.status is distinct from new.status) then
    -- إن لم توجد pg_net: لا شيء هنا يرسل — سيتكفّل Supabase Webhook بالـ Edge Function
    if exists (select 1 from pg_extension where extname = 'pg_net') then
      perform net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/push',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('orderNumber', v_number)
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_ready_push on public.orders;
create trigger orders_ready_push
  after update of status on public.orders
  for each row execute function private.notify_order_ready();

drop trigger if exists ext_orders_ready_push on public.external_orders;
create trigger ext_orders_ready_push
  after update of status on public.external_orders
  for each row execute function private.notify_order_ready();

select count(*) as push_subscriptions_count from public.push_subscriptions;
