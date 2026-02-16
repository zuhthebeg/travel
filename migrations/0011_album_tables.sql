-- Step 2: Album feature tables

-- plans 확장: fork 지원
ALTER TABLE plans ADD COLUMN forked_from INTEGER REFERENCES plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plans_forked ON plans(forked_from);

-- 동행 멤버
CREATE TABLE IF NOT EXISTS plan_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'member')),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plan_id, user_id),
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plan_members_plan ON plan_members(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_members_user ON plan_members(user_id);

-- 순간 기록 (기존 reviews와 공존)
CREATE TABLE IF NOT EXISTS moments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    photo_data TEXT,
    note TEXT,
    mood TEXT CHECK(mood IN ('amazing', 'good', 'okay', 'meh', 'bad')),
    revisit TEXT CHECK(revisit IN ('yes', 'no', 'maybe')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_moments_schedule ON moments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_moments_user ON moments(user_id);
CREATE INDEX IF NOT EXISTS idx_moments_schedule_created ON moments(schedule_id, created_at DESC);
