-- MicroManus — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Everything here is idempotent-ish for a fresh project.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  paywall_unlocked boolean not null default false,
  coupon_redeemed boolean not null default false,
  credits_balance integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  dodo_payment_id text,
  dodo_checkout_session_id text,
  amount_cents integer not null,
  currency text not null default 'USD',
  status text not null check (status in ('pending','succeeded','failed')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One payment row per Dodo payment id, so webhook processing is idempotent.
create unique index if not exists payments_dodo_payment_id_key
  on payments (dodo_payment_id) where dodo_payment_id is not null;

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  amount integer not null,          -- positive = credit, negative = debit
  type text not null check (type in ('coupon_redemption','payment','agent_run_debit','manual_adjustment')),
  reference_id text,
  balance_after integer not null,
  created_at timestamptz not null default now()
);

create table if not exists llm_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  provider text not null check (provider in ('anthropic','openai','moonshot','custom')),
  label text,
  api_key_encrypted text not null,
  base_url text,                    -- required for 'custom', optional override for others
  created_at timestamptz not null default now()
);

create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null default 'New chat',
  provider text not null,
  model_id text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool','system')),
  content text,
  tool_calls jsonb,
  tool_results jsonb,
  sequence_number integer not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_id_seq_idx on messages (chat_id, sequence_number);

create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  provider text not null,
  model_id text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_input_usd numeric(12,6) not null default 0,
  cost_output_usd numeric(12,6) not null default 0,
  cost_cache_usd numeric(12,6) not null default 0,
  cost_total_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists usage_logs_chat_id_idx on usage_logs (chat_id);
create index if not exists usage_logs_user_id_idx on usage_logs (user_id);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  type text not null default 'pdf_report',
  storage_path text not null,
  title text,
  created_at timestamptz not null default now()
);
create index if not exists artifacts_chat_id_idx on artifacts (chat_id);

create table if not exists model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_id text not null,
  display_name text not null,
  input_price_per_mtok numeric(12,4) not null,
  output_price_per_mtok numeric(12,4) not null,
  cache_read_price_per_mtok numeric(12,4) not null default 0,
  cache_write_price_per_mtok numeric(12,4) not null default 0,
  context_window integer,
  is_active boolean not null default true
);
create unique index if not exists model_pricing_model_key
  on model_pricing (provider, model_id);

-- ---------------------------------------------------------------------------
-- Auto-create profile on new auth user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles            enable row level security;
alter table payments            enable row level security;
alter table credit_transactions enable row level security;
alter table llm_credentials     enable row level security;
alter table chats               enable row level security;
alter table messages            enable row level security;
alter table usage_logs          enable row level security;
alter table artifacts           enable row level security;
alter table model_pricing       enable row level security;

-- profiles: a user can read/update only their own row.
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- payments: read own only. Writes happen via service-role (webhook/checkout).
drop policy if exists "payments_select_own" on payments;
create policy "payments_select_own" on payments
  for select using (auth.uid() = user_id);

-- credit_transactions: read own only. Writes via service-role.
drop policy if exists "credit_tx_select_own" on credit_transactions;
create policy "credit_tx_select_own" on credit_transactions
  for select using (auth.uid() = user_id);

-- llm_credentials: full CRUD on own rows (encrypted key never leaves server).
drop policy if exists "llm_cred_all_own" on llm_credentials;
create policy "llm_cred_all_own" on llm_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- chats: full CRUD on own rows.
drop policy if exists "chats_all_own" on chats;
create policy "chats_all_own" on chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- messages: gated through the parent chat's owner.
drop policy if exists "messages_all_own" on messages;
create policy "messages_all_own" on messages
  for all
  using (exists (select 1 from chats c where c.id = messages.chat_id and c.user_id = auth.uid()))
  with check (exists (select 1 from chats c where c.id = messages.chat_id and c.user_id = auth.uid()));

-- usage_logs: read own only. Writes via service-role during agent runs.
drop policy if exists "usage_logs_select_own" on usage_logs;
create policy "usage_logs_select_own" on usage_logs
  for select using (auth.uid() = user_id);

-- artifacts: read gated through parent chat owner. Writes via service-role.
drop policy if exists "artifacts_select_own" on artifacts;
create policy "artifacts_select_own" on artifacts
  for select
  using (exists (select 1 from chats c where c.id = artifacts.chat_id and c.user_id = auth.uid()));

-- model_pricing: public read; writes only via service-role (no policy = denied).
drop policy if exists "model_pricing_read_all" on model_pricing;
create policy "model_pricing_read_all" on model_pricing
  for select using (true);

-- ---------------------------------------------------------------------------
-- Seed model pricing (USD per 1M tokens). Verify against live pricing pages.
--   Anthropic prices are current as of build (Opus 4.8 tier).
--   OpenAI (gpt-5.6-*) and Moonshot (kimi-*) figures follow the brief's
--   approximate numbers — update in this table (no code change needed).
--   Cache-write for OpenAI/Moonshot = input price (no distinct write cost).
-- ---------------------------------------------------------------------------

insert into model_pricing
  (provider, model_id, display_name, input_price_per_mtok, output_price_per_mtok,
   cache_read_price_per_mtok, cache_write_price_per_mtok, context_window, is_active)
values
  -- Anthropic
  ('anthropic','claude-sonnet-5','Claude Sonnet 5',            3.00, 15.00, 0.30, 3.75, 1000000, true),
  ('anthropic','claude-opus-4-8','Claude Opus 4.8',            5.00, 25.00, 0.50, 6.25, 1000000, true),
  ('anthropic','claude-haiku-4-5-20251001','Claude Haiku 4.5', 1.00,  5.00, 0.10, 1.25,  200000, true),
  ('anthropic','claude-fable-5','Claude Fable 5',             10.00, 50.00, 1.00,12.50, 1000000, true),
  -- OpenAI
  ('openai','gpt-5.6-sol','GPT-5.6 Sol',                       5.00, 30.00, 2.50, 5.00,  400000, true),
  ('openai','gpt-5.6-terra','GPT-5.6 Terra',                   2.50, 15.00, 1.25, 2.50,  400000, true),
  ('openai','gpt-5.6-luna','GPT-5.6 Luna',                     1.00,  6.00, 0.50, 1.00,  400000, true),
  ('openai','o4-mini','o4-mini',                               0.55,  2.20, 0.275,0.55,  200000, true),
  -- Moonshot / Kimi
  ('moonshot','kimi-k2.6','Kimi K2.6',                         0.95,  4.00, 0.475,0.95,  256000, true),
  ('moonshot','kimi-k2.5','Kimi K2.5',                         0.60,  3.00, 0.30, 0.60,  256000, true),
  ('moonshot','kimi-k3','Kimi K3',                             3.00, 15.00, 1.50, 3.00, 1000000, true)
on conflict (provider, model_id) do update set
  display_name              = excluded.display_name,
  input_price_per_mtok      = excluded.input_price_per_mtok,
  output_price_per_mtok     = excluded.output_price_per_mtok,
  cache_read_price_per_mtok = excluded.cache_read_price_per_mtok,
  cache_write_price_per_mtok= excluded.cache_write_price_per_mtok,
  context_window            = excluded.context_window,
  is_active                 = excluded.is_active;
