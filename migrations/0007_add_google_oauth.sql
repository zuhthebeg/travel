-- Add Google OAuth fields to users table
-- Note: SQLite doesn't support adding UNIQUE constraint with ALTER TABLE
-- We'll add columns without UNIQUE first, then create a unique index
ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN picture TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local';

-- Make password nullable for Google OAuth users
-- Note: SQLite doesn't support ALTER COLUMN, so we'll handle this in application logic
-- Google OAuth users will have NULL password

-- Create unique index for Google ID (acts as UNIQUE constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
