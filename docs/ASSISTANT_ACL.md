# ASSISTANT ACL (Access Control List)

Travly Assistant API 액션 권한 매트릭스 초안입니다.

- 기준 역할: `owner | member | public | null(unauthenticated)`
- `public`/`null`은 **assistant 사용 불가** (로그인 필요)
- ACL은 **action 실행 전에** 선검증(pre-check)해야 함

---

## 1) 액션 목록 (현재 + 계획)

### 현재 `functions/api/assistant/index.ts` 기준
- `chat` (일반 질의/응답, actions=[])
- `add`
- `update`
- `delete`
- `shift_all`
- `delete_matching`
- `update_plan`
- `add_memo`
- `update_memo`
- `delete_memo`
- `generate_memos`

### 계획 `docs/ASSISTANT_ALBUM_ACTIONS.md` 기준
- `add_moment`
- `update_moment`
- `delete_moment`
- `add_member`
- `remove_member`
- `set_visibility`
- (`fork_plan`은 문서에서 assistant 트리거 제외 권장 → ACL 대상에서 기본 제외)

---

## 2) 권한 정책 요약

- **owner**: 모든 assistant action 허용
- **member**: 
  - 허용: `chat`, `add_moment`, `update_moment(본인 소유만)`, `delete_moment(본인 소유만)`
  - 금지: 일정 대량/구조 변경(`delete`, `shift_all`, `delete_matching`), 플랜 메타 수정(`update_plan`), 멤버 관리(`add_member/remove_member`), 공개범위 변경(`set_visibility`), 메모 관리(`add/update/delete/generate_memos`)
- **public/null**: assistant action 전부 금지

> 요구사항 반영:
> - 멤버는 순간기록 추가/본인 기록 수정·삭제 + 채팅 가능
> - 멤버는 일정 삭제/전체 이동/플랜수정/멤버관리/공개범위변경 불가

---

## 3) ACL 매트릭스 (문서용)

| Action | Owner | Member | Public | 비고 |
|---|---:|---:|---:|---|
| `chat` | ✅ | ✅ | ❌ | 질문/대화 only (DB write 없음) |
| `add` | ✅ | ❌ | ❌ | 일정 추가 |
| `update` | ✅ | ❌ | ❌ | 일정 수정 |
| `delete` | ✅ | ❌ | ❌ | 일정 삭제 |
| `shift_all` | ✅ | ❌ | ❌ | 전체 일정 일괄 이동 |
| `delete_matching` | ✅ | ❌ | ❌ | 키워드 일괄 삭제 |
| `update_plan` | ✅ | ❌ | ❌ | title/region/date 등 플랜 메타 |
| `add_memo` | ✅ | ❌ | ❌ | 여행 정보 메모 추가 |
| `update_memo` | ✅ | ❌ | ❌ | 여행 정보 메모 수정 |
| `delete_memo` | ✅ | ❌ | ❌ | 여행 정보 메모 삭제 |
| `generate_memos` | ✅ | ❌ | ❌ | 메모 자동 생성 |
| `add_moment` | ✅ | ✅ | ❌ | 멤버 허용 |
| `update_moment` | ✅ | ✅* | ❌ | *멤버는 본인 `user_id` 소유만 |
| `delete_moment` | ✅ | ✅* | ❌ | *멤버는 본인 `user_id` 소유만 |
| `add_member` | ✅ | ❌ | ❌ | owner 전용 |
| `remove_member` | ✅ | ❌ | ❌ | owner 전용(자기 자신 제거 방지도 권장) |
| `set_visibility` | ✅ | ❌ | ❌ | owner 전용 |

---

## 4) TypeScript ACL 객체 (코드 적용용)

```ts
// 권장: auth.ts의 AccessLevel 재사용
export type AccessLevel = 'owner' | 'member' | 'public' | null;

// assistant가 생성/실행할 수 있는 action 타입 정의
// (chat은 actions=[] 케이스를 명시적으로 다루기 위한 가상 액션)
export type AssistantActionType =
  | 'chat'
  | 'add'
  | 'update'
  | 'delete'
  | 'shift_all'
  | 'delete_matching'
  | 'update_plan'
  | 'add_memo'
  | 'update_memo'
  | 'delete_memo'
  | 'generate_memos'
  | 'add_moment'
  | 'update_moment'
  | 'delete_moment'
  | 'add_member'
  | 'remove_member'
  | 'set_visibility';

export type RoleForAcl = 'owner' | 'member' | 'public';

export const ASSISTANT_ACTION_ACL: Record<AssistantActionType, Record<RoleForAcl, boolean>> = {
  // non-mutating
  chat: { owner: true, member: true, public: false },

  // schedule actions
  add: { owner: true, member: false, public: false },
  update: { owner: true, member: false, public: false },
  delete: { owner: true, member: false, public: false },
  shift_all: { owner: true, member: false, public: false },
  delete_matching: { owner: true, member: false, public: false },

  // plan/meta actions
  update_plan: { owner: true, member: false, public: false },

  // memo actions
  add_memo: { owner: true, member: false, public: false },
  update_memo: { owner: true, member: false, public: false },
  delete_memo: { owner: true, member: false, public: false },
  generate_memos: { owner: true, member: false, public: false },

  // moment actions
  add_moment: { owner: true, member: true, public: false },
  update_moment: { owner: true, member: true, public: false }, // + 소유권 체크 필요
  delete_moment: { owner: true, member: true, public: false }, // + 소유권 체크 필요

  // collaboration/admin actions
  add_member: { owner: true, member: false, public: false },
  remove_member: { owner: true, member: false, public: false },
  set_visibility: { owner: true, member: false, public: false },
};

// 선검증 헬퍼: action 실행 전에 반드시 호출
export function canExecuteAssistantAction(
  actionType: AssistantActionType,
  access: AccessLevel
): boolean {
  // unauthenticated/null 및 알 수 없는 접근레벨 거부
  if (!access || access === 'public') return false;
  return ASSISTANT_ACTION_ACL[actionType]?.[access] ?? false;
}
```

---

## 5) 실행 전(Pre-Execution) 강제 포인트

> 핵심: 모델이 어떤 액션을 반환하든, DB 쿼리 전에 ACL로 먼저 차단

권장 순서:
1. `user = getRequestUser(...)` 확인 (없으면 401)
2. `access = checkPlanAccess(...)` 확인 (없으면 403)
3. 모델 응답 `actions[]` 순회
4. 각 action에 대해 `canExecuteAssistantAction(action.type, access)` 선검증
5. 통과한 action만 실행
6. 추가 리소스 소유권 검증(예: `update_moment/delete_moment`는 member 본인 `user_id`만)

즉, ACL은 **역할 기반 1차 게이트**, SQL WHERE는 **리소스 범위/소유권 2차 게이트**로 이중 방어.

---

## 6) 확장성 가이드

새 action 추가 시 체크리스트:
1. `AssistantActionType` 유니온에 추가
2. `ASSISTANT_ACTION_ACL`에 `owner/member/public` 3값 명시 (누락 시 CI/타입 에러 유도)
3. 필요하면 소유권 rule 주석 추가 (예: `// memberOwnOnly`)
4. 문서 표(본 파일) 1행 추가

이 패턴이면 신규 액션이 생겨도 “권한 지정 누락”이 바로 드러납니다.
