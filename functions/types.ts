// Cloudflare Functions 타입 정의

export interface Env {
  DB: D1Database;
  CACHE?: KVNamespace;
  GEMINI_API_KEY?: string;
}

// 데이터베이스 모델 타입
export interface User {
  id: number;
  username: string;
  password: string;
  created_at: string;
}

export interface Plan {
  id: number;
  user_id: number;
  title: string;
  region: string | null;
  start_date: string;
  end_date: string;
  thumbnail: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: number;
  plan_id: number;
  date: string;
  time: string | null;
  title: string; // Simplified to single language
  place: string | null; // Simplified to single language
  memo: string | null;
  plan_b: string | null;
  plan_c: string | null;
  order_index: number;
  rating: number | null; // 1-5 stars, null if not rated yet
  review: string | null; // Text review, null if not reviewed yet
  created_at: string;
}

export interface Recommendation {
  id: number;
  plan_id: number;
  count: number;
}

export interface Conversation {
  id: number;
  plan_id: number;
  user_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface Comment {
  id: number;
  schedule_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

// API 요청/응답 타입
export interface CreatePlanRequest {
  user_id: number;
  title: string;
  region?: string;
  start_date: string;
  end_date: string;
  thumbnail?: string;
  is_public?: boolean;
}

export interface UpdatePlanRequest {
  title?: string;
  region?: string;
  start_date?: string;
  end_date?: string;
  thumbnail?: string;
  is_public?: boolean;
}

export interface CreateScheduleRequest {
  plan_id: number;
  date: string;
  time?: string;
  title: string; // Simplified to single language
  place?: string | null; // Simplified to single language
  memo?: string;
  plan_b?: string;
  plan_c?: string;
  order_index?: number;
}

export interface UpdateScheduleRequest {
  date?: string;
  time?: string;
  title?: string; // Simplified to single language
  place?: string | null; // Simplified to single language
  memo?: string;
  plan_b?: string;
  plan_c?: string;
  order_index?: number;
  rating?: number;
  review?: string;
}

export interface CreateCommentRequest {
  schedule_id: number;
  author_name?: string; // Optional, defaults to '익명'
  content: string;
}

// API 응답 헬퍼
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
