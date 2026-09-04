-- Приложение обращается к Supabase без выполненного supabase.auth signIn
-- (см. src/services/supabase.ts: persistSession/autoRefreshToken выключены,
-- signIn нигде не вызывается) — все запросы идут под ролью anon. Остальные
-- v2_*-таблицы поэтому имеют policy и для authenticated, и для anon
-- (crm_v2_schema.sql, блок "v2 anon read"/"v2 anon write"). Миграция
-- 20260904063259_create_refunds.sql по ошибке завела только authenticated —
-- добавляем недостающие anon-политики.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_refunds' and policyname = 'v2 anon read'
  ) then
    create policy "v2 anon read" on public.v2_refunds for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_refunds' and policyname = 'v2 anon write'
  ) then
    create policy "v2 anon write" on public.v2_refunds for all to anon using (true) with check (true);
  end if;
end $$;
