  ⎿  Travel MVP 구현 계획

     Phase 1: 프로젝트 초기 설정 (Foundation)

     1. React + Vite 프로젝트 초기화
       - npm create vite@latest 실행
       - TypeScript + React 설정
       - TailwindCSS 설치 및 구성
     2. Cloudflare 환경 설정
       - Wrangler CLI 설치
       - wrangler.toml 설정 파일 작성
       - Cloudflare D1 데이터베이스 생성
       - 기본 스키마 작성 (users, plans, schedules, recommendations 테이블)
     3. 기본 라우팅 구조
       - React Router 설치
       - 메인 페이지 (/)
       - 로그인 페이지 (/login)
       - 여행 상세/편집 (/plan/:id)
       - 내 여행 목록 (/my)
     4. 배포 테스트
       - Cloudflare Pages에 "Hello World" 배포
       - 빌드/배포 프로세스 검증

     Phase 2: 백엔드 API 구현

     1. D1 스키마 마이그레이션
       - SQL 스키마 파일 작성
       - 로컬 D1 데이터베이스 초기화
       - 마이그레이션 실행 및 테스트
     2. Cloudflare Functions API
       - /api/users - 사용자 CRUD
       - /api/plans - 여행 계획 CRUD
       - /api/schedules - 일정 CRUD
       - /api/recommendations - 추천 기능
     3. 로컬 테스트
       - Wrangler dev로 로컬 서버 실행
       - API 엔드포인트 동작 확인

     Phase 3: 프론트엔드 핵심 기능

     1. 상태 관리
       - Zustand 설치 및 설정
       - localStorage 연동
     2. UI 컴포넌트
       - 여행 계획 카드
       - 캘린더 뷰
       - 일정 편집 폼
     3. 페이지 구현
       - 메인 페이지: 공개 여행 목록
       - 로그인: 간단한 ID/PW 인증
       - 여행 상세: 일정 조회/편집
       - 내 여행: 사용자별 여행 목록

     Phase 4: Gemini AI 어시스턴트

     1. Gemini API 연동
       - API 키 설정 (환경 변수)
       - /api/assistant 엔드포인트 구현
       - 대화 컨텍스트 관리
     2. 자동 초안 생성
       - /api/assistant/generate-draft 엔드포인트
       - 목적지 + 날짜 입력 → AI가 초안 생성
     3. 채팅 UI
       - 대화형 인터페이스
       - 대화 기록 저장

     Phase 5: 지도 및 UX 개선

     1. 지도 통합
       - Google Maps API 또는 Leaflet.js
       - 여행지 마커 표시
     2. 편의 기능
       - 드래그앤드롭 일정 재정렬
       - 자동 저장
       - 썸네일 업로드 (Cloudflare R2)



Todos
  [×] 데이터베이스 스키마에 time 필드 추가
  [×] 시간이 포함된 테스트 데이터 추가
  [×] DaisyUI 설치 및 구성
  [×] 컴포넌트 DaisyUI로 리디자인
  [×] 시간 필드 UI 추가

