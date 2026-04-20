-- Add alert_threshold column to budget_limits table
ALTER TABLE budget_limits ADD COLUMN IF NOT EXISTS alert_threshold INTEGER DEFAULT 80 CHECK (alert_threshold >= 0 AND alert_threshold <= 100);