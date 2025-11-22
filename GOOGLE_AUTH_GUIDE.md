# Google OAuth 인증 가이드 (React + Cloudflare Pages)

> **목적**: React 프론트엔드와 Cloudflare Pages Functions 백엔드에서 Google OAuth 로그인 구현 가이드

## 목차

1. [Google Cloud Console 설정](#google-cloud-console-설정)
2. [프론트엔드 구현](#프론트엔드-구현)
3. [백엔드 API 구현](#백엔드-api-구현)
4. [데이터베이스 스키마](#데이터베이스-스키마)
5. [환경 변수 설정](#환경-변수-설정)
6. [전체 인증 흐름](#전체-인증-흐름)
7. [트러블슈팅](#트러블슈팅)

---

## Google Cloud Console 설정

### 1. 프로젝트 생성

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 상단 프로젝트 선택 → "새 프로젝트" 클릭
3. 프로젝트 이름 입력 후 "만들기"

### 2. OAuth 동의 화면 설정

1. 좌측 메뉴 → "API 및 서비스" → "OAuth 동의 화면"
2. User Type: "외부" 선택 (모든 Google 계정 허용)
3. 앱 정보 입력:
   - **앱 이름**: My App
   - **사용자 지원 이메일**: your-email@gmail.com
   - **개발자 연락처 정보**: your-email@gmail.com
4. 범위(Scopes) 추가:
   - `userinfo.email`
   - `userinfo.profile`
   - `openid`
5. 테스트 사용자 추가 (테스트 모드인 경우)

### 3. OAuth 클라이언트 ID 생성

1. 좌측 메뉴 → "API 및 서비스" → "사용자 인증 정보"
2. "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
3. 애플리케이션 유형: "웹 애플리케이션"
4. 이름: "My App Web Client"
5. **승인된 JavaScript 원본** 추가:
   ```
   http://localhost:5173
   http://localhost:8788
   https://your-app.pages.dev
   https://your-custom-domain.com
   ```
6. **승인된 리디렉션 URI** (일반적으로 필요 없음, 암시적 흐름 사용)
7. "만들기" 클릭 후 **클라이언트 ID** 복사

---

## 프론트엔드 구현

### 1. 패키지 설치

```bash
npm install @react-oauth/google
```

### 2. OAuth Provider 설정

**src/App.tsx**:
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MainPage } from './pages/MainPage';

// 환경 변수에서 클라이언트 ID 읽기 (또는 기본값 사용)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-client-id.apps.googleusercontent.com';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainPage />} />
          {/* 다른 라우트 */}
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;
```

### 3. 로그인 버튼 컴포넌트

**src/components/GoogleLoginButton.tsx**:
```typescript
import { useGoogleLogin } from '@react-oauth/google';
import { authAPI } from '../lib/api';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';

interface GoogleLoginButtonProps {
  onSuccess?: () => void;
  redirectTo?: string;
  fullWidth?: boolean;
}

export default function GoogleLoginButton({
  onSuccess,
  redirectTo,
  fullWidth = false
}: GoogleLoginButtonProps) {
  const { setCurrentUser } = useStore();
  const navigate = useNavigate();

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        // 1. Google API에서 사용자 정보 가져오기
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const userInfo = await userInfoResponse.json();

        // 2. 사용자 정보를 Base64로 인코딩하여 백엔드로 전송
        const credential = btoa(JSON.stringify({
          sub: userInfo.sub,      // Google User ID
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
        }));

        // 3. 백엔드 API 호출
        const user = await authAPI.googleLogin(credential);

        // 4. 상태 저장
        setCurrentUser(user);
        localStorage.setItem('temp_user_id', user.id.toString());

        // 5. 콜백 및 리디렉션
        if (onSuccess) onSuccess();
        if (redirectTo) navigate(redirectTo);

      } catch (error) {
        console.error('Google login failed:', error);
        alert('로그인에 실패했습니다. 다시 시도해주세요.');
      }
    },
    onError: () => {
      console.error('Google Login Failed');
      alert('로그인에 실패했습니다.');
    },
  });

  return (
    <button
      onClick={() => login()}
      className={`btn btn-outline btn-sm gap-2 ${fullWidth ? 'w-full' : ''}`}
    >
      {/* Google 아이콘 */}
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      <span>Google로 계속하기</span>
    </button>
  );
}
```

### 4. API 클라이언트

**src/lib/api.ts** (인증 관련 부분):
```typescript
export const authAPI = {
  googleLogin: async (credential: string) => {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });

    if (!response.ok) {
      throw new Error('Google login failed');
    }

    const data = await response.json();
    return data.user;
  },
};
```

### 5. 상태 관리 (Zustand)

**src/store/useStore.ts**:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  username: string;
  email: string | null;
  picture: string | null;
  auth_provider: string;
}

interface Store {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({ currentUser: state.currentUser }),
    }
  )
);
```

