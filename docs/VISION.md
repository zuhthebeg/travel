# Travly - 장기 비전

> 📅 최초 작성: 2026-02-13

## 핵심 컨셉

**"시간 여행 앨범"** - 개인의 여행 기록을 시간대별로 회상하고 추억하는 플랫폼

여행 **계획**뿐 아니라 **지난 추억**까지, 시간 슬라이더로 인생의 여행을 돌아보는 앱

---

## 현재 상태 (MVP)

### 완료된 기능
- [x] 여행 계획 CRUD
- [x] AI 자연어 일정 파싱
- [x] 지도 기반 여행 동선 (Leaflet)
- [x] 장소 검색 + 자동 좌표 저장
- [x] 시간 슬라이더 (메인 페이지)
- [x] PWA 기본 설정

### 진행 중
- [ ] 오프라인 저장 (IndexedDB)
- [ ] Service Worker 캐싱

### 예정
- [ ] 과거 여행 기록 (앨범 모드)
- [ ] 사진 업로드 + 자동 태깅
- [ ] 클라이언트 AI (WebLLM)
- [ ] 동기화 로직

---

## 향후 로드맵

### Phase 1: 오프라인 지원 (Q2 2026)
- IndexedDB로 여행 데이터 로컬 저장
- Service Worker로 앱 캐싱
- 온라인 복귀 시 자동 동기화

#### 오프라인 모드 상세 설계

**1. 여행 단위 오프라인 저장**
- 특정 여행을 "오프라인 저장" 버튼으로 클라이언트에 다운로드
- 해당 여행의 모든 데이터: 일정, 장소, 메모, 지도 타일, 사진 등
- 저장 시 버전/타임스탬프 기록

**2. 동기화 전략**
- 인터넷 연결 시 자동 감지 (`navigator.onLine` + `online` 이벤트)
- 오프라인 중 변경된 내용만 서버에 푸시 (delta sync)
- 충돌 해결: 최신 타임스탬프 우선 또는 사용자 선택

**3. 로컬 AI 모델 프리다운로드**
- 설정에서 "오프라인 AI 준비" 옵션
- Wi-Fi 연결 시 WebLLM 모델 (~1GB) 백그라운드 다운로드
- 다운로드 상태 표시 + 완료 알림

**4. 오프라인 데이터 캐싱 활용**
- 여행 종료 후에도 다운로드된 데이터 캐시로 유지
- 같은 지역 재방문 시 빠른 로딩
- 저장 공간 관리: 오래된 캐시 자동 정리 옵션

**5. UI/UX 고려사항**
- 오프라인 상태 표시 (상단 배너 또는 아이콘)
- 동기화 대기 중인 변경사항 개수 표시
- "지금 동기화" 수동 버튼

### Phase 2: 앨범 모드 (Q3 2026)
- 과거 여행 기록 UI
- 사진 첨부 + 갤러리 뷰
- 타임라인 스크롤

### Phase 3: 클라이언트 AI (Q4 2026)
- WebLLM 연동 (Llama 3.2 1B)
- 오프라인 일정 추천
- 하이브리드 전략 (온/오프라인)

### Phase 4: 네이티브 앱 (2027)
- Capacitor 또는 React Native
- 푸시 알림
- 위젯 지원

---

## 기술 스택

### 현재
- React + Vite + TypeScript
- Tailwind CSS + DaisyUI
- Cloudflare Pages + D1
- Leaflet (지도)
- OpenAI API

### 예정
- IndexedDB (Dexie.js)
- Workbox (Service Worker)
- WebLLM (@mlc-ai/web-llm)
- Capacitor (네이티브)

---

## 클라이언트 AI 조사

### 추천: WebLLM

```bash
npm install @mlc-ai/web-llm
```

