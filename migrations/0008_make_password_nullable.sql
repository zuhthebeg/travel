-- Make password column nullable for Google OAuth users
-- SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table

-- Step 1: Create new table with correct schema
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password TEXT, -- Now nullable (removed NOT NULL constraint)
  google_id TEXT,
  email TEXT,
  picture TEXT,
  auth_provider TEXT DEFAULT 'local',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy existing data
INSERT INTO users_new (id, username, password, google_id, email, picture, auth_provider, created_at)
SELECT id, username, password, google_id, email, picture, auth_provider, created_at FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
