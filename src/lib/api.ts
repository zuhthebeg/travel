import type { Plan, Schedule, Review, ReviewStats, User, Moment, PlanMembersResponse, PlanMember } from '../store/types';

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
    if (response.status === 409 && error.conflict) {
      const conflictErr = new Error('CONFLICT');
      (conflictErr as any).status = 409;
      (conflictErr as any).serverVersion = error.serverVersion;
      throw conflictErr;
    }
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  // 204 No Content 등 빈 응답 처리
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json();
}

// Plans API
export const plansAPI = {
  // 여행 목록 조회
  getAll: async (params?: { user_id?: number; is_public?: boolean; mine?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.user_id) searchParams.append('user_id', params.user_id.toString());
    if (params?.is_public !== undefined)
      searchParams.append('is_public', params.is_public ? '1' : '0');
    if (params?.mine) searchParams.append('mine', '1');

    const query = searchParams.toString();
    let headers: Record<string, string> = {};
    try { headers = getAuthHeaders(); } catch {}
    const result = await apiRequest<{ plans: Plan[] }>(
      `/api/plans${query ? `?${query}` : ''}`,
      { headers }
    );
    return result.plans;
  },

  // 특정 여행 조회 (일정 포함)
  getById: async (id: number) => {
    let headers: Record<string, string> = {};
    try { headers = getAuthHeaders(); } catch {}
    return apiRequest<{ plan: Plan; schedules: Schedule[] }>(`/api/plans/${id}`, { headers });
  },

  // 여행 생성
  create: async (data: {
    title: string;
    region?: string;
    start_date: string;
    end_date: string;
    thumbnail?: string;
    visibility?: 'public' | 'shared' | 'private';
  }) => {
    let headers: Record<string, string> = {};
    try { headers = getAuthHeaders(); } catch {}
    const result = await apiRequest<{ plan: Plan }>('/api/plans', {
      method: 'POST',
      headers,
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
      visibility?: 'public' | 'shared' | 'private';
    },
    options?: { baseUpdatedAt?: string },
  ) => {
    const headers: Record<string, string> = {};
    if (options?.baseUpdatedAt) headers['X-Base-Updated-At'] = options.baseUpdatedAt;
    const result = await apiRequest<{ plan: Plan }>(`/api/plans/${id}`, {
      method: 'PUT',
      headers,
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
    place_en?: string | null;
    memo?: string;
    plan_b?: string;
    plan_c?: string;
    order_index?: number;
    latitude?: number;
    longitude?: number;
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
      place_en?: string | null;
      memo?: string;
      plan_b?: string;
      plan_c?: string;
      order_index?: number;
      rating?: number;
      review?: string;
      latitude?: number;
      longitude?: number;
      country_code?: string;
    },
    options?: { baseUpdatedAt?: string },
  ) => {
    const headers: Record<string, string> = {};
    if (options?.baseUpdatedAt) headers['X-Base-Updated-At'] = options.baseUpdatedAt;
    const result = await apiRequest<{ schedule: Schedule }>(`/api/schedules/${id}`, {
      method: 'PUT',
      headers,
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

  // 텍스트로 일정 생성 (AI 파싱)
  fromText: async (data: {
    text: string;
    planId: number;
    userLang: string;
    destLang: string;
    planTitle: string;
    planRegion: string;
    planStartDate: string;
    planEndDate: string;
    userLocation?: { lat: number; lng: number; city?: string };
  }) => {
    const result = await apiRequest<Schedule>('/api/schedules/from-text', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result;
  },
};

// Reviews API
export const reviewsAPI = {
  // 리뷰 목록 조회 (평균 평점 포함)
  getByScheduleId: async (scheduleId: number) => {
    const result = await apiRequest<{ reviews: Review[]; stats: ReviewStats }>(
      `/api/schedules/${scheduleId}/reviews`
    );
    return result;
  },

  // 리뷰 생성
  create: async (data: {
    scheduleId: number;
    author_name?: string;
    rating: number;
    review_text?: string;
    image_data: string;
  }) => {
    const result = await apiRequest<{ review: Review }>(
      `/api/schedules/${data.scheduleId}/reviews`,
      {
        method: 'POST',
        body: JSON.stringify({
          schedule_id: data.scheduleId,
          author_name: data.author_name,
          rating: data.rating,
          review_text: data.review_text,
          image_data: data.image_data,
        }),
      }
    );
    return result.review;
  },

  // 리뷰 삭제
  delete: async (id: number) => {
    return apiRequest<void>(`/api/reviews/${id}`, {
      method: 'DELETE',
    });
  },
};

// 내부 인증 헤더 생성기
function getAuthHeaders(): Record<string, string> {
  const credential =
    localStorage.getItem('X-Auth-Credential') ||
    localStorage.getItem('x-auth-credential') ||
    localStorage.getItem('authCredential') ||
    localStorage.getItem('auth_credential') ||
    localStorage.getItem('temp_auth_credential') ||
    localStorage.getItem('google_credential');

  if (!credential) {
    throw new Error('인증 정보가 없습니다. 로그인 후 이용해주세요.');
  }

  return {
    'X-Auth-Credential': credential,
  };
}

// Auth API
export const authAPI = {
  // Google 로그인
  googleLogin: async (credential: string) => {
    const result = await apiRequest<{ user: User }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
    return result.user;
  },

  // 게스트 로그인
  guestLogin: async (nickname: string) => {
    const result = await apiRequest<{ user: User; credential: string }>('/api/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    });
    return result;
  },
};

// Moments API
export const momentsAPI = {
  // 일정별 순간 기록 조회
  getByScheduleId: async (scheduleId: number): Promise<{ moments: Moment[]; count: number }> => {
    return apiRequest<{ moments: Moment[]; count: number }>(
      `/api/schedules/${scheduleId}/moments`,
      {
        headers: getAuthHeaders(),
      }
    );
  },

  // 순간 기록 생성
  create: async (
    scheduleId: number,
    data: { photo_data?: string; note?: string; mood?: string; revisit?: string }
  ): Promise<{ moment: Moment }> => {
    return apiRequest<{ moment: Moment }>(`/api/schedules/${scheduleId}/moments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
  },

  // 순간 기록 수정
  update: async (
    momentId: number,
    data: Partial<{ photo_data: string; note: string; mood: string; revisit: string }>,
    options?: { baseUpdatedAt?: string },
  ): Promise<{ moment: Moment }> => {
    const headers: Record<string, string> = { ...getAuthHeaders() };
    if (options?.baseUpdatedAt) headers['X-Base-Updated-At'] = options.baseUpdatedAt;
    return apiRequest<{ moment: Moment }>(`/api/moments/${momentId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
  },

  // 순간 기록 삭제
  delete: async (momentId: number): Promise<void> => {
    return apiRequest<void>(`/api/moments/${momentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
  },
};

// Members API
export const assistantAPI = {
  classifyPhotos: async (data: {
    planId: number;
    photos: Array<{ tempId: string; fileName: string; datetime?: string | null; lat?: number | null; lng?: number | null }>;
  }) => {
    return apiRequest<{ assignments: Array<{ tempId: string; scheduleIds: number[]; confidence: number; reason: string }>; planBUpdates?: Array<{ scheduleId: number; note: string }> }>(
      '/api/assistant/classify-photos',
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      },
    );
  },
};

export const membersAPI = {
  // 플랜 멤버 목록
  getByPlanId: async (planId: number): Promise<PlanMembersResponse> => {
    return apiRequest<PlanMembersResponse>(`/api/plans/${planId}/members`, {
      headers: getAuthHeaders(),
    });
  },

  // 멤버 초대
  invite: async (planId: number, email: string): Promise<{ member: PlanMember }> => {
    const result = await apiRequest<{ member: PlanMember }>(`/api/plans/${planId}/members`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email }),
    });
    return result;
  },

  // 멤버 제거
  remove: async (planId: number, userId: number): Promise<void> => {
    return apiRequest<void>(`/api/plans/${planId}/members/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
  },
};

// Fork API
export const forkAPI = {
  // 플랜 복사(내 앨범으로 가져가기)
  fork: async (
    planId: number
  ): Promise<{ plan: any; schedules_copied: number; forked_from: number }> => {
    return apiRequest<{ plan: any; schedules_copied: number; forked_from: number }>(
      `/api/plans/${planId}/fork`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      }
    );
  },
};
