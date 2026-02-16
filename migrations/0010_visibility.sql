-- Step 1: is_public → visibility 단일화

-- visibility 컬럼 추가
ALTER TABLE plans ADD COLUMN visibility TEXT DEFAULT 'private';

-- 기존 데이터 이관
UPDATE plans SET visibility = 'public' WHERE is_public = 1;
UPDATE plans SET visibility = 'private' WHERE is_public = 0 OR is_public IS NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_plans_visibility ON plans(visibility);
