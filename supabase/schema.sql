-- Investa: contas e dados na nuvem (Supabase).
-- Cole este arquivo inteiro em Supabase → SQL Editor → New query → Run.
-- Pode rodar de novo sem problema: ele só cria o que ainda não existe e
-- atualiza funções e permissões. Para aplicar uma versão nova, rode de novo.
--
-- Regras de segurança:
-- • Cada conta só lê e altera o próprio perfil e os próprios dados.
-- • A lista de contas (Usuários) só mostra dados de cadastro, nunca dados
--   financeiros, e só para o Dono e Administradores.
-- • Ninguém muda o próprio cargo; só o Dono muda cargos.
-- • Contas criadas pela tela de cadastro começam bloqueadas até o Dono liberar.

-- ---------------------------------------------------------------------------
-- Tabelas

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null,
  name text not null,
  email text,
  role text not null default 'usuario' check (role in ('dono', 'adm', 'usuario')),
  status text not null default 'ativo' check (status in ('ativo', 'bloqueado')),
  avatar_hue int not null default 200,
  data jsonb not null default '{}'::jsonb,
  data_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- Configuração da IA compartilhada pelas contas liberadas (só o Dono altera).
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  ai jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings add column if not exists approve_new_accounts boolean not null default true;
insert into public.app_settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Funções auxiliares

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'ativo'
$$;

-- Toda conta criada ganha um perfil. A primeira de todas é a do Dono; as
-- outras sempre começam como Usuário, não importa o que o aplicativo mande.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_account boolean := not exists (select 1 from profiles);
  approve boolean := coalesce((select approve_new_accounts from app_settings where id = 1), true);
  login text := split_part(new.email, '@', 1);
  uname text := coalesce(nullif(new.raw_user_meta_data->>'username', ''), login);
begin
  -- O nome de usuário tem de ser o mesmo do login, senão alguém poderia
  -- reservar o nome de outra pessoa.
  if lower(uname) <> lower(login) then
    uname := login;
  end if;
  insert into profiles (id, username, name, email, role, status, avatar_hue)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), 'Usuário'),
    nullif(new.raw_user_meta_data->>'contact_email', ''),
    case when first_account then 'dono' else 'usuario' end,
    case when first_account or not approve then 'ativo' else 'bloqueado' end,
    coalesce((new.raw_user_meta_data->>'avatar_hue')::int, 200)
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Regras de cargo: só o Dono muda cargos, ninguém se bloqueia, sempre existe
-- um Dono, e ninguém mexe nos dados financeiros de outra pessoa.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text := my_role();
begin
  if auth.uid() is null then
    return new; -- alteração feita pelo painel do Supabase
  end if;
  if new.id <> old.id or new.username <> old.username then
    raise exception 'O nome de usuário não pode ser trocado.';
  end if;
  if new.role is distinct from old.role then
    if r is distinct from 'dono' then
      raise exception 'Apenas o Dono pode mudar cargos.';
    end if;
    if old.role = 'dono' and (select count(*) from profiles where role = 'dono') <= 1 then
      raise exception 'O aplicativo precisa ter pelo menos um Dono.';
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.id = auth.uid() then
      raise exception 'Você não pode bloquear a própria conta.';
    end if;
    if old.role = 'dono' and new.status = 'bloqueado' and (select count(*) from profiles where role = 'dono' and status = 'ativo') <= 1 then
      raise exception 'Não é possível bloquear o único Dono.';
    end if;
  end if;
  if new.id <> auth.uid() then
    if r is null or r = 'usuario' then
      raise exception 'Sem permissão para alterar outra conta.';
    end if;
    if new.data is distinct from old.data then
      raise exception 'Sem permissão para alterar os dados de outra conta.';
    end if;
    if r = 'adm' and old.role <> 'usuario' then
      raise exception 'Administradores só gerenciam contas de Usuário.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------------------------------------------------------------------------
-- Permissões (Row Level Security)

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;

-- Cada conta vê e altera só a própria linha. O Dono e os Administradores
-- gerenciam as outras pelas funções admin_* abaixo, que não expõem os dados.
drop policy if exists "ler perfis" on public.profiles;
create policy "ler perfis" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "alterar perfis" on public.profiles;
create policy "alterar perfis" on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "ler configuracao" on public.app_settings;
create policy "ler configuracao" on public.app_settings for select to authenticated
  using (public.my_role() is not null);

