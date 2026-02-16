// Store 타입 정의

export interface Plan {
  id: number;
  user_id: number;
  title: string;
  region: string | null;
  country: string | null; // 국가명 (예: 일본, 한국, 미국)
  country_code: string | null; // ISO 3166-1 alpha-2 (예: JP, KR, US)
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
  place_en: string | null; // English place name for geocoding
  memo: string | null;
  plan_b: string | null;
  plan_c: string | null;
  order_index: number;
  rating: number | null; // 1-5 stars, null if not rated yet
  review: string | null; // Text review, null if not reviewed yet
  latitude: number | null; // 위도
  longitude: number | null; // 경도
  created_at: string;
}

export interface User {
  id: number;
  username: string;
  email?: string | null;
  picture?: string | null;
  auth_provider?: 'local' | 'google';
}

export interface Comment {
  id: number;
  schedule_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

export interface Review {
  id: number;
  schedule_id: number;
  author_name: string;
  rating: number; // 1-5
  review_text: string | null;
  image_data: string; // Base64 encoded WebP image
  created_at: string;
}

export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
}

export type TravelMemoCategory = 
  | 'visa' 
  | 'timezone' 
  | 'weather' 
  | 'currency' 
  | 'emergency' 
  | 'accommodation' 
  | 'transportation' 
  | 'custom';

export interface TravelMemo {
  id: number;
  plan_id: number;
  category: TravelMemoCategory;
  title: string;
  content: string | null;
  icon: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// Album - Moments
export interface Moment {
  id: number;
  schedule_id: number;
  user_id: number;
  photo_data: string | null;
  note: string | null;
  mood: 'amazing' | 'good' | 'okay' | 'meh' | 'bad' | null;
  revisit: 'yes' | 'no' | 'maybe' | null;
  username?: string;
  user_picture?: string;
  created_at: string;
}

// Album - Plan Members
export interface PlanMember {
  user_id: number;
  username: string;
  email: string;
  picture: string | null;
  role: 'owner' | 'member';
  joined_at?: string;
}

export interface PlanMembersResponse {
  owner: PlanMember;
  members: PlanMember[];
}

// Mood 이모지 매핑
export const MOOD_EMOJI: Record<string, string> = {
  amazing: '😍',
  good: '😊',
  okay: '😐',
  meh: '😑',
  bad: '😢',
};

export const REVISIT_LABELS: Record<string, string> = {
  yes: '꼭 다시!',
  no: '한번이면 충분',
  maybe: '글쎄...',
};
