-- Travel MVP Database Schema

-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL, -- 해시된 비밀번호
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 여행 계획 테이블
CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    region TEXT, -- 지역 (예: 서울, 제주도, 도쿄)
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    thumbnail TEXT, -- 썸네일 이미지 URL
    is_public BOOLEAN DEFAULT 0, -- 공개 여부
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 일정 테이블 (각 날짜별 상세 일정)
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    date DATE NOT NULL, -- 일정 날짜
    title TEXT NOT NULL, -- 일정 제목
    place TEXT, -- 장소
    memo TEXT, -- 메모
    plan_b TEXT, -- Plan B (대안 일정)
    plan_c TEXT, -- Plan C (또 다른 대안)
    order_index INTEGER DEFAULT 0, -- 같은 날짜 내 순서
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- 추천 테이블 (여행 계획 추천 카운트)
CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL UNIQUE,
    count INTEGER DEFAULT 0,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- AI 대화 기록 테이블 (Phase 4에서 사용)
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL, -- 'user' 또는 'assistant'
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_is_public ON plans(is_public);
CREATE INDEX IF NOT EXISTS idx_schedules_plan_id ON schedules(plan_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
CREATE INDEX IF NOT EXISTS idx_conversations_plan_id ON conversations(plan_id);
