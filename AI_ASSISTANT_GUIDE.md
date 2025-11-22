# AI Assistant 구현 가이드 (Gemini 2.5 Flash + STT + TTS)

> **목적**: Google Gemini API를 활용한 AI 챗봇 어시스턴트 구현 가이드 (Cloudflare Pages Functions 백엔드)

## 목차

1. [환경 설정](#환경-설정)
2. [백엔드 API 구현](#백엔드-api-구현)
3. [프론트엔드 채팅 UI](#프론트엔드-채팅-ui)
4. [STT 연동 (음성 → 텍스트)](#stt-연동-음성--텍스트)
5. [TTS 연동 (텍스트 → 음성)](#tts-연동-텍스트--음성)
6. [다국어 지원](#다국어-지원)
7. [시스템 프롬프트 설계](#시스템-프롬프트-설계)
8. [보안 및 Rate Limiting](#보안-및-rate-limiting)

---

## 환경 설정

### 1. Gemini API 키 발급

1. https://aistudio.google.com 접속
2. "Get API Key" → "Create API key" 클릭
3. 새 API 키 생성 및 복사

### 2. 환경 변수 설정

**로컬 개발 (.dev.vars)**:
```bash
GEMINI_API_KEY=your-gemini-api-key-here
```

**프로덕션 (Cloudflare Dashboard)**:
1. Cloudflare Dashboard → Workers & Pages → 프로젝트 선택
2. Settings → Environment Variables
3. `GEMINI_API_KEY` 추가

---

## 백엔드 API 구현

### 1. 공통 Gemini API 호출 유틸리티

**functions/api/assistant/_common.ts**:
```typescript
interface Env {
  GEMINI_API_KEY: string;
}

export async function callGemini(
  apiKey: string,
  contents: any[],
  generationConfig: any
) {
  // 모델 폴백: Gemini 2.5 Flash → Gemini 1.5 Pro
  const models = ['gemini-2.5-flash', 'gemini-1.5-pro-latest'];
  let lastError: any = null;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      }

      // 503 오류 (서버 과부하)일 경우 다음 모델 시도
      if (response.status === 503) {
        console.warn(`Model ${model} is overloaded, trying next model...`);
        lastError = new Error(`Gemini API request failed with status ${response.status}`);
        continue;
      }

      const errorText = await response.text();
      console.error(`Gemini API error with model ${model}:`, errorText);
      lastError = new Error(`Gemini API request failed with status ${response.status}`);
      break;

    } catch (error) {
      console.error(`Failed to call Gemini API with model ${model}:`, error);
      lastError = error;
    }
  }

  console.error('All Gemini models failed:', lastError);
  throw new Error('Failed to get response from AI assistant');
}
```

### 2. 채팅 API 엔드포인트

**functions/api/assistant.ts**:
```typescript
import { callGemini } from './assistant/_common';

interface Env {
  GEMINI_API_KEY: string;
}

// CORS preflight 처리
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

// POST /api/assistant
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const {
    message,
    history,
    systemPrompt,
    // 선택적 컨텍스트 데이터
    planTitle,
    planRegion,
    schedules,
  } = await context.request.json<{
    message: string;
    history: any[];
    systemPrompt?: string;
    planTitle?: string;
    planRegion?: string;
    schedules?: any[];
  }>();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    return new Response(JSON.stringify({ reply: 'AI Assistant is not configured.' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 시스템 프롬프트 (프론트엔드에서 전달받거나 기본값 사용)
  const defaultSystemPrompt = `당신은 친절하고 도움이 되는 AI 어시스턴트입니다.
사용자의 질문에 간결하고 명확하게 답변해주세요.
모든 응답은 한국어로 해주세요.`;

  const systemPromptToUse = systemPrompt || defaultSystemPrompt;

  // 대화 이력 변환 (assistant → model)
  const convertedHistory = history.map((msg: any) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: msg.parts,
  }));

  // Gemini API 요청 메시지 구성
  const contents = [
    {
      role: 'user',
      parts: [{ text: systemPromptToUse }],
    },
    ...convertedHistory,
    {
      role: 'user',
      parts: [{ text: message }],
    },
  ];

  try {
    const reply = await callGemini(apiKey, contents, {
      temperature: 0.7,
      maxOutputTokens: 1000,
    });

    return new Response(JSON.stringify({ reply }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Failed to call Gemini API:', error);
    return new Response(JSON.stringify({ error: 'Failed to get response from AI assistant' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
```

---

## 프론트엔드 채팅 UI

### 채팅 페이지 컴포넌트 (React)

**src/pages/AssistantPage.tsx**:
```typescript
import { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user' as const, content: input };
    const newMessages: Message[] = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // 대화 이력을 Gemini 형식으로 변환
      const history = newMessages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          history,
          // 선택적: 컨텍스트 데이터 전달
          // systemPrompt: '커스텀 시스템 프롬프트',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const { reply } = await response.json();
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages([...newMessages, { role: 'assistant', content: '죄송합니다. 오류가 발생했습니다.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* 채팅 영역 */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}
            >
              <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-primary' : ''}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="chat chat-start">
              <div className="chat-bubble">생각 중...</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* 입력 영역 */}
      <footer className="p-4 bg-base-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="메시지를 입력하세요..."
            className="input input-bordered flex-1"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading}
            className="btn btn-primary"
          >
            전송
          </button>
        </div>
      </footer>
    </div>
  );
}
```

---

## STT 연동 (음성 → 텍스트)

### Web Speech API 커스텀 훅

**src/hooks/useSpeechRecognition.ts**:
```typescript
import { useState, useEffect, useRef } from 'react';

interface SpeechRecognitionHook {
  transcript: string;
  isListening: boolean;
  error: string;
  startListening: () => void;
  stopListening: () => void;
  browserSupportsSpeechRecognition: boolean;
  setLanguage: (lang: string) => void;
}

const useSpeechRecognition = (initialLang: string = 'ko-KR'): SpeechRecognitionHook => {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState(initialLang);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition ||
                              (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech Recognition API is not supported by this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;      // 단일 발화
    recognition.interimResults = true;   // 중간 결과 표시
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setError('');
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart;
        } else {
          interimTranscript += transcriptPart;
        }
      }
      setTranscript(finalTranscript || interimTranscript);
    };

    recognition.onerror = (event: any) => {
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language]);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  return {
    transcript,
    isListening,
    error,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition: !!recognitionRef.current,
    setLanguage,
  };
};

export default useSpeechRecognition;
```

### 채팅 페이지에서 STT 사용

```typescript
import useSpeechRecognition from '../hooks/useSpeechRecognition';

function ChatWithSTT() {
  const [input, setInput] = useState('');
  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition('ko-KR');

  // 음성 인식 결과를 입력창에 반영
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="input input-bordered flex-1"
      />
      {browserSupportsSpeechRecognition && (
        <button
          onClick={isListening ? stopListening : startListening}
          className={`btn ${isListening ? 'btn-error' : 'btn-secondary'}`}
        >
          {isListening ? '🔴 듣는 중' : '🎤 음성'}
        </button>
      )}
      <button className="btn btn-primary">전송</button>
    </div>
  );
}
```

**지원 브라우저**: Chrome, Edge, Safari (iOS 14.5+)

---

## TTS 연동 (텍스트 → 음성)

### Web Speech Synthesis API 사용

```typescript
function speakText(text: string, lang: string = 'ko-KR') {
  if (!('speechSynthesis' in window)) {
    console.warn('TTS not supported');
    return;
  }

  // 이전 음성 중단
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1.0;   // 속도 (0.1 ~ 10)
  utterance.pitch = 1.0;  // 음높이 (0 ~ 2)
  utterance.volume = 1.0; // 볼륨 (0 ~ 1)

  // 언어에 맞는 음성 선택 (선택사항)
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

// 사용 예시: AI 응답 읽기
const handleAssistantReply = (reply: string) => {
  setMessages([...messages, { role: 'assistant', content: reply }]);

  // TTS로 응답 읽기
  if (isTTSEnabled) {
    speakText(reply, 'ko-KR');
  }
};
```

---

## 다국어 지원

### 언어별 설정

```typescript
const SUPPORTED_LANGUAGES = {
  'ko-KR': {
    name: '한국어',
    sttLang: 'ko-KR',
    ttsLang: 'ko-KR',
    systemPromptLang: '모든 응답은 한국어로 해주세요.',
  },
  'en-US': {
    name: 'English',
    sttLang: 'en-US',
    ttsLang: 'en-US',
    systemPromptLang: 'Please respond in English.',
  },
  'ja-JP': {
    name: '日本語',
    sttLang: 'ja-JP',
    ttsLang: 'ja-JP',
    systemPromptLang: '日本語で回答してください。',
  },
};

// 언어 변경 시 STT, TTS, AI 프롬프트 동시 변경
const handleLanguageChange = (langCode: string) => {
  const langConfig = SUPPORTED_LANGUAGES[langCode];

  // STT 언어 변경
  setLanguage(langConfig.sttLang);

  // TTS 언어 저장
  setTTSLanguage(langConfig.ttsLang);

  // 시스템 프롬프트 언어 설정
  setSystemPromptLanguage(langConfig.systemPromptLang);
};
```

---

## 시스템 프롬프트 설계

### 동적 컨텍스트 주입

```typescript
// 프론트엔드에서 시스템 프롬프트 구성
function buildSystemPrompt(context: {
  planTitle?: string;
  planRegion?: string;
  schedules?: Schedule[];
  language?: string;
}) {
  const { planTitle, planRegion, schedules, language = 'ko-KR' } = context;

  const langInstruction = SUPPORTED_LANGUAGES[language]?.systemPromptLang ||
                          '모든 응답은 한국어로 해주세요.';

  let prompt = `당신은 친절하고 전문적인 여행 어시스턴트입니다.
${langInstruction}

사용자의 여행 계획을 도와주세요. 간결하고 실용적인 조언을 제공해주세요.`;

  // 여행 계획 컨텍스트 추가
  if (planTitle) {
    prompt += `\n\n현재 여행 계획: "${planTitle}"`;
    if (planRegion) {
      prompt += ` (${planRegion})`;
    }
  }

  // 일정 정보 추가
  if (schedules && schedules.length > 0) {
    prompt += `\n\n현재 일정:`;
    schedules.forEach(s => {
      prompt += `\n- ${s.date} ${s.time || ''}: ${s.title}`;
      if (s.place) prompt += ` @ ${s.place}`;
    });
  }

  return prompt;
}

// API 호출 시 사용
const systemPrompt = buildSystemPrompt({
  planTitle: plan.title,
  planRegion: plan.region,
  schedules: schedules,
  language: currentLanguage,
});

fetch('/api/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: input,
    history,
    systemPrompt,
  }),
});
```

---

## 보안 및 Rate Limiting

### 1. API 키 보호

```typescript
// ❌ 절대 금지: 프론트엔드에 API 키 노출
const apiKey = "AIzaSy...";  // 절대 이렇게 하지 마세요!

// ✅ 올바른 방법: 백엔드 환경 변수
// .dev.vars 또는 Cloudflare Dashboard에서 설정
const apiKey = context.env.GEMINI_API_KEY;
```

### 2. 입력 검증

```typescript
// 백엔드에서 입력 검증
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { message, history } = await context.request.json();

  // 메시지 필수 확인
  if (!message || typeof message !== 'string') {
    return errorResponse('Message is required', 400);
  }

  // 메시지 길이 제한
  if (message.length > 5000) {
    return errorResponse('Message too long', 400);
  }

  // 히스토리 길이 제한 (토큰 절약)
  const limitedHistory = (history || []).slice(-20);

  // ... API 호출
};
```

### 3. Rate Limiting (간단 구현)

```typescript
// Cloudflare KV 또는 메모리 기반 Rate Limiting
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, limit = 30, windowMs = 60000): boolean {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (userLimit.count >= limit) {
    return false; // Rate limit exceeded
  }

  userLimit.count++;
  return true;
}

// API에서 사용
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const userId = getUserId(context); // 세션 또는 IP 기반

  if (!checkRateLimit(userId)) {
    return errorResponse('Too many requests. Please wait a moment.', 429);
  }

  // ... 정상 처리
};
```

---

## 환경 변수 요약

| 변수 | 위치 | 용도 |
|------|------|------|
| `GEMINI_API_KEY` | .dev.vars, Dashboard | Gemini API 인증 키 |

---

## 체크리스트

- [ ] Gemini API 키 발급 완료
- [ ] `.dev.vars`에 API 키 설정 (로컬)
- [ ] Cloudflare Dashboard에 API 키 설정 (프로덕션)
- [ ] `functions/api/assistant/_common.ts` 생성
- [ ] `functions/api/assistant.ts` 생성
- [ ] 프론트엔드 채팅 UI 구현
- [ ] STT 훅 구현 (선택)
- [ ] TTS 기능 추가 (선택)
- [ ] 다국어 지원 (선택)
- [ ] Rate Limiting 구현
- [ ] 배포 및 테스트

---

**작성일**: 2025-11-22
**버전**: 2.0
**모델**: Gemini 2.5 Flash (폴백: Gemini 1.5 Pro)
