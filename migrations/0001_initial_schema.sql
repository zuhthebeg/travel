-- Initial schema migration
-- Run: wrangler d1 execute travel-mvp-db --local --file=./migrations/0001_initial_schema.sql

-- 사용자 테이블
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 여행 계획 테이블
CREATE TABLE plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    region TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    thumbnail TEXT,
    is_public BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 일정 테이블
CREATE TABLE schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    date DATE NOT NULL,
    title TEXT NOT NULL,
    place TEXT,
    memo TEXT,
    plan_b TEXT,
    plan_c TEXT,
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- 추천 테이블
CREATE TABLE recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL UNIQUE,
    count INTEGER DEFAULT 0,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- AI 대화 기록 테이블
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 인덱스
CREATE INDEX idx_plans_user_id ON plans(user_id);
CREATE INDEX idx_plans_is_public ON plans(is_public);
CREATE INDEX idx_schedules_plan_id ON schedules(plan_id);
CREATE INDEX idx_schedules_date ON schedules(date);
CREATE INDEX idx_conversations_plan_id ON conversations(plan_id);
