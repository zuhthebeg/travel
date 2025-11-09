# Cloudflare Pages + D1 + R2 종합 가이드

> **목적**: 다른 프로젝트에서도 Cloudflare를 사용할 때 참고할 수 있는 실전 가이드

## 📋 목차

1. [초기 설정](#초기-설정)
2. [D1 데이터베이스](#d1-데이터베이스)
3. [R2 스토리지](#r2-스토리지)
4. [Pages Functions](#pages-functions)
5. [로컬 개발](#로컬-개발)
6. [배포](#배포)
7. [환경별 명령어 치트시트](#환경별-명령어-치트시트)
8. [트러블슈팅](#트러블슈팅)
9. [실전 워크플로우](#실전-워크플로우)
10. [유용한 팁](#유용한-팁)

---

## 초기 설정

### 1. Wrangler 설치

```bash
# npm으로 전역 설치
npm install -g wrangler

# 또는 프로젝트별로 설치
npm install --save-dev wrangler

# 설치 확인
wrangler --version
```

**권장**: 프로젝트별로 설치 후 `package.json`에 스크립트 등록

```json
{
  "scripts": {
    "dev": "wrangler pages dev . --port=8788",
    "deploy": "wrangler pages deploy .",
    "db:init": "wrangler d1 execute DB_NAME --local --file=./schema.sql",
    "db:migrate": "wrangler d1 execute DB_NAME --file=./schema.sql"
  },
  "devDependencies": {
    "wrangler": "^3.0.0"
  }
}
```

---

### 2. Cloudflare 인증

```bash
# 브라우저로 로그인 (처음 1회만)
wrangler login

# 로그인 상태 확인
wrangler whoami

# 로그아웃 (필요시)
wrangler logout
```

**인증 정보 저장 위치**:
- Windows: `C:\Users\{username}\.wrangler\config\default.toml`
- Mac/Linux: `~/.wrangler/config/default.toml`

---

### 3. 프로젝트 초기화

```bash
# 새 프로젝트 디렉토리 생성
mkdir my-cloudflare-app
cd my-cloudflare-app

# wrangler.toml 파일 생성
touch wrangler.toml
```

**기본 wrangler.toml 구조**:

```toml
name = "my-app"
compatibility_date = "2024-01-01"

# Pages 설정 (정적 파일 서빙)
pages_build_output_dir = "."

# D1 데이터베이스 바인딩 (생성 후 추가)
# [[d1_databases]]
# binding = "DB"
# database_name = "my-app-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# R2 스토리지 바인딩 (생성 후 추가)
# [[r2_buckets]]
# binding = "STORAGE"
# bucket_name = "my-app-storage"
```

---

## D1 데이터베이스

### 1. 데이터베이스 생성

```bash
# 프로덕션 DB 생성
wrangler d1 create my-app-db

# 출력 예시:
# ✅ Successfully created DB 'my-app-db'!
#
# [[d1_databases]]
# binding = "DB"
# database_name = "my-app-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**중요**: 출력된 내용을 `wrangler.toml`에 복사하세요!

```toml
[[d1_databases]]
binding = "DB"  # TypeScript에서 context.env.DB로 접근
database_name = "my-app-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 실제 ID로 교체
```

---

### 2. 스키마 파일 작성

**schema.sql** 예시:

```sql
-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 게시글 테이블
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);

-- 초기 데이터 삽입 (옵션)
INSERT OR IGNORE INTO users (id, email, name) VALUES
(1, 'admin@example.com', 'Admin'),
(2, 'user@example.com', 'User');
```

---

### 3. 데이터베이스 초기화/마이그레이션

#### 로컬 환경 (개발용)

```bash
# 로컬 D1 DB 초기화
wrangler d1 execute my-app-db --local --file=./schema.sql

# 또는 SQL 직접 실행
wrangler d1 execute my-app-db --local --command "SELECT * FROM users"

# 로컬 DB 파일 위치: .wrangler/state/v3/d1/miniflare-D1DatabaseObject/{uuid}.sqlite
```

#### 프로덕션 환경 (운영용)

```bash
# 프로덕션 D1 DB 마이그레이션
wrangler d1 execute my-app-db --file=./schema.sql

# 프로덕션 쿼리 실행
wrangler d1 execute my-app-db --command "SELECT * FROM users"

# ⚠️ 주의: 프로덕션에서는 --local 플래그 제거!
```

---

### 4. D1 쿼리 방법 (Pages Functions)

**functions/api/users.ts**:

```typescript
interface Env {
  DB: D1Database;  // wrangler.toml의 binding과 동일
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  try {
    // 단일 결과 조회
    const user = await DB.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(1).first();

    // 여러 결과 조회
    const { results } = await DB.prepare(`
      SELECT * FROM users ORDER BY created_at DESC
    `).all();

    // INSERT/UPDATE/DELETE
    const result = await DB.prepare(`
      INSERT INTO users (email, name) VALUES (?, ?)
    `).bind('new@example.com', 'New User').run();

    // 트랜잭션 (여러 쿼리를 하나로 묶음)
    const batch = await DB.batch([
      DB.prepare('INSERT INTO users (email, name) VALUES (?, ?)').bind('a@ex.com', 'A'),
      DB.prepare('INSERT INTO users (email, name) VALUES (?, ?)').bind('b@ex.com', 'B'),
    ]);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

---

### 5. D1 데이터 확인 방법

#### 방법 1: wrangler 명령어
```bash
# 로컬 DB 조회
wrangler d1 execute my-app-db --local --command "SELECT * FROM users"

# 프로덕션 DB 조회
wrangler d1 execute my-app-db --command "SELECT * FROM users"
```

#### 방법 2: Cloudflare Dashboard
1. https://dash.cloudflare.com 접속
2. Workers & Pages → D1 → 데이터베이스 선택
3. Console 탭에서 SQL 직접 실행

#### 방법 3: 로컬 SQLite 파일 직접 열기
```bash
# SQLite CLI 설치 필요
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/{uuid}.sqlite

# 테이블 목록 확인
.tables

# 데이터 조회
SELECT * FROM users;

# 종료
.quit
```

---

## R2 스토리지

### 1. R2 버킷 생성

```bash
# 버킷 생성
wrangler r2 bucket create my-app-storage

# 버킷 목록 확인
wrangler r2 bucket list

# 버킷 삭제 (주의!)
wrangler r2 bucket delete my-app-storage
```

**wrangler.toml에 추가**:

```toml
[[r2_buckets]]
binding = "STORAGE"  # context.env.STORAGE로 접근
bucket_name = "my-app-storage"
```

---

### 2. R2 파일 업로드/다운로드 (Pages Functions)

**functions/api/upload.ts**:

```typescript
interface Env {
  STORAGE: R2Bucket;
}

// 파일 업로드 (Base64 → R2)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { STORAGE } = context.env;

  try {
    const { fileName, fileData } = await context.request.json();

    // Base64 디코딩
    const base64Data = fileData.split(',')[1]; // "data:image/png;base64,{data}" 형식인 경우
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // R2에 업로드
    const key = `uploads/${Date.now()}_${fileName}`;
    await STORAGE.put(key, binaryData, {
      httpMetadata: {
        contentType: 'image/png'  // 파일 타입에 맞게 설정
      }
    });

    return new Response(JSON.stringify({
      success: true,
      url: key  // R2 경로 반환
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// 파일 다운로드 (R2 → 응답)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { STORAGE } = context.env;
  const url = new URL(context.request.url);
  const key = url.searchParams.get('key'); // 예: /api/download?key=uploads/123_file.png

  if (!key) {
    return new Response('Missing key parameter', { status: 400 });
  }

  try {
    const object = await STORAGE.get(key);

    if (!object) {
      return new Response('File not found', { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000'
      }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

---

### 3. R2 파일 관리

```typescript
// 파일 삭제
await context.env.STORAGE.delete('uploads/123_file.png');

// 파일 목록 조회 (prefix 기반)
const list = await context.env.STORAGE.list({
  prefix: 'uploads/',
  limit: 100
});

// list.objects 반복
for (const obj of list.objects) {
  console.log(obj.key, obj.size, obj.uploaded);
}

// 파일 메타데이터 조회
const head = await context.env.STORAGE.head('uploads/123_file.png');
console.log(head?.size, head?.httpMetadata?.contentType);
```

---

### 4. R2 CLI 명령어 (로컬 테스트용)

```bash
# 로컬 파일을 R2에 업로드
wrangler r2 object put my-app-storage/test.txt --file=./local-file.txt

# R2에서 파일 다운로드
wrangler r2 object get my-app-storage/test.txt --file=./downloaded-file.txt

# 파일 삭제
wrangler r2 object delete my-app-storage/test.txt

# 버킷 내 파일 목록 조회
wrangler r2 object list my-app-storage
```

---

## Pages Functions

### 1. 함수 라우팅 규칙

Cloudflare Pages Functions는 파일 경로 기반 라우팅을 사용합니다.

```
functions/
├── api/
│   ├── hello.ts              → /api/hello
│   ├── users.ts              → /api/users
│   ├── posts/
│   │   └── [id].ts           → /api/posts/:id (동적 라우팅)
│   └── [[catchall]].ts       → /api/* (모든 경로 캐치)
├── index.ts                  → / (루트 경로)
└── _middleware.ts            → 모든 요청에 적용되는 미들웨어
```

---

### 2. HTTP 메서드별 핸들러

**functions/api/users.ts**:

```typescript
interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
}

// GET /api/users
export const onRequestGet: PagesFunction<Env> = async (context) => {
  // GET 요청 처리
};

// POST /api/users
export const onRequestPost: PagesFunction<Env> = async (context) => {
  // POST 요청 처리
  const body = await context.request.json();
};

// PATCH /api/users
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  // PATCH 요청 처리
};

// DELETE /api/users
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  // DELETE 요청 처리
};

// 모든 메서드 처리 (onRequest)
export const onRequest: PagesFunction<Env> = async (context) => {
  const method = context.request.method;
  // 모든 HTTP 메서드 처리
};
```

---

### 3. 동적 라우팅 (Path Parameters)

**functions/api/posts/[id].ts**:

```typescript
// GET /api/posts/123 → params.id = "123"
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { id } = context.params;  // URL 파라미터 추출

  const post = await context.env.DB.prepare(`
    SELECT * FROM posts WHERE id = ?
  `).bind(parseInt(id)).first();

  if (!post) {
    return new Response('Post not found', { status: 404 });
  }

  return new Response(JSON.stringify(post), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

---

### 4. 미들웨어 (전역 설정)

**functions/_middleware.ts**:

```typescript
// 모든 요청에 CORS 헤더 추가
export const onRequest: PagesFunction = async (context) => {
  // 다음 핸들러 실행
  const response = await context.next();

  // CORS 헤더 추가
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return response;
};
```

**특정 경로의 미들웨어** (`functions/api/_middleware.ts`):

```typescript
// /api/* 경로에만 적용되는 미들웨어
export const onRequest: PagesFunction = async (context) => {
  // 인증 체크
  const authHeader = context.request.headers.get('Authorization');

  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 인증 성공 시 다음 핸들러 실행
  return context.next();
};
```

---

### 5. 환경 변수 사용

#### wrangler.toml에 환경 변수 정의

```toml
[vars]
API_KEY = "development-key"
MAX_UPLOAD_SIZE = 5242880  # 5MB

# 프로덕션 환경 변수
[env.production]
[env.production.vars]
API_KEY = "production-key"
MAX_UPLOAD_SIZE = 10485760  # 10MB
```

#### Functions에서 사용

```typescript
interface Env {
  API_KEY: string;
  MAX_UPLOAD_SIZE: number;
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.API_KEY;
  const maxSize = context.env.MAX_UPLOAD_SIZE;

  // 환경 변수 사용
  if (apiKey !== expectedKey) {
    return new Response('Invalid API key', { status: 403 });
  }
};
```

---

## 로컬 개발

### 1. 개발 서버 실행

```bash
# 기본 실행 (D1, R2 바인딩 포함)
wrangler pages dev . --port=8788

# D1만 사용하는 경우
wrangler pages dev . --d1=DB --port=8788

# R2만 사용하는 경우
wrangler pages dev . --r2=STORAGE --port=8788

# 둘 다 사용
wrangler pages dev . --d1=DB --r2=STORAGE --port=8788

# 특정 디렉토리만 서빙 (빌드 결과물이 dist에 있는 경우)
wrangler pages dev ./dist --port=8788
```

**package.json 스크립트 추가**:

```json
{
  "scripts": {
    "dev": "wrangler pages dev . --d1=DB --r2=STORAGE --port=8788",
    "dev:clean": "rm -rf .wrangler && npm run dev"
  }
}
```

---

### 2. 로컬 개발 환경 특징

- **D1 로컬 데이터베이스**: `.wrangler/state/v3/d1/` 디렉토리에 SQLite 파일로 저장
- **R2 로컬 스토리지**: 파일 시스템에 에뮬레이션 (실제 R2는 아님)
- **핫 리로드**: 코드 변경 시 자동으로 재시작 (HTML/JS는 수동 새로고침 필요)
- **로그 출력**: `console.log()`가 터미널에 표시됨

---

### 3. 로컬 DB 초기화 (처음 시작할 때)

```bash
# 1. 로컬 D1 DB 초기화
wrangler d1 execute my-app-db --local --file=./schema.sql

# 2. 개발 서버 실행
npm run dev

# 3. 브라우저에서 http://localhost:8788 접속
```

---

### 4. 로컬 데이터 초기화 (다시 시작)

```bash
# .wrangler 디렉토리 삭제 (모든 로컬 데이터 삭제)
rm -rf .wrangler

# 또는 Windows에서
rd /s /q .wrangler

# DB 재초기화
wrangler d1 execute my-app-db --local --file=./schema.sql
```

---

## 배포

### 1. Pages 프로젝트 생성 (최초 1회)

```bash
# 프로젝트 생성 + 첫 배포
wrangler pages deploy . --project-name=my-app

# 출력 예시:
# ✨ Success! Uploaded 1 files (0.23 sec)
# ✨ Deployment complete! Take a peek over at https://xxxxx.pages.dev
```

---

### 2. 배포 (이후)

```bash
# 기본 배포 (프로젝트 이름은 wrangler.toml에서 자동 감지)
wrangler pages deploy .

# 특정 브랜치로 배포
wrangler pages deploy . --branch=production

# 배포 후 URL 확인
# Production: https://my-app.pages.dev
# Preview (PR 브랜치): https://xxxxx.my-app.pages.dev
```

**package.json에 스크립트 추가**:

```json
{
  "scripts": {
    "deploy": "wrangler pages deploy .",
    "deploy:production": "wrangler pages deploy . --branch=production"
  }
}
```

---

### 3. 프로덕션 DB 마이그레이션

배포 **전에** 프로덕션 DB를 업데이트해야 합니다!

```bash
# 프로덕션 DB 마이그레이션
wrangler d1 execute my-app-db --file=./schema.sql

# 또는 특정 마이그레이션 파일
wrangler d1 execute my-app-db --file=./migrations/001_add_users.sql

# 배포
npm run deploy
```

---

### 4. 배포 로그 확인

```bash
# 실시간 로그 스트리밍
wrangler pages deployment tail --project-name=my-app

# 또는
wrangler tail --name=my-app
```

---

### 5. 배포 롤백

```bash
# 배포 목록 확인
wrangler pages deployment list --project-name=my-app

# 특정 배포로 롤백 (Dashboard에서 진행 권장)
# Cloudflare Dashboard → Workers & Pages → my-app → Deployments → Rollback
```

---

## 환경별 명령어 치트시트

### 개발 환경 (로컬)

| 작업 | 명령어 |
|------|--------|
| **개발 서버 실행** | `wrangler pages dev . --d1=DB --r2=STORAGE --port=8788` |
| **로컬 DB 초기화** | `wrangler d1 execute my-app-db --local --file=./schema.sql` |
| **로컬 DB 쿼리** | `wrangler d1 execute my-app-db --local --command "SELECT * FROM users"` |
| **로컬 데이터 초기화** | `rm -rf .wrangler && wrangler d1 execute my-app-db --local --file=./schema.sql` |
| **로컬 R2 파일 업로드** | 개발 서버에서 API 호출 (실제 R2는 아님) |

---

### 프로덕션 환경 (운영)

| 작업 | 명령어 |
|------|--------|
| **배포** | `wrangler pages deploy .` |
| **프로덕션 DB 마이그레이션** | `wrangler d1 execute my-app-db --file=./schema.sql` |
| **프로덕션 DB 쿼리** | `wrangler d1 execute my-app-db --command "SELECT * FROM users"` |
| **프로덕션 R2 파일 업로드** | `wrangler r2 object put my-app-storage/file.txt --file=./local.txt` |
| **프로덕션 로그 확인** | `wrangler pages deployment tail --project-name=my-app` |

---

### 핵심 차이점

| 항목 | 로컬 (개발) | 프로덕션 (운영) |
|------|------------|---------------|
| **D1 명령어** | `--local` 플래그 **필수** | `--local` 플래그 **제거** |
| **데이터 저장 위치** | `.wrangler/state/v3/d1/` | Cloudflare 클라우드 |
| **R2 스토리지** | 파일 시스템 에뮬레이션 | 실제 R2 버킷 |
| **URL** | `http://localhost:8788` | `https://my-app.pages.dev` |
| **환경 변수** | `wrangler.toml` → `[vars]` | Dashboard 또는 `[env.production.vars]` |

---

## 트러블슈팅

### 1. "Error: No D1 databases configured"

**문제**: `wrangler.toml`에 D1 바인딩이 없음

**해결**:
```bash
# 1. DB 생성
wrangler d1 create my-app-db

# 2. 출력된 내용을 wrangler.toml에 복사
[[d1_databases]]
binding = "DB"
database_name = "my-app-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

---

### 2. "Error: table users already exists"

**문제**: `CREATE TABLE users` 실행 시 이미 테이블이 존재함

**해결**:
```sql
-- schema.sql에서 IF NOT EXISTS 사용
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ...
);

-- 또는 테이블 삭제 후 재생성
DROP TABLE IF EXISTS users;
CREATE TABLE users (...);
```

---

### 3. 로컬 DB가 초기화되지 않음

**문제**: `npm run dev` 실행 시 "no such table: users" 에러

**해결**:
```bash
# 로컬 DB 명시적으로 초기화
wrangler d1 execute my-app-db --local --file=./schema.sql

# DB 파일 확인
ls -la .wrangler/state/v3/d1/
```

---

### 4. "Error: Unauthorized" (401)

**문제**: Cloudflare 로그인이 만료되었거나 인증 정보가 없음

**해결**:
```bash
# 로그아웃 후 재로그인
wrangler logout
wrangler login
```

---

### 5. R2 파일이 업로드되지 않음

**문제**: R2 바인딩이 없거나 버킷이 생성되지 않음

**해결**:
```bash
# 1. 버킷 생성
wrangler r2 bucket create my-app-storage

# 2. wrangler.toml에 바인딩 추가
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "my-app-storage"

# 3. 개발 서버 재시작
npm run dev
```

---

### 6. CORS 에러 발생

**문제**: 프론트엔드에서 API 호출 시 CORS 에러

**해결**: `functions/_middleware.ts` 생성
```typescript
export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
};
```

---

### 7. 배포 후 404 에러

**문제**: `https://my-app.pages.dev/teacher.html` 접속 시 404

**원인**: Cloudflare Pages는 `.html` 확장자를 자동으로 제거함

**해결**: URL에서 `.html` 제거
- ❌ `/teacher.html`
- ✅ `/teacher`

**코드 수정**:
```javascript
// 리다이렉트 시
window.location.href = '/teacher';  // NOT '/teacher.html'
```

---

### 8. "wrangler: command not found"

**문제**: wrangler가 설치되지 않았거나 PATH에 없음

**해결**:
```bash
# 전역 설치
npm install -g wrangler

# 또는 프로젝트별 설치 후 npx 사용
npm install --save-dev wrangler
npx wrangler --version
```

---

## 실전 워크플로우

### 시나리오 1: 새 프로젝트 시작 (제로부터 배포까지)

```bash
# 1. 프로젝트 디렉토리 생성
mkdir my-new-app
cd my-new-app

# 2. package.json 초기화
npm init -y

# 3. wrangler 설치
npm install --save-dev wrangler

# 4. Cloudflare 로그인
npx wrangler login

# 5. wrangler.toml 생성
cat > wrangler.toml <<EOL
name = "my-new-app"
compatibility_date = "2024-01-01"
pages_build_output_dir = "."
EOL

# 6. D1 데이터베이스 생성
npx wrangler d1 create my-new-app-db

# 7. 출력된 내용을 wrangler.toml에 복사 (수동)
# [[d1_databases]]
# binding = "DB"
# database_name = "my-new-app-db"
# database_id = "..."

# 8. R2 버킷 생성
npx wrangler r2 bucket create my-new-app-storage

# 9. wrangler.toml에 R2 바인딩 추가 (수동)
# [[r2_buckets]]
# binding = "STORAGE"
# bucket_name = "my-new-app-storage"

# 10. 스키마 파일 작성
cat > schema.sql <<EOL
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOL

# 11. 로컬 DB 초기화
npx wrangler d1 execute my-new-app-db --local --file=./schema.sql

# 12. index.html 작성
cat > index.html <<EOL
<!DOCTYPE html>
<html>
<head><title>My App</title></head>
<body><h1>Hello, Cloudflare!</h1></body>
</html>
EOL

# 13. API 함수 작성
mkdir -p functions/api
cat > functions/api/hello.ts <<EOL
export const onRequestGet = async () => {
  return new Response(JSON.stringify({ message: 'Hello from Cloudflare!' }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
EOL

# 14. package.json 스크립트 추가
npm pkg set scripts.dev="wrangler pages dev . --d1=DB --r2=STORAGE --port=8788"
npm pkg set scripts.deploy="wrangler pages deploy ."
npm pkg set scripts.db:local="wrangler d1 execute my-new-app-db --local --file=./schema.sql"
npm pkg set scripts.db:prod="wrangler d1 execute my-new-app-db --file=./schema.sql"

# 15. 로컬 개발 서버 실행
npm run dev

# 16. 브라우저에서 테스트
# http://localhost:8788 → "Hello, Cloudflare!"
# http://localhost:8788/api/hello → {"message":"Hello from Cloudflare!"}

# 17. 프로덕션 DB 마이그레이션
npm run db:prod

# 18. 배포
npm run deploy

# 19. 배포된 URL 확인
# https://my-new-app.pages.dev
```

---

### 시나리오 2: 기존 프로젝트 클론 후 로컬 실행

```bash
# 1. 저장소 클론
git clone https://github.com/username/my-app.git
cd my-app

# 2. 의존성 설치
npm install

# 3. Cloudflare 로그인 (필요시)
npx wrangler login

# 4. wrangler.toml 확인
# - D1 database_id가 있는지 확인
# - R2 bucket_name이 있는지 확인

# 5. 로컬 DB 초기화
npm run db:local
# 또는
npx wrangler d1 execute {DB_NAME} --local --file=./schema.sql

# 6. 개발 서버 실행
npm run dev

# 7. 브라우저에서 http://localhost:8788 접속
```

---

### 시나리오 3: DB 스키마 변경 후 배포

```bash
# 1. schema.sql 수정
# 예: 새 테이블 추가, 컬럼 추가 등

# 2. 로컬 DB에 적용 (테스트)
npm run db:local

# 3. 로컬 개발 서버에서 테스트
npm run dev
# → http://localhost:8788에서 동작 확인

# 4. 프로덕션 DB에 적용 (⚠️ 주의!)
npm run db:prod

# 5. 배포
npm run deploy

# 6. 프로덕션 확인
# https://my-app.pages.dev에서 동작 확인
```

---

### 시나리오 4: 프로덕션 데이터 확인

```bash
# 방법 1: wrangler 명령어
wrangler d1 execute my-app-db --command "SELECT * FROM users LIMIT 10"

# 방법 2: Cloudflare Dashboard
# 1. https://dash.cloudflare.com 접속
# 2. Workers & Pages → D1 → 데이터베이스 선택
# 3. Console 탭에서 SQL 실행

# 방법 3: API 엔드포인트 추가 (개발용)
# functions/api/debug.ts
export const onRequestGet = async (context) => {
  const { results } = await context.env.DB.prepare('SELECT * FROM users').all();
  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' }
  });
};

# https://my-app.pages.dev/api/debug 접속
```

---

## 유용한 팁

### 1. package.json 스크립트 템플릿

```json
{
  "scripts": {
    "dev": "wrangler pages dev . --d1=DB --r2=STORAGE --port=8788",
    "deploy": "wrangler pages deploy .",
    "db:local": "wrangler d1 execute DB_NAME --local --file=./schema.sql",
    "db:prod": "wrangler d1 execute DB_NAME --file=./schema.sql",
    "db:query:local": "wrangler d1 execute DB_NAME --local --command",
    "db:query:prod": "wrangler d1 execute DB_NAME --command",
    "logs": "wrangler pages deployment tail",
    "r2:list": "wrangler r2 object list BUCKET_NAME",
    "clean": "rm -rf .wrangler"
  }
}
```

**사용 예시**:
```bash
npm run db:query:local "SELECT * FROM users"
npm run db:query:prod "SELECT COUNT(*) FROM users"
```

---

### 2. TypeScript 타입 정의

**types/cloudflare.d.ts**:

```typescript
// Cloudflare 환경 변수 타입 정의
interface Env {
  // D1 데이터베이스
  DB: D1Database;

  // R2 스토리지
  STORAGE: R2Bucket;

  // 환경 변수
  API_KEY: string;
  MAX_UPLOAD_SIZE: number;
}

// PagesFunction 타입 확장
declare global {
  interface CloudflareContext {
    env: Env;
    params: Record<string, string>;
    request: Request;
    next: () => Promise<Response>;
  }
}
```

---

### 3. 환경별 설정 분리

**wrangler.toml**:

```toml
name = "my-app"
compatibility_date = "2024-01-01"

# 기본 환경 변수 (개발)
[vars]
API_KEY = "dev-key"
ENV = "development"

# 프로덕션 환경
[env.production]
[env.production.vars]
API_KEY = "prod-key"
ENV = "production"

# 스테이징 환경
[env.staging]
[env.staging.vars]
API_KEY = "staging-key"
ENV = "staging"
```

**배포 시 환경 지정**:
```bash
# 프로덕션 배포
wrangler pages deploy . --env=production

# 스테이징 배포
wrangler pages deploy . --env=staging
```

---

### 4. DB 마이그레이션 패턴

**migrations/ 디렉토리 구조**:

```
migrations/
├── 001_initial_schema.sql
├── 002_add_posts_table.sql
├── 003_add_indexes.sql
└── run_migrations.sh
```

**001_initial_schema.sql**:
```sql
-- Migration 001: Initial Schema
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**002_add_posts_table.sql**:
```sql
-- Migration 002: Add Posts Table
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**run_migrations.sh**:
```bash
#!/bin/bash
DB_NAME="my-app-db"
ENV=${1:-local}  # local or production

if [ "$ENV" = "local" ]; then
  FLAG="--local"
else
  FLAG=""
fi

for file in migrations/*.sql; do
  echo "Running migration: $file"
  wrangler d1 execute $DB_NAME $FLAG --file="$file"
done

echo "All migrations completed!"
```

**사용법**:
```bash
# 로컬 마이그레이션
bash run_migrations.sh local

# 프로덕션 마이그레이션
bash run_migrations.sh production
```

---

### 5. .gitignore 설정

```.gitignore
# Wrangler 로컬 데이터
.wrangler/
.dev.vars

# Node modules
node_modules/

# 환경 변수 (민감 정보)
.env
.env.local

# 빌드 결과물
dist/
build/

# OS 파일
.DS_Store
Thumbs.db
```

---

### 6. 로컬 개발 시 디버깅

```typescript
// functions/api/users.ts
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    // 로컬 개발 시에만 상세 로그 출력
    const isDev = context.env.ENV === 'development';

    if (isDev) {
      console.log('[DEBUG] Request URL:', context.request.url);
      console.log('[DEBUG] Request method:', context.request.method);
    }

    const { results } = await context.env.DB.prepare('SELECT * FROM users').all();

    if (isDev) {
      console.log('[DEBUG] Query results:', results.length);
    }

    return new Response(JSON.stringify({ success: true, users: results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[ERROR]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

**터미널 출력 예시**:
```
[DEBUG] Request URL: http://localhost:8788/api/users
[DEBUG] Request method: GET
[DEBUG] Query results: 5
```

---

### 7. Cloudflare Dashboard 활용

**주요 메뉴**:
1. **Workers & Pages**: 배포 목록, 설정, 환경 변수
2. **D1**: 데이터베이스 목록, SQL Console
3. **R2**: 버킷 목록, 파일 브라우저
4. **Analytics**: 트래픽, 에러율, 응답 시간

**유용한 작업**:
- 환경 변수 설정 (민감 정보는 Dashboard에서만)
- 실시간 로그 확인
- 커스텀 도메인 연결
- 배포 롤백

---

### 8. 비용 최적화 팁

**Cloudflare 무료 플랜 제한**:
- **Pages**: 무료 (무제한 요청)
- **D1**: 월 5GB 저장소, 100만 read, 100만 write
- **R2**: 월 10GB 저장소, 100만 read, 100만 write

**최적화 전략**:
1. **D1 쿼리 최적화**: 인덱스 활용, 불필요한 SELECT * 제거
2. **R2 캐싱**: `Cache-Control` 헤더로 CDN 캐싱 활용
3. **이미지 최적화**: 업로드 전 압축, WebP 변환
4. **배치 처리**: 여러 쿼리를 `DB.batch()`로 묶기

---

## 참고 자료

- **Cloudflare Pages 공식 문서**: https://developers.cloudflare.com/pages/
- **D1 공식 문서**: https://developers.cloudflare.com/d1/
- **R2 공식 문서**: https://developers.cloudflare.com/r2/
- **Wrangler CLI 문서**: https://developers.cloudflare.com/workers/wrangler/

---

**작성일**: 2025-11-09
**버전**: 1.0
**다음 업데이트**: AI 챗봇 구현 후 Gemini API 연동 섹션 추가 예정
