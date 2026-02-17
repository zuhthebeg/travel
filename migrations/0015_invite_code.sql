ALTER TABLE plans ADD COLUMN invite_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_invite_code ON plans(invite_code) WHERE invite_code IS NOT NULL;
