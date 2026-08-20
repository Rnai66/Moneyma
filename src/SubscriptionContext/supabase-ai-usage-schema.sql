-- ════════════════════════════════════════════════════════════════════════════
-- Allslip — AI Usage Tracking Schema
-- Run in Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Create table for tracking AI usage ───────────────────────────────────
create table if not exists public.user_ai_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  month text not null, -- e.g. "2024-04"
  date text not null,  -- e.g. "2024-04-29"
  daily_count integer not null default 0,
  monthly_count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ── 2. Row Level Security (RLS) ─────────────────────────────────────────────
alter table public.user_ai_usage enable row level security;

-- Users can view their own AI usage
create policy "user_read_own_ai_usage"
  on public.user_ai_usage for select
  using (auth.uid() = user_id);

-- ── 3. Atomic Increment Function (RPC) ──────────────────────────────────────
-- This function securely increments the usage without race conditions
-- which is important when batch scanning multiple slips concurrently.
create or replace function public.increment_ai_usage(p_user_id uuid, p_month text, p_date text)
returns void
language plpgsql
security definer -- runs as admin to bypass RLS for inserts/updates
as $$
begin
  insert into public.user_ai_usage (user_id, month, date, daily_count, monthly_count)
  values (p_user_id, p_month, p_date, 1, 1)
  on conflict (user_id) do update
  set
    daily_count = case 
      when public.user_ai_usage.date = p_date then public.user_ai_usage.daily_count + 1
      else 1 
    end,
    monthly_count = case 
      when public.user_ai_usage.month = p_month then public.user_ai_usage.monthly_count + 1
      else 1 
    end,
    date = p_date,
    month = p_month,
    updated_at = now();
end;
$$;
