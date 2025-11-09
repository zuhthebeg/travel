# 🌏 여행 계획 웹앱 MVP 설계 문서

## 🎯 프로젝트 개요

**목표**  
사용자가 여행 계획을 손쉽게 등록·공유하고, 실제 여행 중에도 참고 및 대화형 비서(Gemini 기반)를 통해 계획을 보조받는 웹앱.  

**핵심 가치**  
- 가볍게 등록하고 쉽게 확인하며 똑똑하게 도와주는 여행계획 앱  
- 복잡한 로그인 없이 빠른 접근 (로컬스토리지 기반)  
- 확장 가능한 구조 (구글 로그인, 음성 입출력, 장기 체류형 여행 등 확장 가능)

---

## 🧱 기술스택 구조

### Frontend
- **React + Vite**
- **React Router** — 페이지 라우팅
- **Recoil or Zustand** — 전역 상태 관리
- **TailwindCSS + HeadlessUI** — UI 구성
- **Google Map API / Leaflet.js** — 지도 표시
- **LocalStorage API** — 마지막 상태 저장 및 캐시 UX

### Backend (Cloudflare)
- **Cloudflare Pages + Functions** — 서버리스 백엔드
- **Cloudflare D1 (SQLite)** — 여행계획 및 사용자 데이터 저장
- **Cloudflare KV** — 인기 여행 캐시 및 방문 로그
- **Workers AI or Gemini API** — LLM 기반 여행비서 기능

---

## 🗂️ 전체 아키텍처 개요

**흐름 구조**

사용자 브라우저  
└─ React PWA (LocalStorage / IndexedDB)  
　├─ API 호출 → Cloudflare Functions  
　│　├─ Auth API (ID/PW 로그인)  
　│　├─ Travel Plan CRUD API  
　│　├─ Gemini Assistant API  
　│　└─ Map/Recommend API  
　├─ STT/TTS → Google Cloud Speech API  
　└─ D1 DB (여행, 유저, 추천 데이터)

---

## 📁 주요 페이지 및 기능

### 1️⃣ 메인 페이지 (`/`)
**목적:** 전체 여행계획 탐색 및 내여행 진입

**구성 요소**
- 상단: 이번달 여행 계획 (공개된 여행계획 썸네일/제목/지역/기간)
- 우측: 베스트 여행계획 (추천순 정렬)
- 하단: 지도 (여행지 마커 + 로그인 시 내 여행 표시)
- 로그인 박스 (ID/PW 입력)
- 로그인 후 “내 여행으로 가기” 버튼 표시

**UX 포인트**
- 로컬스토리지 기반 자동 복원  
- 로그인하지 않아도 공개 플랜 열람 가능  

---

### 2️⃣ 로그인 페이지 (`/login`)
**기능**
- ID / PW 간단 로그인 (JWT 없이 세션토큰 발급)
- 이후 구글 OAuth 확장 고려
- 비밀번호 재설정은 MVP 제외

---

### 3️⃣ 여행 상세/편집 페이지 (`/plan/:id`)
**핵심 페이지**

**기능**
- 여행 캘린더 (일/주/월 보기)
- 일정 카드 리스트 (날짜별 일정, 장소, 메모, Plan B/C)
- 일정 추가/수정:
  - 제목, 날짜, 시간대, 장소(지도 선택), 메모, Plan B, Plan C  
  - 필수항목 없음, 부분 저장 가능 (Auto Save)
  - 로컬스토리지 자동 저장  
- 여행 썸네일 업로드 + 지역 자동 태깅 (Geolocation)
- 기간 > 30일 → “살아보기” 컨셉 자동 전환

---

### 4️⃣ 내 여행 페이지 (`/my`)
**기능**
- 내가 등록한 여행 목록 (진행 중 / 완료 / 예정)
- 로컬스토리지 기반 오프라인 접근 가능  
- 선택 시 상세페이지 이동

---

## 💬 Gemini 여행비서 기능

### 개요
- Cloudflare Function → Gemini API 호출
- 여행 데이터 기반 Q&A 및 추천
- 음성 인터페이스(STT/TTS) 포함
- **AI 여행 초안 자동생성 기능 추가**

---

### 🔹 대화형 여행비서 (Q&A)
**시나리오 예시**
1. 사용자가 “오늘 일정 변경해줘” 음성 입력  
2. STT → 텍스트 변환  
3. Gemini 프롬프트 구성:
   - 여행계획 데이터  
   - 사용자의 자연어 요청  
   - Plan B/C 제안 포함  
