// Store 타입 정의

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

export interface User {
  id: number;
  username: string;
}
