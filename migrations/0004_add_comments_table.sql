-- Migration: Add comments table
-- Date: 2025-11-12

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  author_name TEXT NOT NULL DEFAULT '익명',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_comments_schedule_id ON comments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
