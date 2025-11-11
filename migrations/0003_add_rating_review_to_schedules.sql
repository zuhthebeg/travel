-- Add rating and review fields to schedules table
ALTER TABLE schedules ADD COLUMN rating INTEGER; -- 1-5 stars, NULL if not rated yet
ALTER TABLE schedules ADD COLUMN review TEXT; -- Text review, NULL if not reviewed yet
