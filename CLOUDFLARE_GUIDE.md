# Cloudflare Pages + D1 + R2 + React/Vite 종합 가이드

> **목적**: React + Vite 프론트엔드와 Cloudflare Pages Functions 백엔드를 사용하는 풀스택 프로젝트의 시작 가이드

## 목차

1. [프로젝트 구조](#프로젝트-구조)
2. [초기 설정](#초기-설정)
3. [Vite + React 설정](#vite--react-설정)
4. [Pages Functions (백엔드 API)](#pages-functions-백엔드-api)
5. [D1 데이터베이스](#d1-데이터베이스)
6. [R2 스토리지](#r2-스토리지)
7. [환경 변수 관리](#환경-변수-관리)
8. [로컬 개발](#로컬-개발)
9. [배포](#배포)
10. [GitHub Actions 자동 배포](#github-actions-자동-배포)
11. [PWA 설정](#pwa-설정)
12. [트러블슈팅](#트러블슈팅)
13. [명령어 치트시트](#명령어-치트시트)

---

## 프로젝트 구조

```
my-app/
├── public/                      # 정적 파일
│   ├── manifest.json           # PWA 매니페스트
│   ├── sw.js                   # 서비스 워커
│   └── favicon-*.png           # 아이콘들
├── src/                         # 프론트엔드 소스
│   ├── components/             # React 컴포넌트
│   ├── pages/                  # 페이지 컴포넌트
│   ├── store/                  # Zustand 상태 관리
│   ├── lib/                    # 유틸리티, API 클라이언트
│   ├── hooks/                  # 커스텀 훅
│   ├── App.tsx                 # 메인 앱 컴포넌트
│   ├── main.tsx                # 진입점
│   └── index.css               # 글로벌 스타일
├── functions/                   # Cloudflare Pages Functions (백엔드)
│   ├── api/
│   │   ├── users.ts            # /api/users
│   │   ├── plans.ts            # /api/plans
│   │   ├── plans/
│   │   │   └── [id].ts         # /api/plans/:id
│   │   ├── auth/
│   │   │   └── google.ts       # /api/auth/google
│   │   └── assistant/
│   │       ├── _common.ts      # 공통 유틸리티
│   │       └── index.ts        # /api/assistant
│   ├── types.ts                # 타입 정의
│   └── _middleware.ts          # 글로벌 미들웨어
├── migrations/                  # DB 마이그레이션 파일
│   ├── 0001_initial.sql
│   └── 0002_add_feature.sql
├── dist/                        # 빌드 결과물 (자동 생성)
├── .wrangler/                   # 로컬 개발 데이터 (gitignore)
├── .dev.vars                    # 로컬 환경 변수 (gitignore)
├── wrangler.toml               # Cloudflare 설정
├── vite.config.ts              # Vite 설정
├── tailwind.config.js          # Tailwind CSS 설정
├── tsconfig.json               # TypeScript 설정
├── package.json
└── schema.sql                   # DB 스키마
```

---

## 초기 설정

### 1. 프로젝트 생성

```bash
# Vite + React + TypeScript 프로젝트 생성
npm create vite@latest my-app -- --template react-ts
cd my-app

# 기본 의존성 설치
npm install

# 추가 의존성 설치
npm install react-router-dom zustand

# 개발 의존성
npm install -D wrangler tailwindcss postcss autoprefixer daisyui
```

### 2. Tailwind CSS 설정

```bash
npx tailwindcss init -p
```

**tailwind.config.js**:
```javascript
/** @type {import('tailwindcss').Config} */
import daisyui from 'daisyui'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [daisyui],
  daisyui: {
    themes: ["light", "dark"],
  },
}
```

**src/index.css**:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 3. Cloudflare 인증

```bash
# 로그인 (처음 1회만)
npx wrangler login

# 인증 확인
npx wrangler whoami
```

### 4. wrangler.toml 생성

```toml
name = "my-app"
compatibility_date = "2024-01-01"
pages_build_output_dir = "./dist"

# D1 데이터베이스 (아래에서 생성 후 추가)
# [[d1_databases]]
# binding = "DB"
# database_name = "my-app-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# R2 스토리지 (필요시 활성화)
# [[r2_buckets]]
# binding = "STORAGE"
# bucket_name = "my-app-storage"

# 기본 환경 변수
[vars]
ENVIRONMENT = "development"
```

---

## Vite + React 설정

### vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 개발 시 API 요청을 Wrangler 서버로 프록시
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
})
```

### package.json 스크립트

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "pages:dev": "npm run build && wrangler pages dev ./dist",
    "pages:deploy": "npm run build && wrangler pages deploy ./dist",
    "db:local": "wrangler d1 execute my-app-db --local --file=./schema.sql",
    "db:prod": "wrangler d1 execute my-app-db --file=./schema.sql",
    "test": "vitest"
  }
}
```

### 프론트엔드 API 클라이언트 (src/lib/api.ts)

```typescript
const API_BASE_URL = import.meta.env.DEV ? '' : '';  // 상대 경로 사용

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

async function fetchAPI<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

// API 모듈 예시
export const usersAPI = {
  getAll: () => fetchAPI<User[]>('/api/users'),
  getById: (id: number) => fetchAPI<User>(`/api/users/${id}`),
  create: (data: CreateUserInput) => fetchAPI<User>('/api/users', { method: 'POST', body: data }),
  update: (id: number, data: UpdateUserInput) => fetchAPI<User>(`/api/users/${id}`, { method: 'PATCH', body: data }),
  delete: (id: number) => fetchAPI<void>(`/api/users/${id}`, { method: 'DELETE' }),
};
```

---

## Pages Functions (백엔드 API)

### 파일 기반 라우팅

```
functions/
├── api/
│   ├── users.ts              → GET/POST /api/users
│   ├── users/
│   │   └── [id].ts           → GET/PATCH/DELETE /api/users/:id
│   └── posts/
│       ├── index.ts          → GET/POST /api/posts
│       └── [id].ts           → GET/PATCH/DELETE /api/posts/:id
└── _middleware.ts            → 모든 요청에 적용
```

### 타입 정의 (functions/types.ts)

```typescript
// 환경 변수 타입
export interface Env {
  DB: D1Database;
  STORAGE?: R2Bucket;
  GEMINI_API_KEY: string;
  ENVIRONMENT: string;
}

// DB 모델 타입
export interface User {
  id: number;
  username: string;
  email: string | null;
  picture: string | null;
  created_at: string;
}

// API 요청/응답 헬퍼
export function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}
```

### API 엔드포인트 예시 (functions/api/users.ts)

```typescript
import { Env, User, jsonResponse, errorResponse } from '../types';

// GET /api/users
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { results } = await context.env.DB.prepare(
      'SELECT * FROM users ORDER BY created_at DESC'
    ).all<User>();

    return jsonResponse(results);
  } catch (error: any) {
    console.error('Failed to fetch users:', error);
    return errorResponse(error.message, 500);
  }
};

// POST /api/users
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<{ username: string; email?: string }>();

    if (!body.username) {
      return errorResponse('Username is required');
    }

    const result = await context.env.DB.prepare(
      'INSERT INTO users (username, email) VALUES (?, ?) RETURNING *'
    )
      .bind(body.username, body.email || null)
      .first<User>();

    return jsonResponse(result, 201);
  } catch (error: any) {
    console.error('Failed to create user:', error);
    return errorResponse(error.message, 500);
  }
};
```

### 동적 라우팅 (functions/api/users/[id].ts)

```typescript
import { Env, User, jsonResponse, errorResponse } from '../../types';

// GET /api/users/:id
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id;

  const user = await context.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  )
    .bind(id)
    .first<User>();

  if (!user) {
    return errorResponse('User not found', 404);
  }

  return jsonResponse(user);
};

// PATCH /api/users/:id
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const id = context.params.id;
  const body = await context.request.json<Partial<User>>();

  // 동적 UPDATE 쿼리 생성
  const updates: string[] = [];
  const values: any[] = [];

  if (body.username) {
    updates.push('username = ?');
    values.push(body.username);
  }
  if (body.email !== undefined) {
    updates.push('email = ?');
    values.push(body.email);
  }

  if (updates.length === 0) {
    return errorResponse('No fields to update');
  }

  values.push(id);

  const result = await context.env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ? RETURNING *`
  )
    .bind(...values)
    .first<User>();

  return jsonResponse(result);
};

// DELETE /api/users/:id
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = context.params.id;

  await context.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

  return jsonResponse({ success: true });
};
```

### 미들웨어 (functions/_middleware.ts)

```typescript
// 모든 요청에 CORS 헤더 추가
export const onRequest: PagesFunction = async (context) => {
  // OPTIONS 요청 (preflight) 처리
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 다음 핸들러 실행
  const response = await context.next();

  // CORS 헤더 추가
  response.headers.set('Access-Control-Allow-Origin', '*');

  return response;
};
```

---

## D1 데이터베이스

### 1. 데이터베이스 생성

```bash
# 프로덕션 DB 생성
npx wrangler d1 create my-app-db

# 출력된 내용을 wrangler.toml에 복사
# [[d1_databases]]
# binding = "DB"
# database_name = "my-app-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2. 스키마 작성 (schema.sql)

```sql
-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password TEXT,  -- NULL 허용 (OAuth 사용자)
  google_id TEXT,
  email TEXT,
  picture TEXT,
  auth_provider TEXT DEFAULT 'local',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 게시물 테이블
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  is_public INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
```

### 3. DB 초기화/마이그레이션

```bash
# 로컬 DB 초기화
npx wrangler d1 execute my-app-db --local --file=./schema.sql

# 프로덕션 DB 마이그레이션 (주의!)
npx wrangler d1 execute my-app-db --file=./schema.sql

# SQL 직접 실행
npx wrangler d1 execute my-app-db --local --command "SELECT * FROM users"
```

### 4. D1 쿼리 패턴

```typescript
// 단일 결과 조회
const user = await context.env.DB.prepare(
  'SELECT * FROM users WHERE id = ?'
).bind(id).first<User>();

// 여러 결과 조회
const { results } = await context.env.DB.prepare(
  'SELECT * FROM users WHERE active = ?'
).bind(true).all<User>();

// INSERT + 결과 반환
const newUser = await context.env.DB.prepare(
  'INSERT INTO users (username, email) VALUES (?, ?) RETURNING *'
).bind(username, email).first<User>();

// 트랜잭션 (배치)
const batch = await context.env.DB.batch([
  context.env.DB.prepare('INSERT INTO users (username) VALUES (?)').bind('user1'),
  context.env.DB.prepare('INSERT INTO users (username) VALUES (?)').bind('user2'),
]);
```

---

## R2 스토리지

### 1. 버킷 생성

```bash
npx wrangler r2 bucket create my-app-storage
```

**wrangler.toml에 추가**:
```toml
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "my-app-storage"
```

### 2. 파일 업로드/다운로드 API

```typescript
// functions/api/upload.ts
import { Env, jsonResponse, errorResponse } from '../types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return errorResponse('No file provided');
    }

    const key = `uploads/${Date.now()}_${file.name}`;
    const buffer = await file.arrayBuffer();

    await context.env.STORAGE.put(key, buffer, {
      httpMetadata: { contentType: file.type },
    });

    return jsonResponse({ key, url: `/api/files/${key}` });
  } catch (error: any) {
    return errorResponse(error.message, 500);
  }
};
```

---

## 환경 변수 관리

### 로컬 개발 (.dev.vars)

```bash
# .dev.vars (gitignore에 포함 필수!)
GEMINI_API_KEY=your-api-key-here
GOOGLE_CLIENT_ID=your-google-client-id
DATABASE_SECRET=your-secret
```

### 프로덕션 (Cloudflare Dashboard)

1. Cloudflare Dashboard → Workers & Pages → 프로젝트 선택
2. Settings → Environment Variables
3. Production 환경에 변수 추가

### 프론트엔드 환경 변수 (Vite)

```bash
# .env.local (gitignore에 포함)
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_API_URL=http://localhost:8788
```

**사용법**:
```typescript
// src/App.tsx
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'default-id';
```

---

## 로컬 개발

### 개발 워크플로우

```bash
# 1. 로컬 DB 초기화 (처음 또는 스키마 변경 시)
npm run db:local

# 2. 풀스택 개발 서버 실행
npm run pages:dev

# 브라우저에서 http://localhost:8788 접속
```

### 프론트엔드만 개발 (API 없이)

```bash
# Vite 개발 서버만 실행
npm run dev

# 브라우저에서 http://localhost:5173 접속
# API 호출은 localhost:8788로 프록시됨
```

### 로컬 데이터 초기화

```bash
# Windows
rd /s /q .wrangler

# Mac/Linux
rm -rf .wrangler

# DB 재초기화
npm run db:local
```

---

## 배포

### 수동 배포

```bash
# 1. 프로덕션 DB 마이그레이션 (스키마 변경 시)
npm run db:prod

# 2. 빌드 + 배포
npm run pages:deploy
```

### 배포 확인

```bash
# 실시간 로그 스트리밍
npx wrangler pages deployment tail --project-name=my-app
```

---

## GitHub Actions 자동 배포

### 1. GitHub Secrets 설정

```
GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret
```

필요한 Secrets:
- `CLOUDFLARE_API_TOKEN`: Cloudflare API 토큰 (Workers & Pages 권한)
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID

### 2. Workflow 파일 (.github/workflows/deploy.yml)

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy ./dist --project-name=my-app
```

---

## PWA 설정

### 1. manifest.json (public/)

```json
{
  "name": "My App",
  "short_name": "MyApp",
  "description": "My awesome app",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4f46e5",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/favicon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 2. Service Worker (public/sw.js)

```javascript
const CACHE_NAME = 'my-app-v1';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // API: 네트워크 우선
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    // 정적 파일: 캐시 우선
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
```

### 3. SW 등록 (src/main.tsx)

```typescript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('SW registered:', reg))
      .catch((err) => console.error('SW registration failed:', err));
  });
}
```

### 4. index.html 메타 태그

```html
<head>
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#4f46e5" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <link rel="apple-touch-icon" href="/favicon-512x512.png" />
</head>
```

---

## 트러블슈팅

### "D1_ERROR: no such table"
```bash
# 로컬 DB 초기화 안 됨
npx wrangler d1 execute my-app-db --local --file=./schema.sql
```

### "Error: Unauthorized"
```bash
npx wrangler logout
npx wrangler login
```

### CORS 에러
`functions/_middleware.ts`에 CORS 헤더 추가 (위 예시 참고)

### API 404 에러
- `functions/` 폴더 위치 확인 (프로젝트 루트)
- 파일명과 URL 경로 일치 확인
- `npm run build` 후 `npm run pages:dev` 재시작

### wrangler pages dev 에러
```bash
# 빌드 결과물 확인
ls dist/

# 없으면 먼저 빌드
npm run build
```

---

## 명령어 치트시트

| 작업 | 명령어 |
|------|--------|
| 프론트엔드 개발 | `npm run dev` |
| 풀스택 개발 | `npm run pages:dev` |
| 빌드 | `npm run build` |
| 배포 | `npm run pages:deploy` |
| 로컬 DB 초기화 | `npm run db:local` |
| 프로덕션 DB 마이그레이션 | `npm run db:prod` |
| 로컬 DB 쿼리 | `npx wrangler d1 execute DB --local --command "..."` |
| 프로덕션 DB 쿼리 | `npx wrangler d1 execute DB --command "..."` |
| 로그 확인 | `npx wrangler pages deployment tail` |
| 로컬 데이터 초기화 | `rm -rf .wrangler` |

---

## .gitignore 필수 항목

```gitignore
# Wrangler
.wrangler/
.dev.vars

# Vite
dist/
node_modules/

# Environment
.env
.env.local
.env.*.local

# TypeScript
tsconfig.tsbuildinfo

# OS
.DS_Store
Thumbs.db
```

---

## 환경 변수 요약

| 변수 | 위치 | 용도 |
|------|------|------|
| `GEMINI_API_KEY` | .dev.vars, Dashboard | AI API 키 |
| `VITE_GOOGLE_CLIENT_ID` | .env.local | Google OAuth 클라이언트 ID (프론트엔드) |
| `CLOUDFLARE_API_TOKEN` | GitHub Secrets | 자동 배포용 API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | Cloudflare 계정 ID |

---

**작성일**: 2025-11-22
**버전**: 2.0
