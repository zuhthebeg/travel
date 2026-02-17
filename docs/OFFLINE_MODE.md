# Travly 오프라인 모드 설계

## 목적
여행 중 인터넷 없이도 기본적인 비서 기능 사용 가능하게.

## 기술 스택
- **WebLLM** (`@mlc-ai/web-llm`) — 브라우저 내 LLM 추론 엔진
- **WebGPU** — 하드웨어 가속 (모바일 Chrome 113+, Samsung 24+, iOS Safari 26+)
- **모델**: Qwen3-0.6B (기본) / Qwen3-1.7B (고사양 기기)
- **Service Worker** — 오프라인 캐싱 (기존 PWA 인프라 활용)
- **IndexedDB** — 여행 데이터 로컬 저장

## 온라인/오프라인 전환

```
navigator.onLine === true
  → OpenAI gpt-4o-mini (현재 그대로)

navigator.onLine === false
  → WebLLM Qwen3 (로컬)
  → IndexedDB 데이터 기반
```

- `navigator.onLine` + `online`/`offline` 이벤트로 자동 감지
- 비서 UI에 온/오프 상태 표시 (🟢 온라인 / 🟡 오프라인)
- 전환 시 사용자에게 토스트: "오프라인 모드로 전환됩니다"

## 오프라인 비서 기능 범위

### ✅ 가능 (오프라인)
1. **영어 회화 도우미** — 상황별 영어 표현, 간단한 번역
2. **여행 맥락 Q&A** — 일정/장소 기반 일반 상식 질의
3. **간단한 일정 CRUD** — 단일 일정 추가/수정/삭제 (JSON 파싱)
4. **일정 요약** — 오늘/내일 일정 읽어주기
5. **간단한 메모** — 순간 기록 텍스트 추가

### ❌ 불가 (온라인에서만)
1. 복잡한 배치 연산 (shift_all, delete_matching 등)
2. 맛집/관광지 정확한 추천 (검색 불가, 환각 위험)
3. 좌표 보정 / geocoding (외부 API 필요)
4. 멤버 초대 / 공유 기능
5. AI 일정 자동 생성

## 모델 관리

### 다운로드 전략
1. **명시적 다운로드**: 설정 페이지에 "오프라인 AI 준비" 버튼
2. WiFi 감지 시에만 다운로드 권유 (`navigator.connection?.type`)
3. 진행률 UI (WebLLM의 `initProgressCallback`)
4. 모델은 브라우저 Cache Storage에 저장됨 (WebLLM 내부)

### 모델 선택 로직
```
기기 메모리 <= 4GB → Qwen3-0.6B-q4f16_1-MLC (~400MB)
기기 메모리 > 4GB  → Qwen3-1.7B-q4f16_1-MLC (~1GB)
```
- `navigator.deviceMemory`로 판단 (없으면 0.6B 기본)
- 사용자가 설정에서 수동 선택 가능

### 엔진 생명주기
```
앱 시작 → 모델 다운로드 여부 확인 (Cache Storage)
         ├─ 다운로드 안 됨 → 오프라인 AI 비활성
         └─ 다운로드 됨 → 오프라인 전환 시 엔진 로드
              ├─ Web Worker에서 추론 (UI 블로킹 방지)
              └─ 앱 백그라운드 시 엔진 해제 (메모리 절약)
```

## 데이터 동기화 (IndexedDB)

### 오프라인 캐싱 대상
- 현재 선택된 여행 계획 (plan + schedules + moments)
- 사용자 프로필
- 최근 비서 대화 히스토리 (최대 20개)

### 동기화 전략
```
온라인 진입 시:
1. 서버 데이터 fetch
2. IndexedDB에 저장 (plan_id 기준)

오프라인 수정 시:
1. IndexedDB에 먼저 저장
2. 수정 큐(pendingChanges)에 추가
3. 온라인 복귀 시 큐 일괄 동기화
   → 충돌 시: 서버 우선 (마지막 수정 시간 비교)
```

### IndexedDB 스키마
```
travly-offline
├── plans          (keyPath: id)
├── schedules      (keyPath: id, index: plan_id)
├── moments        (keyPath: id, index: schedule_id)
├── pendingChanges (autoIncrement, index: timestamp)
└── modelCache     (모델 다운로드 상태)
```

## 오프라인 비서 프롬프트 설계

### System Prompt (오프라인 전용)
```
당신은 여행 비서입니다. 인터넷 없이 작동 중입니다.

현재 여행 정보:
- 제목: {plan.title}
- 지역: {plan.region}
- 기간: {plan.start_date} ~ {plan.end_date}
- 오늘 일정: {today_schedules}

할 수 있는 것:
- 영어 표현/번역 도움
- 일정 관련 질문 답변
- 간단한 일정 추가/수정 (JSON 형식으로 출력)

할 수 없는 것 (솔직하게 안내):
- 실시간 날씨, 영업시간
- 정확한 맛집/관광지 추천 (틀릴 수 있음 명시)
- 복잡한 일정 변경

일정 수정이 필요하면 아래 JSON 형식으로 출력:
{"action": "add|update|delete", "schedule": {...}}
```

### 영어 회화 모드
```
당신은 여행 영어 도우미입니다. 사용자가 여행 중 필요한 영어 표현을 물어봅니다.
- 상황별 영어 표현 제공
- 발음 팁 (한글 표기)
- 짧고 실용적인 문장 위주
현재 여행지: {plan.region}
```

## 구현 단계

### Phase 1: 기반 (이번)
1. WebLLM 의존성 추가 (`@mlc-ai/web-llm`)
2. 오프라인 엔진 서비스 (`src/lib/offlineEngine.ts`)
3. 설정 페이지에 "오프라인 AI 준비" UI
4. `navigator.onLine` 감지 → 비서 자동 전환
5. PC에서 기본 테스트

### Phase 2: IndexedDB 동기화
1. 여행 데이터 로컬 캐싱
2. 오프라인 CRUD → pendingChanges 큐
3. 온라인 복귀 시 동기화

### Phase 3: 최적화
1. Web Worker로 추론 이동
2. 모델 프리로딩 (앱 시작 시 백그라운드)
3. 프롬프트 최적화 (토큰 절약)
4. 모바일 성능 테스트 및 튜닝

## 파일 구조
```
src/
├── lib/
│   ├── offlineEngine.ts    # WebLLM 엔진 관리
│   ├── offlineDB.ts        # IndexedDB CRUD
│   └── offlineSync.ts      # 온라인 복귀 동기화
├── components/
│   └── OfflineIndicator.tsx # 온/오프 상태 표시
└── pages/
    └── SettingsPage.tsx     # 모델 다운로드 UI (추가)
```

## 주의사항
- WebGPU 미지원 기기 → 오프라인 AI 비활성 (안내 메시지)
- 모델 캐시 eviction 가능 → 재다운로드 안내
- 오프라인 CRUD는 로컬만 반영, 온라인 복귀 시 서버 동기화 필수
- 환각 위험 높으므로 정확도 미보장 안내 필수
