# Travly Offline DB 설계 V2

Codex 리뷰 반영 + 프리미엄 동기화 모델 적용.

## 핵심 변경점 (V1 대비)
1. **쓰기 지원** — 오프라인에서 CRUD 전부 가능
2. **이미지 = 경로만 저장** — base64 캐시 안 함, 싱크 시 업로드
3. **프리미엄 동기화** — 싱크는 프리미엄 유저만 (무료 유저는 읽기 캐시만)
4. **temp ID 체계** — 음수 ID로 로컬 생성, 싱크 시 서버 ID로 교체
5. **의존성 기반 동기화** — timestamp + 부모→자식 순서

---

## 1. IndexedDB 스키마

Database: `travly-offline` (version 1)

### Object Stores

```
plans           keyPath: id     indexes: [user_id]
schedules       keyPath: id     indexes: [plan_id, date]
moments         keyPath: id     indexes: [schedule_id]
opLog           keyPath: opId   indexes: [status, createdAt, entity, entityId]
idMap           keyPath: tempId indexes: [entity, serverId]
syncMeta        keyPath: key
mediaQueue      keyPath: localRef  indexes: [momentId, status]
```

### 주요 차이점
- `pendingChanges` → `opLog` (더 풍부한 구조)
- `idMap` 추가 (temp ID ↔ server ID 매핑)
- `mediaQueue` 추가 (이미지 파일 경로/Blob 참조)

---

## 2. 데이터 구조

### OpLog (변경 기록)
```ts
interface OpLogEntry {
  opId: string;              // UUID (crypto.randomUUID())
  createdAt: number;         // Date.now()
  entity: 'plan' | 'schedule' | 'moment';
  entityId: number;          // 실제 ID (음수면 temp)
  parentId?: number;         // schedule의 plan_id, moment의 schedule_id
  action: 'create' | 'update' | 'delete';
  data: Record<string, any>; // 변경 페이로드
  status: 'pending' | 'syncing' | 'done' | 'failed';
  retryCount: number;
  lastError?: string;
  dependsOn?: string[];      // 선행 opId 목록 (부모 create 완료 후 실행)
}
```

### IdMap (임시 ID 매핑)
```ts
interface IdMapping {
  tempId: number;     // 음수 (-1, -2, ...)
  entity: string;
  serverId: number;   // 싱크 후 서버 할당 ID
  mappedAt: number;
}
```

### MediaQueue (이미지 업로드 대기)
```ts
interface MediaQueueEntry {
  localRef: string;       // `media_${uuid}` 고유 키
  momentId: number;       // 연결된 moment ID (temp 가능)
  blob: Blob;             // 실제 이미지 데이터 (IndexedDB Blob 저장)
  fileName: string;
  mimeType: string;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  createdAt: number;
}
```

### SyncMeta
```ts
// key-value store
// 'lastSyncAt': number
// 'pendingCount': number
// 'syncLock': boolean
// 'isPremium': boolean
```

---

## 3. Temp ID 체계

```
서버 ID: 양수 (1, 2, 3, ...)
로컬 ID: 음수 (-1, -2, -3, ...)

let nextTempId = -1;
function genTempId(): number {
  return nextTempId--;
}
```

### ID 교체 규칙
싱크 시 create 성공하면:
1. `idMap`에 `{ tempId: -5, entity: 'schedule', serverId: 123 }` 저장
2. `schedules` store에서 -5 삭제 → 123으로 재삽입
3. 미처리 opLog에서 `entityId === -5`인 항목 → `entityId = 123`으로 교체
4. `moments`에서 `schedule_id === -5`인 항목 → `schedule_id = 123`으로 교체

---

## 4. 오프라인 API 레이어

### 구조
```
src/lib/
├── db.ts           # IndexedDB open, low-level CRUD
├── offlineAPI.ts   # 온/오프 분기 래퍼 (기존 api.ts 대체)
├── syncEngine.ts   # 동기화 엔진 (프리미엄 전용)
└── offlineEngine.ts  # (기존) WebLLM AI 엔진
```

