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

-- ============================================================================
-- Заявки ИИ: ребёнок описывает, что хочет добавить в игру (docs/shared-world.md).
-- Видит заявку только автор и владелец (в панели Supabase). Статус и ответ меняет владелец.
-- ============================================================================
-- Статус списком: в панели Supabase он выбирается из меню, ошибиться нельзя
do $$ begin
  create type public.request_status as enum ('new', 'working', 'done', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.requests (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('creature', 'enemy', 'building', 'island', 'other')),
  title      text not null check (char_length(title) between 3 and 60),
  body       text not null check (char_length(body) between 10 and 420),
  status     public.request_status not null default 'new',
  reply      text check (reply is null or char_length(reply) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.requests enable row level security;

drop policy if exists requests_select_own on public.requests;
drop policy if exists requests_insert_own on public.requests;
drop policy if exists requests_delete_own on public.requests;

create policy requests_select_own on public.requests for select to authenticated using (user_id = (select auth.uid()));
create policy requests_insert_own on public.requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new' and reply is null);
create policy requests_delete_own on public.requests for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'new');

revoke all on public.requests from anon, public;
grant select, insert, delete on public.requests to authenticated;

-- Не больше 3 открытых заявок на игрока, чтобы очередь не засорялась
create or replace function public.limit_requests() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.requests where user_id = new.user_id and status in ('new', 'working')) >= 3 then
    raise exception 'too_many_open_requests';
  end if;
  return new;
end $$;

drop trigger if exists requests_limit on public.requests;
create trigger requests_limit before insert on public.requests
  for each row execute function public.limit_requests();

create or replace function public.touch_requests() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists requests_touch on public.requests;
create trigger requests_touch before update on public.requests
  for each row execute function public.touch_requests();
