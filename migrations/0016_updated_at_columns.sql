-- Add updated_at to schedules and moments for conflict detection
ALTER TABLE schedules ADD COLUMN updated_at TEXT;
ALTER TABLE moments ADD COLUMN updated_at TEXT;
