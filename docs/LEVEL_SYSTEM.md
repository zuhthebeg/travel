# 여행 레벨 시스템 설계

## 현재: Phase 1 (B+C — 뱃지 수집 + 소셜 표시)
- Migration: `0013_level_system.sql` ✅ Applied

---

## 경험치 획득

| 행동 | XP | idempotency_key 패턴 |
|------|-----|----------------------|
| 여행 계획 생성 | +10 | `plan_create:plan:{planId}` |
| 일정에 장소 추가 | +5 | `schedule_place:schedule:{scheduleId}` |
| **모먼트 (사진+메모)** | **+30** | `moment_photo:moment:{momentId}` |
| 모먼트 (텍스트만) | +15 | `moment_text:moment:{momentId}` |
| 별점 남기기 | +5 | `moment_rating:moment:{momentId}` |
| **새 도시 첫 방문** | **+50** | `new_city:user:{userId}:{countryCode}:{cityKey}` |
| **새 국가 첫 방문** | **+100** | `new_country:user:{userId}:{countryCode}` |
| 여행 완료 | +50 | `plan_complete:plan:{planId}` |
| 공유 앨범 공개 | +20 | `plan_public:plan:{planId}` |
| 멤버 초대 | +10 | `invite_member:plan_member:{memberId}` |

## 레벨 테이블

| Lv | 누적 XP | 칭호 | 이모지 |
|----|---------|------|--------|
| 1 | 0 | 여행 새싹 | 🐣 |
| 2 | 100 | 초보 여행자 | 🎒 |
| 3 | 300 | 길 위의 탐험가 | 🧭 |
| 5 | 800 | 프리퀀트 트래블러 | ✈️ |
| 7 | 1,500 | 숙련 여행자 | 🗺️ |
| 10 | 2,500 | 월드 트래블러 | 🌍 |
| 15 | 5,000 | 여행 마스터 | 🏆 |
| 20 | 10,000 | 레전드 트래블러 | 👑 |

> 중간 레벨(4,6,8,9,11-14,16-19)은 비워둠. 나중에 추가 가능 — 레벨 계산은 테이블 기반이라 확장 자유.

## DB 스키마 (Applied)

```sql
-- users 확장
ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0 CHECK(xp >= 0);
ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1);

-- XP 이벤트 (idempotency_key로 중복 완벽 차단)
CREATE TABLE xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  xp INTEGER NOT NULL CHECK(xp <> 0),
  idempotency_key TEXT NOT NULL,     -- ← 핵심: deterministic key
  ref_type TEXT,
  ref_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_xp_events_idem ON xp_events(idempotency_key);

-- 뱃지 정의 + 유저 뱃지
CREATE TABLE badges (...);
CREATE TABLE user_badges (...);

-- 방문지 추적 (country_code + city_key 정규화)
CREATE TABLE visited_places (
  user_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,        -- ISO 3166-1 alpha-2
  city_key TEXT NOT NULL DEFAULT '__unknown__',  -- lowercase normalized
  city_display TEXT,                 -- 표시용 원본
  country_display TEXT,
  ...
  PRIMARY KEY (user_id, country_code, city_key)
);
```

## XP 지급 로직 (트랜잭션 필수)

```typescript
// functions/lib/xp.ts
export async function grantXP(db: D1Database, userId: number, action: string, xp: number, idempotencyKey: string, refType?: string, refId?: number) {
  // 1. INSERT xp_events (ON CONFLICT DO NOTHING)
  const result = await db.prepare(
    `INSERT INTO xp_events (user_id, action, xp, idempotency_key, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO NOTHING`
  ).bind(userId, action, xp, idempotencyKey, refType ?? null, refId ?? null).run();

  // 2. 중복이면 변경 없음
  if (!result.meta.changes) return false;

  // 3. XP 증가 + 레벨 재계산
  await db.prepare(
    `UPDATE users SET xp = xp + ?, level = CASE
       WHEN xp + ? >= 10000 THEN 20
       WHEN xp + ? >= 5000 THEN 15
       WHEN xp + ? >= 2500 THEN 10
       WHEN xp + ? >= 1500 THEN 7
       WHEN xp + ? >= 800 THEN 5
       WHEN xp + ? >= 300 THEN 3
       WHEN xp + ? >= 100 THEN 2
       ELSE 1
     END WHERE id = ?`
  ).bind(xp, xp, xp, xp, xp, xp, xp, xp, userId).run();

  return true; // XP 지급됨
}
```

## 뱃지 체크

이벤트 기반: XP 지급 시 관련 뱃지만 체크
```typescript
// functions/lib/badges.ts
export async function checkBadges(db: D1Database, userId: number) {
  // 집계 쿼리로 현재 상태 확인
  // → badges 테이블의 condition_type/condition_value와 비교
  // → 미획득 뱃지 중 조건 충족한 것 INSERT
}
```

## 모먼트 삭제 시 정책
- XP 회수하지 않음 (심플)
- xp_events 기록은 유지 (감사 추적)
- 나중에 필요하면 음수 XP 이벤트로 회수 가능 (xp <> 0 허용)

## API 엔드포인트

```
GET  /api/my/level          — 내 XP, 레벨, 칭호, 뱃지
GET  /api/users/:id/level   — 다른 유저 레벨 (소셜 표시)
GET  /api/badges            — 전체 뱃지 목록
```
> XP 지급은 별도 API 없이 기존 API (moments POST, plans POST 등)에서 내부 호출

## 소셜 표시 (C안)

- 프로필: 레벨 + 칭호 + 방문 국가 수
- 공유 앨범/모먼트: 작성자 옆에 레벨 뱃지
- 멤버 목록: 레벨 아이콘

## 뱃지 시드 (Applied)

13개 뱃지: 마일스톤 5 + 활동 4 + 지역 4
확장: badges 테이블에 INSERT만 하면 됨

---

## Phase 2 (후순위)

### A안: 기능 해금형
- Lv3: 앨범 테마 커스텀
- Lv5: AI 일일 횟수 +5
- Lv10: 여행 통계 대시보드
- Lv15: 프로필 특별 프레임

### D안: 프리미엄 연계
- Lv5: 프리미엄 7일 무료
- Lv10: 오프라인 저장 2배
- Lv15: AI 모델 업그레이드
