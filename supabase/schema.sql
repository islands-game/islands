-- Облачные сохранения ISLANDS (Supabase / Postgres).
-- Запускается один раз в Supabase: SQL Editor -> New query -> вставить -> Run.
-- Правила безопасности: каждый игрок видит и меняет только свою строку. Доступа для анонимов нет.

create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  version    int not null default 1,
  updated_at timestamptz not null default now(),
  constraint saves_size check (pg_column_size(data) < 200000)     -- защита от мусора и переполнения
);

alter table public.saves enable row level security;

drop policy if exists saves_select_own on public.saves;
drop policy if exists saves_insert_own on public.saves;
drop policy if exists saves_update_own on public.saves;
drop policy if exists saves_delete_own on public.saves;

create policy saves_select_own on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy saves_insert_own on public.saves for insert to authenticated with check (user_id = (select auth.uid()));
create policy saves_update_own on public.saves for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saves_delete_own on public.saves for delete to authenticated using (user_id = (select auth.uid()));

-- Новые таблицы по умолчанию закрыты, поэтому права выдаём явно (только вошедшим игрокам)
revoke all on public.saves from anon, public;
grant select, insert, update, delete on public.saves to authenticated;

-- Время записи ставит сервер, а не игрок
create or replace function public.touch_saves() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before insert or update on public.saves
  for each row execute function public.touch_saves();

-- «Удалить мой аккаунт и данные»: игрок удаляет сам себя (сохранение удалится вместе с ним)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = (select auth.uid());
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
