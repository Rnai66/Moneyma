-- ============================================
-- MoneyMa Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table (Cloud sync)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  synced BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Error logs table (For crash reporting)
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  error_message TEXT,
  error_stack TEXT,
  error_type TEXT,
  app_version TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Budget limits table (For budget feature)
CREATE TABLE IF NOT EXISTS budget_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  limit_amount DECIMAL(10,2) NOT NULL,
  alert_threshold INTEGER DEFAULT 80 CHECK (alert_threshold >= 0 AND alert_threshold <= 100),
  period TEXT DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sync history table (To track sync status)
CREATE TABLE IF NOT EXISTS sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'completed', 'failed')),
  synced_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Enable Row Level Security (RLS)
-- ============================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for user_profiles
-- ============================================

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- RLS Policies for transactions
-- ============================================

DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON transactions;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies for error_logs
-- ============================================

DROP POLICY IF EXISTS "Users can insert own error logs" ON error_logs;
DROP POLICY IF EXISTS "Users can view own error logs" ON error_logs;

CREATE POLICY "Users can insert own error logs"
  ON error_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view own error logs"
  ON error_logs FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- ============================================
-- RLS Policies for budget_limits
-- ============================================

DROP POLICY IF EXISTS "Users can view own budget limits" ON budget_limits;
DROP POLICY IF EXISTS "Users can insert own budget limits" ON budget_limits;
DROP POLICY IF EXISTS "Users can update own budget limits" ON budget_limits;
DROP POLICY IF EXISTS "Users can delete own budget limits" ON budget_limits;

CREATE POLICY "Users can view own budget limits"
  ON budget_limits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budget limits"
  ON budget_limits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budget limits"
  ON budget_limits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budget limits"
  ON budget_limits FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies for sync_history
-- ============================================

DROP POLICY IF EXISTS "Users can view own sync history" ON sync_history;
DROP POLICY IF EXISTS "Users can insert own sync history" ON sync_history;

CREATE POLICY "Users can view own sync history"
  ON sync_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync history"
  ON sync_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Products & Multi-Warehouse Stock Table (Business POS)
-- ============================================

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'ทั่วไป',
  cost DECIMAL(10,2) DEFAULT 0.00,
  price DECIMAL(10,2) DEFAULT 0.00,
  stock INTEGER DEFAULT 0,
  warehouse1 INTEGER DEFAULT 0,
  warehouse2 INTEGER DEFAULT 0,
  warehouse3 INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own products" ON products;
DROP POLICY IF EXISTS "Users can insert own products" ON products;
DROP POLICY IF EXISTS "Users can update own products" ON products;
DROP POLICY IF EXISTS "Users can delete own products" ON products;

CREATE POLICY "Users can view own products" ON products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own products" ON products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON products FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Sales History Table (Completed POS Sales)
-- ============================================

CREATE TABLE IF NOT EXISTS sales_history (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  customer_name TEXT,
  customer_tax_id TEXT,
  total_amount DECIMAL(10,2) NOT NULL,
  items JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sales history" ON sales_history;
DROP POLICY IF EXISTS "Users can insert own sales history" ON sales_history;
DROP POLICY IF EXISTS "Users can update own sales history" ON sales_history;
DROP POLICY IF EXISTS "Users can delete own sales history" ON sales_history;

CREATE POLICY "Users can view own sales history" ON sales_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sales history" ON sales_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sales history" ON sales_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sales history" ON sales_history FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Purchase Order History Table (Completed Stock In POs)
-- ============================================

CREATE TABLE IF NOT EXISTS po_history (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  target_warehouse TEXT,
  supplier_name TEXT,
  supplier_tax_id TEXT,
  total_amount DECIMAL(10,2) NOT NULL,
  items JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE po_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own po history" ON po_history;
DROP POLICY IF EXISTS "Users can insert own po history" ON po_history;
DROP POLICY IF EXISTS "Users can update own po history" ON po_history;
DROP POLICY IF EXISTS "Users can delete own po history" ON po_history;

CREATE POLICY "Users can view own po history" ON po_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own po history" ON po_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own po history" ON po_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own po history" ON po_history FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Create Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_synced ON transactions(synced);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_limits_user_id ON budget_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_user_id ON sync_history(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_sales_history_user_id ON sales_history(user_id);
CREATE INDEX IF NOT EXISTS idx_po_history_user_id ON po_history(user_id);

-- ============================================
-- Enable Realtime (Optional - for Phase 2 live sync)
-- ============================================
-- To enable realtime in Supabase Dashboard:
-- 1. Go to Database → Publications
-- 2. Click supabase_realtime
-- 3. Toggle ON for: transactions, user_profiles, budget_limits, products, sales_history, po_history
-- This is optional - the app works fine without it

