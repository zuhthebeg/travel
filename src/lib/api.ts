import type { Plan, Schedule } from '../store/types';

// API 베이스 URL (개발/프로덕션 환경에 따라 자동 설정)
const API_BASE_URL = import.meta.env.DEV ? 'http://127.0.0.1:9999' : '';

// API 요청 헬퍼
async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Plans API
export const plansAPI = {
  // 여행 목록 조회
  getAll: async (params?: { user_id?: number; is_public?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.user_id) searchParams.append('user_id', params.user_id.toString());
    if (params?.is_public !== undefined)
      searchParams.append('is_public', params.is_public ? '1' : '0');

    const query = searchParams.toString();
    const result = await apiRequest<{ plans: Plan[] }>(
      `/api/plans${query ? `?${query}` : ''}`
    );
    return result.plans;
  },

  // 특정 여행 조회 (일정 포함)
  getById: async (id: number) => {
    return apiRequest<{ plan: Plan; schedules: Schedule[] }>(`/api/plans/${id}`);
  },

  // 여행 생성
  create: async (data: {
    user_id: number;
    title: string;
    region?: string;
    start_date: string;
    end_date: string;
    thumbnail?: string;
    is_public?: boolean;
  }) => {
    const result = await apiRequest<{ plan: Plan }>('/api/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result.plan;
  },

  // 여행 수정
  update: async (
    id: number,
    data: {
      title?: string;
      region?: string;
      start_date?: string;
      end_date?: string;
      thumbnail?: string;
      is_public?: boolean;
    }
  ) => {
    const result = await apiRequest<{ plan: Plan }>(`/api/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return result.plan;
  },

  // 여행 삭제
  delete: async (id: number) => {
    return apiRequest<{ message: string }>(`/api/plans/${id}`, {
      method: 'DELETE',
    });
  },
};

// Schedules API
export const schedulesAPI = {
  // 일정 목록 조회
  getByPlanId: async (planId: number) => {
    const result = await apiRequest<{ schedules: Schedule[] }>(
      `/api/schedules?plan_id=${planId}`
    );
    return result.schedules;
  },

  // 특정 일정 조회
  getById: async (id: number) => {
    const result = await apiRequest<{ schedule: Schedule }>(`/api/schedules/${id}`);
    return result.schedule;
  },

  // 일정 생성
  create: async (data: {
    plan_id: number;
    date: string;
    time?: string;
    title: string; // Simplified
    place?: string | null; // Simplified
    memo?: string;
    plan_b?: string;
    plan_c?: string;
    order_index?: number;
  }) => {
    const result = await apiRequest<{ schedule: Schedule }>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result.schedule;
  },

  // 일정 수정
  update: async (
    id: number,
    data: {
      date?: string;
      time?: string;
      title?: string; // Simplified
      place?: string | null; // Simplified
      memo?: string;
      plan_b?: string;
      plan_c?: string;
      order_index?: number;
      rating?: number;
      review?: string;
    }
  ) => {
    const result = await apiRequest<{ schedule: Schedule }>(`/api/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return result.schedule;
  },

  // 일정 삭제
  delete: async (id: number) => {
    return apiRequest<{ message: string }>(`/api/schedules/${id}`, {
      method: 'DELETE',
    });
  },
};
