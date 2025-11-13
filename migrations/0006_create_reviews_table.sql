-- Create reviews table for schedule reviews with images
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  author_name TEXT NOT NULL, -- Author name or "익명"
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  image_data TEXT, -- Base64 encoded WebP image (compressed)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_reviews_schedule_id ON reviews(schedule_id);

-- Remove rating and review columns from schedules table (they'll be in reviews table now)
-- Note: SQLite doesn't support DROP COLUMN, so we'll keep them for backward compatibility
-- New reviews will use the reviews table instead