---

## 백엔드 API 구현

### 인증 엔드포인트

**functions/api/auth/google.ts**:
```typescript
import { Env, User, jsonResponse, errorResponse } from '../../types';

// CORS preflight
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

// POST /api/auth/google
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { credential } = await context.request.json<{ credential: string }>();

    if (!credential) {
      return errorResponse('Google credential is required');
    }

    // Credential 디코딩 (Base64 JSON 또는 JWT)
    const payload = decodeCredential(credential);

    if (!payload || !payload.sub || !payload.email) {
      return errorResponse('Invalid Google credential');
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split('@')[0];
    const picture = payload.picture || null;

    // 1. 기존 사용자 조회
    const { results: existingUsers } = await context.env.DB.prepare(
      'SELECT * FROM users WHERE google_id = ?'
    ).bind(googleId).all<User>();

    let user: User;

    if (existingUsers && existingUsers.length > 0) {
      // 2a. 기존 사용자 - 프로필 업데이트
      user = existingUsers[0];

      if (user.picture !== picture || user.email !== email) {
        await context.env.DB.prepare(
          'UPDATE users SET picture = ?, email = ? WHERE id = ?'
        ).bind(picture, email, user.id).run();

        user.picture = picture;
        user.email = email;
      }
    } else {
      // 2b. 신규 사용자 생성
      const { success } = await context.env.DB.prepare(
        'INSERT INTO users (username, password, google_id, email, picture, auth_provider) VALUES (?, NULL, ?, ?, ?, ?)'
      ).bind(name, googleId, email, picture, 'google').run();

      if (!success) {
        return errorResponse('Failed to create user', 500);
      }

      // 생성된 사용자 조회
      const { results: newUsers } = await context.env.DB.prepare(
        'SELECT * FROM users WHERE google_id = ?'
      ).bind(googleId).all<User>();

      if (!newUsers || newUsers.length === 0) {
        return errorResponse('Failed to retrieve created user', 500);
      }

      user = newUsers[0];
    }

    // 3. 사용자 정보 반환 (비밀번호 제외)
    return jsonResponse({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        picture: user.picture,
        auth_provider: user.auth_provider,
      },
    });

  } catch (error) {
    console.error('Google login error:', error);
    return errorResponse('Google login failed', 500);
  }
};

// Credential 디코딩 (JWT 또는 Base64 JSON)
function decodeCredential(token: string): any {
  try {
    const parts = token.split('.');

    // JWT 형식 (3 파트)
    if (parts.length === 3) {
      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    }

    // Base64 JSON 형식
    try {
      const decoded = atob(token);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  } catch (error) {
    console.error('Credential decode error:', error);
    return null;
  }
}
```

---

## 데이터베이스 스키마

### 사용자 테이블 (OAuth 지원)

**schema.sql**:
```sql
-- 사용자 테이블 (로컬 + OAuth 통합)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password TEXT,                          -- NULL 허용 (OAuth 사용자는 비밀번호 없음)
  google_id TEXT,                         -- Google 고유 ID
  email TEXT,
  picture TEXT,                           -- 프로필 이미지 URL
  auth_provider TEXT DEFAULT 'local',     -- 'local' 또는 'google'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Google ID 인덱스 (빠른 조회)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
  ON users(google_id)
  WHERE google_id IS NOT NULL;

-- 이메일 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### 기존 DB에 OAuth 컬럼 추가 (마이그레이션)

**migrations/add_oauth_columns.sql**:
```sql
-- 주의: SQLite는 ALTER TABLE ADD COLUMN만 지원
-- 새 컬럼 추가
ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN picture TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local';

-- 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
  ON users(google_id)
  WHERE google_id IS NOT NULL;
```

### password NOT NULL → NULL 허용 변경 (마이그레이션)

**migrations/make_password_nullable.sql**:
```sql
-- SQLite는 ALTER COLUMN을 지원하지 않아 테이블 재생성 필요

-- 1. 새 테이블 생성
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password TEXT,  -- NULL 허용으로 변경
  google_id TEXT,
  email TEXT,
  picture TEXT,
  auth_provider TEXT DEFAULT 'local',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 데이터 복사
INSERT INTO users_new (id, username, password, google_id, email, picture, auth_provider, created_at)
SELECT id, username, password, google_id, email, picture,
       COALESCE(auth_provider, 'local'), created_at
FROM users;

-- 3. 기존 테이블 삭제
DROP TABLE users;

-- 4. 이름 변경
ALTER TABLE users_new RENAME TO users;

-- 5. 인덱스 재생성
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
  ON users(google_id)
  WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

---

## 환경 변수 설정

### 로컬 개발

