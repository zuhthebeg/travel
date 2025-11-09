-- Add time field to schedules table
-- Run: wrangler d1 execute travel-mvp-db --local --file=./migrations/0002_add_time_to_schedules.sql

ALTER TABLE schedules ADD COLUMN time TEXT;