drop policy if exists "alterar configuracao" on public.app_settings;
create policy "alterar configuracao" on public.app_settings for update to authenticated
  using (public.my_role() = 'dono')
  with check (public.my_role() = 'dono');

-- Contas novas são criadas só pelo cadastro (gatilho acima); ninguém apaga
-- linhas direto. Visitantes sem login não acessam nada.
revoke all on table public.profiles from anon;
revoke all on table public.app_settings from anon;
revoke insert, delete, truncate, references, trigger on table public.profiles from authenticated;
revoke insert, delete, truncate, references, trigger on table public.app_settings from authenticated;
grant select, update on table public.profiles to authenticated;
grant select, update on table public.app_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Ações de administração (rodam no servidor, com as regras acima)

-- Lista de contas para a tela Usuários: só dados de cadastro.
create or replace function public.admin_list_users()
returns table (id uuid, username text, name text, email text, role text, status text, avatar_hue int, created_at timestamptz, last_login_at timestamptz, onboarded boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.name, p.email, p.role, p.status, p.avatar_hue, p.created_at, p.last_login_at,
         coalesce(p.data->'profile'->'onboarded' = 'true'::jsonb, false)
  from profiles p
  where public.my_role() in ('dono', 'adm')
  order by p.created_at
$$;

-- Nome, e-mail, cargo e bloqueio. O gatilho profiles_guard confere as regras de cargo.
create or replace function public.admin_update_user(target uuid, new_name text default null, new_email text default null, new_role text default null, new_status text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r text := my_role();
  t text;
begin
  select role into t from profiles where id = target;
  if t is null then raise exception 'Usuário não encontrado.'; end if;
  if not (target = auth.uid() or r = 'dono' or (r = 'adm' and t = 'usuario')) then
    raise exception 'Você não pode alterar esta conta.';
  end if;
  update profiles set
    name = coalesce(nullif(btrim(new_name), ''), name),
    email = case when new_email is null then email else nullif(btrim(new_email), '') end,
    role = coalesce(new_role, role),
    status = coalesce(new_status, status)
  where id = target;
end $$;

revoke all on function public.my_role() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_update_user(uuid, text, text, text, text) from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user(uuid, text, text, text, text) to authenticated;

create or replace function public.admin_set_password(target uuid, new_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  r text := my_role();
  t text;
begin
  select role into t from profiles where id = target;
  if t is null then raise exception 'Usuário não encontrado.'; end if;
  if not (r = 'dono' or (r = 'adm' and t = 'usuario')) then
    raise exception 'Você não pode alterar a senha desta conta.';
  end if;
  if length(new_password) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  update auth.users set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')) where id = target;
end $$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  r text := my_role();
  t text;
begin
  if target = auth.uid() then raise exception 'Você não pode excluir a própria conta por aqui.'; end if;
  select role into t from profiles where id = target;
  if t is null then raise exception 'Usuário não encontrado.'; end if;
  if not (r = 'dono' or (r = 'adm' and t = 'usuario')) then
    raise exception 'Você não pode excluir esta conta.';
  end if;
  if t = 'dono' and (select count(*) from profiles where role = 'dono') <= 1 then
    raise exception 'O aplicativo precisa ter pelo menos um Dono.';
  end if;
  delete from auth.users where id = target;
end $$;

-- O ranking das aulas mostrava quem mais usa o app; foi removido.
drop function if exists public.leaderboard();

revoke all on function public.admin_set_password(uuid, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Limites no próprio banco (o app também valida, mas o banco não depende disso).
-- "not valid" não mexe em linhas antigas; vale para tudo que for gravado daqui em diante.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_formato') then
    alter table public.profiles add constraint profiles_username_formato
      check (char_length(username) between 3 and 24 and username ~ '^[A-Za-z0-9._-]+$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_tamanho') then
    alter table public.profiles add constraint profiles_name_tamanho check (char_length(name) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_hue') then
    alter table public.profiles add constraint profiles_avatar_hue check (avatar_hue between 0 and 360) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_data_tamanho') then
    -- Pacote de dados de uma conta: até 5 MB (o app usa bem menos).
    alter table public.profiles add constraint profiles_data_tamanho check (pg_column_size(data) <= 5242880) not valid;
  end if;
end $$;