```javascript
import { CreateMLCEngine } from "@mlc-ai/web-llm";

// 초기화 (첫 실행 시 모델 다운로드 ~1GB)
const engine = await CreateMLCEngine("Llama-3.2-1B-Instruct-q4f32_1-MLC", {
  initProgressCallback: (progress) => {
    console.log(`Loading: ${progress.text}`);
  }
});

// 사용
const response = await engine.chat.completions.create({
  messages: [
    { role: "system", content: "You are a travel assistant." },
    { role: "user", content: "부산 2박3일 일정 추천해줘" }
  ],
  temperature: 0.7,
});
console.log(response.choices[0].message.content);
```

### 지원 모델 (2026 기준)
| 모델 | 크기 | 용도 |
|------|------|------|
| Llama 3.2 1B | ~1GB | 기본 대화, 요약 |
| Llama 3.2 3B | ~3GB | 복잡한 추론 |
| Phi-3.5 Mini | ~2GB | 코딩, 분석 |
| Qwen2.5 1.5B | ~1.5GB | 다국어 |

### 하이브리드 전략

```javascript
const AI = {
  async chat(prompt) {
    if (navigator.onLine) {
      // 온라인: OpenAI API (고품질)
      return await callOpenAI(prompt);
    } else {
      // 오프라인: WebLLM (로컬)
      return await localEngine.chat(prompt);
    }
  }
};
```

---

## 비즈니스 모델 (후순위)

### 우선순위
1. **사용자 확보** - 무료 기능으로 MAU 성장
2. **데이터 축적** - 여행 패턴, 선호도 분석
3. **수익화** - 가치 증명 후 모델 적용

### 후보 모델
1. **프리미엄 구독** ($5-10/월)
   - 무제한 AI 사용
   - 고급 분석/추천
   - 무제한 저장공간

2. **제휴 수수료**
   - 숙박 예약 연동 (Booking, Agoda)
   - 항공권 연동
   - 맛집/액티비티 예약

3. **광고** (최후 수단)
   - 여행 관련 네이티브 광고만
   - 사용자 경험 해치지 않게

---

## 경쟁 분석

| 서비스 | 장점 | 단점 |
|--------|------|------|
| TripIt | 자동 일정 파싱 | 과거 기록 X, 비쌈 |
| Google Trips | 무료, 통합 | 서비스 종료 |
| Wanderlog | UI 좋음 | AI 약함 |
| **Travly** | AI + 앨범 + 오프라인 | 아직 MVP |

### 차별점
1. **시간 여행** - 과거~미래 통합 타임라인
2. **AI 네이티브** - 자연어로 모든 것
3. **오프라인 퍼스트** - 여행지에서도 동작
4. **개인 앨범** - SNS 아닌 나만의 기록

---

## 객관적 평가

### 강점
- ✅ 명확한 페인포인트 (여행 중 인터넷 문제)
- ✅ 차별화 포인트 (AI + 오프라인 + 앨범)
- ✅ 기술적 실현 가능성 (WebLLM 등 성숙)
- ✅ 무료 인프라 (Cloudflare)

### 약점
- ⚠️ 초기 사용자 확보 어려움 (마케팅 필요)
- ⚠️ 클라이언트 AI 성능 한계 (1B 모델)
- ⚠️ 데이터 이전 허들 (기존 앱에서 마이그레이션)

### 기회
- 🚀 AI 여행 시장 성장
- 🚀 디지털 노마드/MZ 여행 증가
- 🚀 프라이버시 중시 트렌드 (로컬 AI)

### 위협
- ⚡ 빅테크 진입 (Google, Apple)
- ⚡ 기존 여행 앱 AI 업그레이드

### 결론
**"충분히 도전할 만한 아이디어"**

핵심은 **오프라인 + AI + 개인 앨범**의 조합.
빅테크가 하기 어려운 틈새(오프라인, 프라이버시)를 공략하면 승산 있음.

초기 전략: 
1. 해외여행 자주 가는 2030 타겟
2. 인스타/블로그 대신 "나만의 기록" 소구
3. 오프라인 기능으로 차별화

---

*이 문서는 지속적으로 업데이트됩니다.*