**.env.local** (프론트엔드용, gitignore에 포함):
```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### 사용법

```typescript
// src/App.tsx 또는 다른 컴포넌트
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
```

### 프로덕션

환경 변수는 빌드 시점에 번들에 포함되므로:

**방법 1**: GitHub Actions에서 빌드 시 주입
```yaml
# .github/workflows/deploy.yml
- name: Build project
  run: npm run build
  env:
    VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}
```

**방법 2**: 코드에 직접 기본값 설정 (권장)
```typescript
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  'your-production-client-id.apps.googleusercontent.com';
```

---

## 전체 인증 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자                                    │
│                           │                                       │
│                    [Google 로그인 클릭]                           │
│                           ↓                                       │
├─────────────────────────────────────────────────────────────────┤
│                    프론트엔드 (React)                             │
│                           │                                       │
│  1. useGoogleLogin() → Google OAuth 팝업 열림                    │
│  2. 사용자가 Google 계정 선택                                    │
│  3. access_token 수신                                            │
│  4. Google API에서 userinfo 조회                                 │
│  5. credential = btoa(JSON.stringify(userinfo))                  │
│  6. POST /api/auth/google { credential }                         │
│                           ↓                                       │
├─────────────────────────────────────────────────────────────────┤
│               백엔드 (Cloudflare Functions)                       │
│                           │                                       │
│  1. credential 디코딩                                            │
│  2. google_id로 사용자 조회                                      │
│  3-a. 기존 사용자 → 프로필 업데이트                              │
│  3-b. 신규 사용자 → INSERT INTO users                            │
│  4. 사용자 정보 반환                                             │
│                           ↓                                       │
├─────────────────────────────────────────────────────────────────┤
│                    프론트엔드 (React)                             │
│                           │                                       │
│  1. setCurrentUser(user) - Zustand 상태 저장                     │
│  2. localStorage에 user_id 저장                                  │
│  3. 성공 콜백 / 페이지 리디렉션                                  │
│                           ↓                                       │
├─────────────────────────────────────────────────────────────────┤
│                       로그인 완료!                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 트러블슈팅

### 1. "D1_ERROR: NOT NULL constraint failed: users.password"

**원인**: OAuth 사용자는 비밀번호가 없는데 `password` 컬럼이 NOT NULL

**해결**: 마이그레이션 실행하여 password를 NULL 허용으로 변경
```bash
npx wrangler d1 execute my-app-db --file=./migrations/make_password_nullable.sql
```

### 2. "popup_closed_by_user" 에러

**원인**: 사용자가 Google 로그인 팝업을 닫음

**해결**: `onError` 콜백에서 적절한 에러 메시지 표시
```typescript
onError: () => {
  // 사용자에게 알림 (선택사항)
  console.log('로그인이 취소되었습니다.');
}
```

### 3. "redirect_uri_mismatch" 에러

**원인**: Google Console에 등록되지 않은 도메인에서 로그인 시도

**해결**: Google Cloud Console → OAuth 클라이언트 → "승인된 JavaScript 원본"에 도메인 추가
```
http://localhost:5173
http://localhost:8788
https://your-app.pages.dev
```

### 4. CORS 에러

**원인**: 백엔드 API에서 CORS 헤더 누락

**해결**: `functions/api/auth/google.ts`에 CORS 헤더 추가
```typescript
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
```

### 5. 로컬 개발에서 Google 로그인 작동 안 함

**확인사항**:
1. Google Cloud Console에 `http://localhost:5173` 등록 확인
2. OAuth 동의 화면 설정 완료 확인
3. 테스트 모드인 경우 테스트 사용자 추가 확인

---

## 환경 변수 요약

| 변수 | 위치 | 용도 |
|------|------|------|
| `VITE_GOOGLE_CLIENT_ID` | .env.local, GitHub Secrets | Google OAuth 클라이언트 ID |

---

## 체크리스트

- [ ] Google Cloud Console 프로젝트 생성
- [ ] OAuth 동의 화면 설정
- [ ] OAuth 클라이언트 ID 생성
- [ ] 승인된 JavaScript 원본 추가 (localhost, production URL)
- [ ] `@react-oauth/google` 패키지 설치
- [ ] `GoogleOAuthProvider` 설정 (App.tsx)
- [ ] `GoogleLoginButton` 컴포넌트 생성
- [ ] `/api/auth/google` 백엔드 API 구현
- [ ] 데이터베이스 스키마 업데이트 (OAuth 컬럼 추가)
- [ ] password 컬럼 NULL 허용으로 변경 (마이그레이션)
- [ ] Zustand 상태 관리 설정
- [ ] 로컬 테스트
- [ ] 프로덕션 배포 및 테스트

---

**작성일**: 2025-11-22
**버전**: 1.0
**패키지**: @react-oauth/google
