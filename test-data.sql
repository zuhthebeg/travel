-- 테스트 데이터 삽입

-- 테스트 사용자 생성
INSERT INTO users (username, password) VALUES
('testuser1', 'hashed_password_1'),
('testuser2', 'hashed_password_2');

-- 테스트 여행 계획 생성
INSERT INTO plans (user_id, title, region, start_date, end_date, is_public) VALUES
(1, '제주도 3박4일', '제주도', '2025-12-01', '2025-12-04', 1),
(1, '서울 데이트', '서울', '2025-11-15', '2025-11-15', 0),
(2, '부산 여행', '부산', '2025-12-10', '2025-12-12', 1);

-- 테스트 일정 생성
INSERT INTO schedules (plan_id, date, title, place, memo, plan_b, order_index) VALUES
(1, '2025-12-01', '제주공항 도착', '제주국제공항', '렌트카 픽업', '버스 이용', 1),
(1, '2025-12-01', '성산일출봉', '성산일출봉', '일출 보기', '우도 가기', 2),
(1, '2025-12-02', '한라산 등산', '한라산', '백록담까지', '성판악 코스로 변경', 1),
(2, '2025-11-15', '경복궁 관람', '경복궁', '한복 입고 가기', null, 1),
(3, '2025-12-10', '해운대 해수욕장', '해운대', '산책', '광안리 가기', 1);

-- 추천 데이터
INSERT INTO recommendations (plan_id, count) VALUES
(1, 15),
(3, 8);