### offlineAPI 동작 패턴

#### 읽기 (GET)
```
온라인 → 서버 fetch → 성공 시 IndexedDB 캐시 갱신 → 반환
         fetch 실패 → IndexedDB 폴백
오프라인 → IndexedDB 직접 조회
```

#### 쓰기 (POST/PUT/DELETE)
```
온라인 → 서버 API 호출 → 성공 시 IndexedDB도 갱신
오프라인 → IndexedDB에 즉시 반영 + opLog 기록
         → UI는 로컬 데이터로 즉시 갱신 (optimistic)
```

### API 전환 예시
```ts
// offlineAPI.ts
export const offlineSchedulesAPI = {
  create: async (data: CreateScheduleData) => {
    if (navigator.onLine) {
      const result = await schedulesAPI.create(data);
      await db.schedules.put(result.schedule);
      return result.schedule;
    }
    // 오프라인: 로컬 생성
    const tempId = genTempId();
    const localSchedule = { ...data, id: tempId, created_at: new Date().toISOString() };
    await db.schedules.put(localSchedule);
    await db.opLog.add({
      opId: crypto.randomUUID(),
      createdAt: Date.now(),
      entity: 'schedule',
      entityId: tempId,
      parentId: data.plan_id,
      action: 'create',
      data,
      status: 'pending',
      retryCount: 0,
    });
    return localSchedule;
  },

  update: async (id: number, data: UpdateScheduleData) => {
    if (navigator.onLine) {
      const result = await schedulesAPI.update(id, data);
      await db.schedules.put(result.schedule);
      return result.schedule;
    }
    const existing = await db.schedules.get(id);
    const updated = { ...existing, ...data };
    await db.schedules.put(updated);
    await db.opLog.add({
      opId: crypto.randomUUID(),
      createdAt: Date.now(),
      entity: 'schedule',
      entityId: id,
      action: 'update',
      data,
      status: 'pending',
      retryCount: 0,
    });
    return updated;
  },

  delete: async (id: number) => {
    if (navigator.onLine) {
      await schedulesAPI.delete(id);
      await db.schedules.delete(id);
      return;
    }
    await db.schedules.delete(id);
    // temp ID(음수)인데 아직 싱크 안 된 건 → opLog에서 create 제거
    if (id < 0) {
      await db.opLog.deleteByEntityId('schedule', id);
      return;
    }
    await db.opLog.add({
      opId: crypto.randomUUID(),
      createdAt: Date.now(),
      entity: 'schedule',
      entityId: id,
      action: 'delete',
      data: {},
      status: 'pending',
      retryCount: 0,
    });
  },
};
```

---

## 5. 이미지 처리

### 오프라인 사진 촬영/선택
```
사용자가 사진 선택
→ Blob을 IndexedDB mediaQueue에 저장 (localRef 키)
→ moment.photo_data = null, moment.localMediaRef = localRef
→ UI에서는 URL.createObjectURL(blob)로 미리보기
```

### 싱크 시 업로드
```
1. moment create/update 싱크
2. mediaQueue에서 해당 momentId의 pending 항목 조회
3. base64로 변환 → 서버 API에 photo_data로 전송
4. 성공 → mediaQueue status = 'done'
5. 실패 → status = 'failed', 재시도
```

### 용량 관리
- mediaQueue 총 용량 상한: 200MB
- 초과 시 오래된 done 항목부터 삭제
- pending 항목은 삭제 안 함
- `navigator.storage.estimate()`로 모니터링

---

## 6. 동기화 엔진 (프리미엄 전용)

### 프리미엄 체크
```ts
function canSync(): boolean {
  // 프리미엄 유저만 동기화 가능
  // 무료 유저는 읽기 캐시만 (오프라인 수정은 로컬에만 유지)
  return isPremiumUser();
}
```

### 무료 유저 오프라인 동작
- ✅ 읽기: IndexedDB 캐시에서 데이터 열람
- ✅ 쓰기: IndexedDB에 저장 (로컬에서만 유효)
- ❌ 동기화: 온라인 복귀해도 서버 반영 안 됨
- ⚠️ UI: "프리미엄 구독 시 서버 동기화 가능" 배너

