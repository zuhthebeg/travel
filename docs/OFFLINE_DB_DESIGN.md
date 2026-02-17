# Travly Offline DB (IndexedDB) 설계

## 목적
오프라인에서도 여행 데이터를 읽고, 간단한 수정을 로컬에 저장한 뒤,
온라인 복귀 시 서버와 동기화한다.

## 1. IndexedDB 스키마

Database: `travly-offline` (version 1)

### Object Stores

```
plans
  keyPath: id
  indexes: [user_id, updated_at]
  
schedules
  keyPath: id
  indexes: [plan_id, date]
  
moments
  keyPath: id
  indexes: [schedule_id]

pendingChanges
  autoIncrement: true
  indexes: [timestamp, entity, entityId]
  
syncMeta
  keyPath: key
```

### pendingChanges 레코드 구조
```ts
interface PendingChange {
  id?: number;           // autoIncrement
  timestamp: number;     // Date.now()
  entity: 'plan' | 'schedule' | 'moment';
  entityId: number;      // server ID (0 if new)
  action: 'create' | 'update' | 'delete';
  data: Record<string, any>;  // 변경 데이터
  planId: number;        // 어느 plan에 속하는지
  synced: boolean;       // 동기화 완료 여부
}
```

### syncMeta 레코드
```ts
interface SyncMeta {
  key: string;           // e.g. 'lastSync', 'cachedPlanIds'
  value: any;
}
```

## 2. 캐싱 전략

### 언제 캐시하는가
1. **Plan 열 때**: `plansAPI.getById(id)` 응답을 IndexedDB에 저장 (plan + schedules)
2. **Moments 로드 시**: `momentsAPI.getByScheduleId()` 응답 저장
3. **Plan 목록**: `plansAPI.getAll({mine: true})` 응답 저장

### 캐시 우선순위
- **온라인**: 서버 fetch → 성공하면 IndexedDB 갱신 → UI 렌더
- **오프라인**: IndexedDB → UI 렌더 (서버 접속 안 함)

### 캐시 만료
- 명시적 만료 없음 (항상 온라인 시 서버 데이터로 덮어씀)
- `syncMeta.lastSync`에 마지막 동기화 시각 기록

## 3. 오프라인 CRUD

### 읽기 (Read)
- IndexedDB에서 직접 조회
- plan_id로 schedules 필터, schedule_id로 moments 필터

### 쓰기 (Create/Update/Delete)
1. IndexedDB에 즉시 반영 (optimistic)
2. `pendingChanges`에 변경 기록 추가
3. UI는 로컬 데이터 기준으로 즉시 갱신

### 제한사항 (오프라인에서 불가)
- Plan 생성 (서버 인증 필요)
- 멤버 초대/관리
- AI 일정 자동생성
- 이미지 업로드 (base64는 용량 문제)
- Fork

## 4. 동기화 (Online 복귀)

### 트리거
- `window.addEventListener('online', syncPendingChanges)`
- 앱 시작 시 pending 있으면 자동 동기화

### 동기화 로직
```
1. pendingChanges에서 synced=false인 항목 조회
2. timestamp 순서대로 처리:
   - create → POST API → 서버 ID 받아서 로컬 갱신
   - update → PUT API
   - delete → DELETE API
3. 각 항목 성공 시 synced=true 처리
4. 실패 시 해당 항목 건너뛰고 다음 진행 (재시도는 다음 동기화)
5. 모든 처리 후 서버에서 최신 데이터 다시 fetch → IndexedDB 갱신
```

### 충돌 해결
- **서버 우선 (Last Write Wins)**: 서버 데이터가 항상 최종 권위
- 동기화 후 서버 데이터로 로컬 덮어씀
- 사용자에게 충돌 알림은 Phase 3에서 고려

## 5. API 레이어 통합

### 수정 방향: `src/lib/api.ts`를 래핑

```ts
// src/lib/offlineDB.ts — IndexedDB CRUD
// src/lib/offlineSync.ts — 동기화 로직
// src/lib/offlineAPI.ts — api.ts 대체 래퍼

// 사용 예:
import { offlinePlansAPI } from './offlineAPI';

// 온라인이면 서버 호출 + 캐시 갱신
// 오프라인이면 IndexedDB 조회
const { plan, schedules } = await offlinePlansAPI.getById(id);
```

### offlineAPI 패턴
```ts
export const offlinePlansAPI = {
  getById: async (id: number) => {
    if (navigator.onLine) {
      const result = await plansAPI.getById(id);
      await offlineDB.cachePlan(result.plan, result.schedules);
      return result;
    }
    return offlineDB.getPlanWithSchedules(id);
  },
  // ...
};
```

## 6. 파일 구조

```
src/lib/
├── offlineDB.ts      # IndexedDB open/CRUD
├── offlineSync.ts     # pendingChanges → server sync
└── offlineAPI.ts      # api.ts 래핑 (online/offline 분기)
```

## 7. 구현 순서

1. `offlineDB.ts` — DB 열기, stores, 기본 CRUD
2. `offlineAPI.ts` — plansAPI/schedulesAPI 래핑 (읽기 우선)
3. 컴포넌트에서 기존 `plansAPI` → `offlinePlansAPI`로 교체
4. 오프라인 쓰기 + pendingChanges
5. `offlineSync.ts` — 온라인 복귀 시 동기화
6. 동기화 상태 UI (pending 건수 표시)

## 8. 검토 포인트

- [ ] IndexedDB 스키마가 현재 타입과 맞는가?
- [ ] pendingChanges 구조가 모든 CRUD를 커버하는가?
- [ ] create 시 서버 ID 매핑 처리 방안
- [ ] 동기화 순서 (delete before create? 아니면 timestamp 순?)
- [ ] 대용량 데이터 (photo_data base64) 캐싱 여부
- [ ] Service Worker Cache vs IndexedDB 역할 분리
