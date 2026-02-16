# Travel Album Feature Design (v2 — 검수 반영)

## 컨셉
"시간 여행 앨범" — 개인 앨범 first, 동행 공유 second, fork로 각자 소유.

---

## 구현 순서 (6단계)

### Step 1: is_public → visibility 단일화 + 권한 기반
### Step 2: 스키마 마이그레이션 (moments, plan_members, forked_from)
### Step 3: Moments API (사진 + 감상 + 기분태그)
### Step 4: Members API (동행 초대)
### Step 5: Fork API (내 앨범으로 가져가기)
### Step 6: UI 전환 (ReviewSection → MomentSection, 타임라인 앨범)

---

## Step 1: visibility 단일화 + 권한

### DB 변경
```sql
-- visibility 컬럼 추가
ALTER TABLE plans ADD COLUMN visibility TEXT DEFAULT 'private' 
  CHECK(visibility IN ('private', 'shared', 'public'));

-- 기존 is_public 데이터 이관
UPDATE plans SET visibility = 'public' WHERE is_public = 1;
UPDATE plans SET visibility = 'private' WHERE is_public = 0 OR is_public IS NULL;

-- is_public은 당분간 유지 (호환), 프론트 전환 후 제거
```

### API 권한 체크 패턴
```typescript
// functions/lib/auth.ts (신규)
export async function getRequestUser(request: Request, db: D1Database): Promise<User | null> {
  const credential = request.headers.get('X-Auth-Credential');
  if (!credential) return null;
  // decode Google JWT → find user by google_id
}

export async function checkPlanAccess(
  db: D1Database, planId: number, userId: number | null
): Promise<'owner' | 'member' | 'public' | null> {
  const plan = await db.prepare('SELECT user_id, visibility FROM plans WHERE id = ?').bind(planId).first();
  if (!plan) return null;
  if (plan.user_id === userId) return 'owner';
  if (plan.visibility === 'public') return 'public';
  if (plan.visibility === 'shared' && userId) {
    const member = await db.prepare(
      'SELECT 1 FROM plan_members WHERE plan_id = ? AND user_id = ?'
    ).bind(planId, userId).first();
    if (member) return 'member';
  }
  return null;
}
```

### 영향받는 API 수정
- `GET /api/plans` — `is_public` → `visibility='public'` 필터
- `GET /api/plans/:id` — 접근 권한 체크
- `PUT /api/plans/:id` — owner만 수정
- `DELETE /api/plans/:id` — owner만 삭제

---

## Step 2: 스키마 마이그레이션

```sql
-- migrations/0010_album_features.sql

-- 1. plans 확장
ALTER TABLE plans ADD COLUMN forked_from INTEGER REFERENCES plans(id) ON DELETE SET NULL;
-- visibility는 Step 1에서 추가됨

CREATE INDEX IF NOT EXISTS idx_plans_forked ON plans(forked_from);
CREATE INDEX IF NOT EXISTS idx_plans_visibility ON plans(visibility);

-- 2. 동행 멤버
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

-- 3. 순간 기록 (기존 reviews와 공존)
CREATE TABLE IF NOT EXISTS moments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    photo_data TEXT,             -- base64 (MVP, R2 전환 전)
    note TEXT,                   -- 짧은 감상 (200자)
    mood TEXT CHECK(mood IN ('amazing', 'good', 'okay', 'meh', 'bad')),
    revisit TEXT CHECK(revisit IN ('yes', 'no', 'maybe')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_moments_schedule ON moments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_moments_user ON moments(user_id);
CREATE INDEX IF NOT EXISTS idx_moments_schedule_created ON moments(schedule_id, created_at DESC);
```

---

## Step 3: Moments API

### 파일 구조
```
functions/api/
  schedules/[id]/moments.ts     GET, POST
  moments/[id]/index.ts         PUT, DELETE
```

### 엔드포인트
```
GET    /api/schedules/:id/moments    해당 일정의 순간들 (owner/member만)
POST   /api/schedules/:id/moments    순간 추가 (owner/member만)
PUT    /api/moments/:id              수정 (작성자만)
DELETE /api/moments/:id              삭제 (작성자 또는 plan owner)
```

### Request/Response
```typescript
// POST body
{ photo_data?: string, note?: string, mood?: string, revisit?: string }

// GET response
{ moments: Moment[], count: number }
```

---

## Step 4: Members API

### 파일 구조
```
functions/api/plans/[id]/members/index.ts    GET, POST
functions/api/plans/[id]/members/[userId].ts DELETE
```

### MVP 초대 방식
- 이메일 기반 (가입된 유저만, MVP)
- POST body: `{ email: string }`
- 이미 가입된 유저 → 바로 추가
- 미가입 → 에러 ("해당 이메일로 가입된 유저가 없습니다")
- 초대 토큰/pending은 Phase 2에서

### 권한
- owner만 멤버 관리 가능

---

## Step 5: Fork API

### 파일
```
functions/api/plans/[id]/fork.ts    POST
```

### 로직
1. 원본 plan 접근 권한 확인 (owner/member/public)
2. plan 복사 → `user_id = requester, forked_from = 원본 id`
3. schedules 전부 복사 (새 plan_id)
4. moments는 복사 안 함 (빈 앨범)
5. D1 batch로 원자성 보장
6. `forked_from != id` 체크 (self-reference 방지)

---

## Step 6: UI 전환

### MomentSection (ReviewSection 대체)
- 기분 태그: 😍 amazing / 😊 good / 😐 okay / 😑 meh / 😢 bad
- 짧은 감상 (200자)
- 사진 1장 (base64, 압축)
- "다시 가고 싶다" Yes/No/Maybe
- 기존 ReviewSection은 feature flag로 숨김 (삭제는 나중)

### 앨범 타임라인 탭
- PlanDetailPage에 "일정 | 앨범 | 지도 | 메모" 탭
- 앨범: Day별 사진 + 감상 세로 스크롤
- 사진 없으면 장소 아이콘 placeholder

### 동행 UI
- 멤버 아바타 표시 (plan 상단)
- "초대하기" 버튼
- "내 앨범으로 가져가기" fork 버튼

---

## Reviews 전환 전략
1. moments 신규 도입 (공존)
2. UI에서 MomentSection으로 전환
3. 기존 reviews 데이터는 유지 (읽기 전용)
4. 충분히 전환된 후 reviews deprecated
