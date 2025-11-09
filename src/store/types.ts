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
  title: string;
  place: string | null;
  memo: string | null;
  plan_b: string | null;
  plan_c: string | null;
  order_index: number;
  created_at: string;
}

export interface User {
  id: number;
  username: string;
}
