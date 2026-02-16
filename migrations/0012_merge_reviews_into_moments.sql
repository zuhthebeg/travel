-- Step 1: moments에 rating 컬럼 추가
ALTER TABLE moments ADD COLUMN rating INTEGER CHECK(rating >= 1 AND rating <= 5);

-- Step 2: reviews → moments 마이그레이션
-- reviews: schedule_id, author_name, rating, review_text, image_data, created_at
-- moments: schedule_id, user_id, photo_data, note, mood, revisit, rating, created_at
-- author_name → user_id 매핑 불가 (reviews는 인증 없었음) → user_id=0 (anonymous)
INSERT INTO moments (schedule_id, user_id, photo_data, note, mood, revisit, rating, created_at)
SELECT 
  schedule_id,
  0,  -- anonymous (기존 리뷰는 인증 없었으므로)
  image_data,
  review_text,
  NULL,
  NULL,
  rating,
  created_at
FROM reviews;

-- Step 3: reviews 테이블은 당분간 유지 (롤백 대비), 나중에 DROP
-- DROP TABLE IF EXISTS reviews;
