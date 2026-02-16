# Assistant Album Actions — Design Doc

## 목적
기존 assistant API에 앨범 기능(moments, members, fork, visibility) 액션을 추가하여 
AI 비서가 자연어로 앨범 관련 작업을 처리할 수 있게 한다.

## 현재 상태
- assistant/index.ts에 인증(getRequestUser + requirePlanOwner) 적용 완료
- 모든 write 쿼리에 plan_id 스코프 적용 완료
- 기존 액션: add/update/delete/shift_all/delete_matching (schedules), update_plan, add_memo/update_memo/delete_memo/generate_memos

## 추가할 액션

### 1. MOMENT ACTIONS (순간 기록)
```
ADD_MOMENT: {
  "type": "add_moment",
  "schedule_id": <schedule_id>,
  "moment": {
    "note": "...",           // 200자 이내
    "mood": "amazing|good|okay|meh|bad",
    "revisit": "yes|no|maybe"
  }
}
// photo_data는 AI가 직접 생성 불가 → 생략. 사용자가 이미지 보내면 별도 처리.

UPDATE_MOMENT: {
  "type": "update_moment",
  "id": <moment_id>,
  "changes": { "note": "...", "mood": "...", "revisit": "..." }
}

DELETE_MOMENT: {
  "type": "delete_moment",
  "id": <moment_id>
}
```

**보안:**
- add_moment: schedule_id가 해당 plan_id 소속인지 확인
- update/delete_moment: moment의 user_id = 현재 유저인지 확인
- moment의 schedule이 해당 plan 소속인지 확인 (cross-plan 방지)

### 2. MEMBER ACTIONS (동행 관리)
```
ADD_MEMBER: {
  "type": "add_member",
  "email": "user@example.com"
}
// email로 users 테이블 조회 → user_id로 plan_members에 추가

REMOVE_MEMBER: {
  "type": "remove_member",
  "user_id": <user_id>
}
```

**보안:**
- owner만 가능 (이미 requirePlanOwner 체크됨)
- 자기 자신 제거 방지

### 3. VISIBILITY ACTION
```
SET_VISIBILITY: {
  "type": "set_visibility",
  "visibility": "private|shared|public"
}
```

**보안:**
- owner만 가능

### 4. FORK ACTION
```
FORK_PLAN: {
  "type": "fork_plan"
}
```
→ 이건 AI 비서가 트리거하기보다 UI에서 하는 게 자연스러움. **제외 권장.**

## 프론트엔드 변경

### TravelAssistantChat.tsx
- fetch body에 `moments` 데이터 추가 (현재 스케줄별 moments 요약)
- fetch body에 `members` 데이터 추가 (현재 멤버 목록)
- fetch body에 `visibility` 추가

### 응답 처리
- `hasMomentChanges`, `hasMemberChanges` 플래그 추가하여 UI 리프레시 트리거

## System Prompt 추가 내용
```
MOMENT ACTIONS (순간 기록 - 일정에 대한 감상/메모):
- ADD_MOMENT: {"type": "add_moment", "schedule_id": <id>, "moment": {"note": "...", "mood": "amazing|good|okay|meh|bad", "revisit": "yes|no|maybe"}}
- UPDATE_MOMENT: {"type": "update_moment", "id": <moment_id>, "changes": {"note": "...", "mood": "...", "revisit": "..."}}
- DELETE_MOMENT: {"type": "delete_moment", "id": <moment_id>}

MEMBER ACTIONS (동행 관리 - owner만):
- ADD_MEMBER: {"type": "add_member", "email": "user@example.com"}
- REMOVE_MEMBER: {"type": "remove_member", "user_id": <user_id>}

VISIBILITY ACTION:
- SET_VISIBILITY: {"type": "set_visibility", "visibility": "private|shared|public"}
```

## DB 쿼리 (보안 스코프)

### add_moment
```sql
-- 1. schedule이 이 plan 소속인지 확인
SELECT id FROM schedules WHERE id = ? AND plan_id = ?
-- 2. INSERT
INSERT INTO moments (schedule_id, user_id, note, mood, revisit)
VALUES (?, ?, ?, ?, ?)
```

### update_moment
```sql
-- moment가 현재 유저 소유 + 해당 plan의 schedule 소속인지 확인
UPDATE moments SET note=?, mood=?, revisit=?
WHERE id = ? AND user_id = ?
AND schedule_id IN (SELECT id FROM schedules WHERE plan_id = ?)
```

### delete_moment
```sql
DELETE FROM moments WHERE id = ? AND user_id = ?
AND schedule_id IN (SELECT id FROM schedules WHERE plan_id = ?)
```

### add_member
```sql
-- email로 user 찾기
SELECT id FROM users WHERE email = ?
-- 존재하면 추가
INSERT INTO plan_members (plan_id, user_id, role) VALUES (?, ?, 'member')
```

### remove_member
```sql
DELETE FROM plan_members WHERE plan_id = ? AND user_id = ? AND role != 'owner'
```

### set_visibility
```sql
UPDATE plans SET visibility = ? WHERE id = ? AND user_id = ?
```

## Codex 검수 요청사항
1. 보안 스코프 누락 없는지
2. fork_plan 제외 판단 적절한지
3. moments에 photo_data AI 생략 적절한지
4. 프론트→백 데이터 전달 시 moments/members 요약 형태 적절한지
5. system prompt 토큰 증가량 우려 (현재도 이미 큼)
