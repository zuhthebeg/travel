# AI Assistant 구현 가이드 (Gemini + STT)

Google Gemini API를 활용한 AI 챗봇 어시스턴트 구현의 핵심 포인트를 정리한 가이드입니다.

## 목차
1. [Gemini API 연동](#gemini-api-연동)
2. [Function Calling](#function-calling)
3. [STT 연동 (음성 입력)](#stt-연동)
4. [대화 컨텍스트 관리](#대화-컨텍스트-관리)
5. [보안](#보안)

---

## Gemini API 연동

### 1. API 키 발급
- https://aistudio.google.com → "Get API Key" → 새 키 생성
- 환경 변수에 저장 (서버 측에서만 사용)

### 2. 기본 API 호출

```javascript
async function callGemini(messages, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages,  // [{ role: 'user', parts: [{ text: '질문' }] }]
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000
      }
    })
  });

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
```

### 3. System Prompt로 컨텍스트 주입

```javascript
// AI에게 역할과 사용자 정보 제공
const systemPrompt = `당신은 친절한 고객 지원 AI입니다.
현재 사용자: 홍길동님 (회원등급: VIP)
사용 가능 포인트: 5,000원`;

const messages = [
  { role: 'user', parts: [{ text: systemPrompt }] },
  { role: 'user', parts: [{ text: '안녕하세요' }] }
];
```

**핵심:**
- 첫 메시지에 시스템 프롬프트를 넣어 AI 역할/맥락 설정
- 사용자 정보, DB 데이터, 비즈니스 규칙 등 실시간 주입

---

## Function Calling

AI가 특정 작업(DB 조작, API 호출 등)을 직접 수행하도록 허용합니다.

### 1. Function Declaration 정의

```javascript
const tools = [{
  function_declarations: [
    {
      name: 'search_products',
      description: '제품을 검색합니다. 사용자가 "상품 찾아줘" 같은 요청을 하면 호출',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '검색 키워드' },
          category: { type: 'string', description: '카테고리 (선택)' }
        },
        required: ['keyword']
      }
    }
  ]
}];

// API 호출 시 tools 추가
const requestBody = {
  contents: messages,
  tools: tools  // 여기에 추가
};
```

### 2. Function Call 감지 및 실행

```javascript
const data = await response.json();
const candidate = data.candidates[0];

// Function Call인지 확인
if (candidate?.content?.parts?.[0]?.functionCall) {
  const functionCall = candidate.content.parts[0].functionCall;
  const { name, args } = functionCall;

  // 함수 실행
  if (name === 'search_products') {
    const products = await searchProductsInDB(args.keyword, args.category);
    return `검색 결과: ${products.length}개 상품을 찾았습니다.`;
  }
}

// 일반 텍스트 응답
return candidate.content.parts[0].text;
```

**핵심:**
- `description`을 명확히 작성해야 AI가 올바른 타이밍에 호출
- Function 실행 후 결과를 사용자에게 자연스럽게 전달
- 권한 검증 필수 (사용자가 해당 작업을 할 권한이 있는지 확인)

---

## STT 연동 (음성 입력)

Web Speech API를 사용한 음성 → 텍스트 변환 (브라우저 기본 기능)

### 구현 코드

```javascript
let recognition;

function initSTT() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('STT 지원 안 됨');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';  // 한국어
  recognition.continuous = false;  // 한 문장만
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    document.getElementById('input').value = text;  // 입력창에 자동 입력
  };

  recognition.onerror = (e) => console.error('STT 오류:', e.error);
}

function startSTT() {
  recognition.start();
}
```

### HTML

```html
<button onclick="startSTT()">🎤</button>
<input type="text" id="input" placeholder="메시지 입력">
```

**핵심:**
- Chrome, Edge, Safari (iOS 14.5+) 지원
- `lang` 설정으로 언어 변경 ('en-US', 'ja-JP' 등)
- 마이크 권한 필요 (첫 실행 시 브라우저가 자동 요청)

---

## 대화 컨텍스트 관리

### 1. 대화 이력 저장 (DB)

```sql
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  role TEXT,  -- 'user' or 'model'
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. 이력 불러오기 및 전송

```javascript
// 최근 10개 메시지 조회
const history = await db.query(`
  SELECT role, content FROM chat_messages
  WHERE session_id = ?
  ORDER BY created_at DESC LIMIT 10
`, [sessionId]);

// Gemini 메시지 형식으로 변환
const messages = [
  { role: 'user', parts: [{ text: systemPrompt }] },
  ...history.reverse().map(m => ({
    role: m.role,
    parts: [{ text: m.content }]
  })),
  { role: 'user', parts: [{ text: newMessage }] }
];
```

### 3. 세션 ID 관리

```javascript
// 브라우저에서 UUID 생성
function generateSessionId() {
  return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

let sessionId = sessionStorage.getItem('chatSession') || generateSessionId();
sessionStorage.setItem('chatSession', sessionId);
```

**핵심:**
- 세션별로 대화 이력 분리
- 토큰 절약을 위해 최근 N개만 전송 (10~20개 권장)
- sessionStorage 사용 → 탭 닫으면 새 세션 시작

---

## 보안

### 1. API 키 보호

```javascript
// ❌ 절대 금지: 프론트엔드에 API 키 노출
const apiKey = "AIzaSy...";

// ✅ 올바른 방법: 백엔드에서만 사용
// 환경 변수로 저장 (.env, Cloudflare 환경 변수 등)
```

### 2. 사용자 인증 확인

```javascript
// 백엔드 API에서 세션 검증
export async function onRequestPost(context) {
  const user = await authenticateUser(context.request);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 사용자가 해당 세션에 접근 권한이 있는지 확인
  const { sessionId } = await context.request.json();
  const session = await db.query('SELECT user_id FROM chat_sessions WHERE session_id = ?', [sessionId]);

  if (session.user_id !== user.id) {
    return new Response('Forbidden', { status: 403 });
  }

  // ... 나머지 로직
}
```

### 3. 입력 검증

```javascript
function sanitizeInput(input) {
  // XSS 방지: HTML 태그 제거
  return input.replace(/<[^>]*>/g, '');
}

const userMessage = sanitizeInput(rawInput);
```

### 4. Rate Limiting

```javascript
// 간단한 예시 (실전에서는 Redis, KV 등 사용)
const rateLimits = new Map();

function checkRateLimit(userId) {
  const count = rateLimits.get(userId) || 0;
  if (count >= 10) return false;  // 1분에 10회 제한

  rateLimits.set(userId, count + 1);
  setTimeout(() => rateLimits.delete(userId), 60000);
  return true;
}
```

---

## 프론트엔드 UI 예제

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>AI 챗봇</title>
</head>
<body>
  <div id="chat"></div>
  <button onclick="startSTT()">🎤</button>
  <input type="text" id="input">
  <button onclick="send()">전송</button>

  <script>
    let sessionId = sessionStorage.getItem('chatSession') || generateSessionId();

    async function send() {
      const message = document.getElementById('input').value;
      addMessage('user', message);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId })
      });

      const { reply } = await res.json();
      addMessage('ai', reply);
    }

    function addMessage(role, text) {
      const div = document.createElement('div');
      div.textContent = `${role === 'user' ? '나' : 'AI'}: ${text}`;
      document.getElementById('chat').appendChild(div);
    }

    function generateSessionId() {
      return 'xxxx-xxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16));
    }
  </script>
</body>
</html>
```

---

## 참고 자료

- [Gemini API 공식 문서](https://ai.google.dev/docs)
- [Function Calling 가이드](https://ai.google.dev/docs/function_calling)
- [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)

---

## 체크리스트

- [ ] Gemini API 키 발급 및 환경 변수 설정
- [ ] 백엔드 API 엔드포인트 구현
- [ ] System Prompt에 동적 데이터 주입
- [ ] Function Calling 도구 정의 (필요 시)
- [ ] STT 기능 추가 (선택)
- [ ] 대화 이력 DB 저장/조회
- [ ] 세션 관리 구현
- [ ] 사용자 인증 및 권한 검증
- [ ] Rate Limiting 구현
- [ ] 프로덕션 배포
