-- 기본 visibility를 public으로 변경 (SEO 유입 목적)
-- SQLite는 ALTER COLUMN DEFAULT 불가 → 앱 레벨에서 처리
-- 기존 private 플랜 중 is_public=1인 것들 정합성 보정
UPDATE plans SET visibility = 'public' WHERE is_public = 1 AND visibility = 'private';
