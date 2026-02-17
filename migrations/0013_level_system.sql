-- 0013: 여행 레벨 시스템
-- Phase 1: XP + 레벨 + 뱃지 + 방문지 추적

-- 1) 유저 XP/레벨 컬럼
ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0 CHECK(xp >= 0);
ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1);

-- 2) XP 이벤트 (중복 방지: idempotency_key)
CREATE TABLE xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  xp INTEGER NOT NULL CHECK(xp <> 0),
  idempotency_key TEXT NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_xp_events_idem ON xp_events(idempotency_key);
CREATE INDEX idx_xp_events_user ON xp_events(user_id, created_at DESC);

-- 3) 뱃지 정의
CREATE TABLE badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('region', 'activity', 'milestone')),
  condition_type TEXT NOT NULL,
  condition_value INTEGER NOT NULL DEFAULT 1
);

-- 4) 유저 획득 뱃지
CREATE TABLE user_badges (
  user_id INTEGER NOT NULL,
  badge_id TEXT NOT NULL,
  earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, badge_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
);

-- 5) 방문 도시/국가 추적 (정규화 키)
CREATE TABLE visited_places (
  user_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  city_key TEXT NOT NULL DEFAULT '__unknown__',
  city_display TEXT,
  country_display TEXT,
  first_visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_type TEXT,
  source_id INTEGER,
  PRIMARY KEY (user_id, country_code, city_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_visited_country ON visited_places(user_id, country_code);

-- 6) 시드 뱃지 데이터
INSERT INTO badges (id, name, description, emoji, category, condition_type, condition_value) VALUES
-- 마일스톤
('first_moment', '첫 여행 기록', '첫 모먼트를 남겼어요', '🎯', 'milestone', 'moment_count', 1),
('ten_trips', '텐트립', '여행 10개 완료', '🔟', 'milestone', 'completed_trip_count', 10),
('hundred_moments', '백 모먼트', '모먼트 100개 달성', '💯', 'milestone', 'moment_count', 100),
('five_countries', '5개국 여행가', '5개국 방문', '🌐', 'milestone', 'country_count', 5),
('ten_countries', '10개국 마스터', '10개국 방문', '🏅', 'milestone', 'country_count', 10),
-- 활동
('photographer', '포토그래퍼', '사진 모먼트 50개', '📸', 'activity', 'photo_moment_count', 50),
('writer', '여행 작가', '텍스트 모먼트 30개', '✍️', 'activity', 'text_moment_count', 30),
('critic', '평론가', '별점 리뷰 20개', '⭐', 'activity', 'rated_moment_count', 20),
('companion', '동행자', '멤버 초대 5회', '🤝', 'activity', 'invited_count', 5),
-- 지역
('asia_master', '아시아 마스터', '아시아 5개국 방문', '🌏', 'region', 'asia_country_count', 5),
('europe_traveler', '유럽 여행가', '유럽 5개국 방문', '🇪🇺', 'region', 'europe_country_count', 5),
('americas_explorer', '아메리카 탐험가', '미주 3개국 방문', '🌎', 'region', 'americas_country_count', 3),
('continent_conqueror', '대륙 정복자', '3개 대륙 방문', '🗺️', 'region', 'continent_count', 3);