### 동기화 트리거
```
온라인 복귀 (online 이벤트)
  → canSync() 체크
  → syncLock 획득 (navigator.locks API)
  → 동기화 실행
```

### 동기화 순서 (의존성 기반)
```
Phase 1: Plan creates (부모 먼저)
Phase 2: Schedule creates (plan_id → serverId 교체)
Phase 3: Moment creates (schedule_id → serverId 교체)
Phase 4: Updates (timestamp 순)
Phase 5: Deletes (자식 먼저 — moments → schedules → plans)
Phase 6: Media uploads (mediaQueue pending)
Phase 7: 서버에서 전체 데이터 refetch → IndexedDB 덮어쓰기
```

### Op Compaction (싱크 전)
```
1. create → delete (같은 entityId, 둘 다 pending) → 둘 다 제거
2. 연속 update (같은 entityId) → 마지막 update만 유지
3. create → update → 하나의 create로 합침 (data 병합)
```

### 동시성 방지
```ts
async function runSync() {
  await navigator.locks.request('travly-sync', async () => {
    // 하나의 탭에서만 실행
    await compactOpLog();
    await syncCreates();
    await syncUpdates();
    await syncDeletes();
    await syncMedia();
    await refetchAll();
  });
}
```

### 에러 처리
- 개별 op 실패 → retryCount++, status='failed'
- retryCount >= 5 → 건너뛰고 다음 진행 (dead letter)
- 사용자에게 실패 건수 표시 ("3건 동기화 실패")
- 수동 재시도 버튼

---

## 7. 오프라인 지원 범위

| 기능 | 오프라인 읽기 | 오프라인 쓰기 | 동기화 |
|------|:---:|:---:|:---:|
| Plan 상세 | ✅ | ❌ (생성 불가, 수정 가능) | 프리미엄 |
| Schedule CRUD | ✅ | ✅ | 프리미엄 |
| Moment CRUD | ✅ | ✅ (사진=로컬Blob) | 프리미엄 |
| AI 비서 | ✅ (WebLLM) | - | - |
| Plan 생성 | ❌ | ❌ | - |
| 멤버 관리 | ❌ | ❌ | - |
| Fork | ❌ | ❌ | - |
| 리뷰 | ❌ | ❌ | - |

---

## 8. UI 표시

### 오프라인 인디케이터
- 글로벌 배너: "오프라인 모드" (상단 또는 하단)
- 로컬 전용 데이터: 아이콘 마크 (☁️❌ 또는 📱)
- 동기화 대기 건수: badge (예: "3건 동기화 대기")

### 동기화 UI
- 온라인 복귀 시 토스트: "N건 동기화 중..."
- 완료: "동기화 완료 ✅"
- 실패: "N건 실패 — 재시도" 버튼

### 프리미엄 업셀
- 무료 유저가 오프라인 수정 후 온라인 복귀:
  "오프라인 변경사항을 서버에 반영하려면 프리미엄이 필요합니다"
  [프리미엄 시작 ₩2,900/월]

---

## 9. 구현 순서

### Phase 2-A: 읽기 캐싱 (모든 유저)
1. `db.ts` — IndexedDB 열기, stores 정의
2. `offlineAPI.ts` — plansAPI.getById/getAll 래핑 (읽기 캐시)
3. 컴포넌트에서 기존 API → offlineAPI 교체
4. 오프라인 상태 배너

### Phase 2-B: 쓰기 + opLog (모든 유저)
5. opLog + genTempId
6. offlineAPI 쓰기 메서드 (schedule/moment CRUD)
7. mediaQueue (이미지 Blob 저장)
8. 로컬 수정 마크 UI

### Phase 2-C: 동기화 (프리미엄)
9. syncEngine.ts — compaction + phase별 동기화
10. idMap + temp→server ID 교체
11. media 업로드
12. 동기화 UI (진행/완료/실패)
13. 프리미엄 체크 + 업셀 UI
