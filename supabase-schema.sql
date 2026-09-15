-- ============================================================
-- MoneyMa / Allslip Complete Database Schema
-- Run this in Supabase Dashboard -> SQL Editor
-- ============================================================

-- Enable pgcrypto for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. User Profiles Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'business', 'lifetime')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Subscriptions Table (Source of Truth for Plan & Billing)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business', 'lifetime')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'trial', 'past_due')),
  provider TEXT CHECK (provider IN ('revenuecat', 'stripe', 'manual', null)),
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id)
);

-- ============================================================
-- 3. Transactions Table (Cloud Sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(12,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'อื่น ๆ',
  description TEXT,
  date DATE NOT NULL,
  synced BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. Budget Limits Table (Category Budgeting)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  limit_amount DECIMAL(12,2) NOT NULL,
  alert_threshold INTEGER DEFAULT 80 CHECK (alert_threshold >= 0 AND alert_threshold <= 100),
  period TEXT DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT budget_limits_user_cat_period_unique UNIQUE (user_id, category, period)
);

-- ============================================================
-- 5. AI Usage Tracking Table (Slip OCR & Gemini Rate Limits)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_ai_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- e.g. "2026-09"
  date TEXT NOT NULL,  -- e.g. "2026-09-06"
  daily_count INTEGER NOT NULL DEFAULT 0,
  monthly_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. Products & Multi-Warehouse Stock Table (Business POS)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'ทั่วไป',
  cost DECIMAL(12,2) DEFAULT 0.00,
  price DECIMAL(12,2) DEFAULT 0.00,
  stock INTEGER DEFAULT 0,
  warehouse1 INTEGER DEFAULT 0,
  warehouse2 INTEGER DEFAULT 0,
  warehouse3 INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. Sales History Table (Completed POS Sales)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sales_history (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  customer_name TEXT,
  customer_tax_id TEXT,
  total_amount DECIMAL(12,2) NOT NULL,
  items JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. Purchase Order History Table (Completed Stock In POs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.po_history (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  target_warehouse TEXT,
  supplier_name TEXT,
  supplier_tax_id TEXT,
  total_amount DECIMAL(12,2) NOT NULL,
  items JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. Error Logs Table (Crash & Diagnostic Reporting)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  error_message TEXT,
  error_stack TEXT,
  error_type TEXT,
  app_version TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. Sync History Table (Sync Status & Telemetry)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'completed', 'failed')),
  synced_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security (RLS) Configuration
-- ============================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

-- user_profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- subscriptions policies
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;

CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own subscription" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscription" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- transactions policies
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- budget_limits policies
DROP POLICY IF EXISTS "Users can view own budget limits" ON public.budget_limits;
DROP POLICY IF EXISTS "Users can insert own budget limits" ON public.budget_limits;
DROP POLICY IF EXISTS "Users can update own budget limits" ON public.budget_limits;
DROP POLICY IF EXISTS "Users can delete own budget limits" ON public.budget_limits;

CREATE POLICY "Users can view own budget limits" ON public.budget_limits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budget limits" ON public.budget_limits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own budget limits" ON public.budget_limits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own budget limits" ON public.budget_limits FOR DELETE USING (auth.uid() = user_id);

-- user_ai_usage policies
DROP POLICY IF EXISTS "Users can view own ai usage" ON public.user_ai_usage;
DROP POLICY IF EXISTS "user_read_own_ai_usage" ON public.user_ai_usage;
CREATE POLICY "Users can view own ai usage" ON public.user_ai_usage FOR SELECT USING (auth.uid() = user_id);

-- products policies
DROP POLICY IF EXISTS "Users can view own products" ON public.products;
DROP POLICY IF EXISTS "Users can insert own products" ON public.products;
DROP POLICY IF EXISTS "Users can update own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete own products" ON public.products;

CREATE POLICY "Users can view own products" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON public.products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON public.products FOR DELETE USING (auth.uid() = user_id);

-- sales_history policies
DROP POLICY IF EXISTS "Users can view own sales history" ON public.sales_history;
DROP POLICY IF EXISTS "Users can insert own sales history" ON public.sales_history;
DROP POLICY IF EXISTS "Users can update own sales history" ON public.sales_history;
DROP POLICY IF EXISTS "Users can delete own sales history" ON public.sales_history;

CREATE POLICY "Users can view own sales history" ON public.sales_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sales history" ON public.sales_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sales history" ON public.sales_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sales history" ON public.sales_history FOR DELETE USING (auth.uid() = user_id);

-- po_history policies
DROP POLICY IF EXISTS "Users can view own po history" ON public.po_history;
DROP POLICY IF EXISTS "Users can insert own po history" ON public.po_history;
DROP POLICY IF EXISTS "Users can update own po history" ON public.po_history;
DROP POLICY IF EXISTS "Users can delete own po history" ON public.po_history;

CREATE POLICY "Users can view own po history" ON public.po_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own po history" ON public.po_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own po history" ON public.po_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own po history" ON public.po_history FOR DELETE USING (auth.uid() = user_id);

-- error_logs policies
DROP POLICY IF EXISTS "Users can insert own error logs" ON public.error_logs;
DROP POLICY IF EXISTS "Users can view own error logs" ON public.error_logs;

CREATE POLICY "Users can insert own error logs" ON public.error_logs FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can view own error logs" ON public.error_logs FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- sync_history policies
DROP POLICY IF EXISTS "Users can view own sync history" ON public.sync_history;
DROP POLICY IF EXISTS "Users can insert own sync history" ON public.sync_history;

CREATE POLICY "Users can view own sync history" ON public.sync_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync history" ON public.sync_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Helper Functions & Triggers
-- ============================================================

-- Function to automatically maintain updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS transactions_updated_at ON public.transactions;
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS budget_limits_updated_at ON public.budget_limits;
CREATE TRIGGER budget_limits_updated_at
  BEFORE UPDATE ON public.budget_limits
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- RPC Function for Atomic AI Usage Increment
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id UUID, p_month TEXT, p_date TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_ai_usage (user_id, month, date, daily_count, monthly_count, updated_at)
  VALUES (p_user_id, p_month, p_date, 1, 1, now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    daily_count = CASE 
      WHEN public.user_ai_usage.date = p_date THEN public.user_ai_usage.daily_count + 1
      ELSE 1 
    END,
    monthly_count = CASE 
      WHEN public.user_ai_usage.month = p_month THEN public.user_ai_usage.monthly_count + 1
      ELSE 1 
    END,
    date = p_date,
    month = p_month,
    updated_at = now();
END;
$$;

-- Trigger to automatically create user profile and subscription on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, first_name, last_name, tier)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'firstName', NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'lastName', NEW.raw_user_meta_data->>'last_name', ''),
    'free'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- Performance Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_synced ON public.transactions(synced);
CREATE INDEX IF NOT EXISTS idx_budget_limits_user_id ON public.budget_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub ON public.subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_sales_history_user_id ON public.sales_history(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_history_date ON public.sales_history(date);
CREATE INDEX IF NOT EXISTS idx_po_history_user_id ON public.po_history(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_user_id ON public.sync_history(user_id);