4. Gemini 응답:  
   “Plan B로 등록된 ‘우메다 공중정원’을 추천합니다.”  
5. 필요 시 TTS로 음성 출력  

**백엔드 처리**
- `/api/assistant`
  - Input: 여행 ID + 사용자 쿼리  
  - Process: Gemini 호출 + DB PlanB/C 검색  
  - Output: 텍스트 응답 + 음성 URL(optional)

---

### 🔹 여행 초안 자동생성 기능 (AI Draft)
**목적:** 사용자가 대략적인 여행 정보를 입력하면 AI가 자동으로 초안 일정을 생성하여 저장하는 기능.  

**플로우**
1. 사용자가 제목·여행지·기간만 입력  
2. `/api/assistant/generate-draft` 호출  
3. Gemini API 프롬프트 예시:
사용자가 등록한 정보:

지역: 오사카

기간: 3박 4일

여행 목적: 가족 여행

요청:
위 정보를 기반으로 일자별 여행 초안을 작성해줘.
각 날짜마다 대표 장소 2~3개, 이동 흐름 포함.

pgsql
코드 복사
4. Gemini 응답 결과를 일정 구조(JSON)로 반환  
5. API가 D1 DB의 schedules 테이블에 자동 삽입  
6. 사용자는 해당 초안을 바로 열어서 수정 가능  

**예시 결과 구조**
```json
{
"plan_id": 21,
"schedules": [
 {"date": "2025-05-10", "title": "도톤보리 방문", "place": "난바역 근처"},
 {"date": "2025-05-11", "title": "오사카성 투어", "place": "오사카성 공원"}
]
}
UX 효과

최소 입력으로 여행계획 자동 완성

초안 기반으로 즉시 수정 가능

Gemini 학습 데이터 활용해 지역별 인기 일정 반영 가능

💾 데이터 모델 (Cloudflare D1)
users
컬럼	타입	설명
id	INTEGER	PK
username	TEXT	사용자명
password	TEXT	해시 비밀번호
created_at	DATETIME	생성일

plans
컬럼	타입	설명
id	INTEGER	PK
user_id	INTEGER	FK(users.id)
title	TEXT	여행 제목
region	TEXT	지역
start_date	DATE	시작일
end_date	DATE	종료일
thumbnail	TEXT	이미지 경로
is_public	BOOLEAN	공개 여부
created_at	DATETIME	생성일

schedules
컬럼	타입	설명
id	INTEGER	PK
plan_id	INTEGER	FK(plans.id)
date	DATE	일정 날짜
title	TEXT	일정명
place	TEXT	장소
memo	TEXT	메모
plan_b	TEXT	대체 일정
plan_c	TEXT	추가 대체 일정

recommendations
컬럼	타입	설명
id	INTEGER	PK
plan_id	INTEGER	FK(plans.id)
count	INTEGER	추천수

🧩 확장 고려사항
기능	설명	단계
구글 로그인	OAuth2 기반 인증	2차
음성 입출력	STT/TTS 연동	2차
여행 공유 URL	SNS 공유 기능	2차
팀 여행 협업	공동 편집자 초대	3차
AI 일정 자동생성	목적지 입력 시 자동 초안 생성	1차 (포함됨)
AI 일정 자동보정	날씨/상황에 따른 대체 일정 제안	2차 이후

🧠 UX 원칙
작성보다 열람이 쉬워야 한다.

자동저장(Auto Save), 최근기록 유지

지도와 캘린더를 동시에 조작 가능 (Drag & Drop 일정이동)

최소 클릭으로 일정 등록 가능

PWA 설치 지원 (오프라인 접근)

🚀 개발 단계 (MVP 로드맵)
단계	내용	목표
1단계	React 구조 세팅 + Cloudflare Pages 배포	앱 뼈대 완성
2단계	여행 CRUD + 로컬저장	주요 기능 완성
3단계	Gemini 여행비서 + 여행 초안 자동생성 기능	AI 인터페이스 구축
4단계	지도/캘린더 UI + UX 개선	시각적 완성도
5단계	베스트 여행 / 추천 시스템	사용자 참여 유도

📌 요약
Frontend: React 기반 PWA

Backend: Cloudflare Functions + D1

AI Assistant: Gemini + Google STT/TTS

핵심 기능: 여행 초안 자동생성 + AI 여행비서

UX 중심: 자동저장, 간단 로그인, 지도 기반 UI

확장성: 살아보기·협업·자동일정 등 단계적 확장 가능
