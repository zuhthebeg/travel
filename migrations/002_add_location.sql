-- 일정에 위치 좌표 추가
ALTER TABLE schedules ADD COLUMN latitude REAL;
ALTER TABLE schedules ADD COLUMN longitude REAL;

-- 여행 계획에 국가 정보 추가
ALTER TABLE plans ADD COLUMN country TEXT;
ALTER TABLE plans ADD COLUMN country_code TEXT; -- ISO 3166-1 alpha-2 (예: KR, JP, US)
