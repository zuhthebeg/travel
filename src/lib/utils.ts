// 유틸리티 함수들

// 날짜 포맷팅 (YYYY-MM-DD)
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 날짜 범위 계산 (며칠간)
export function getDaysDifference(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; // +1 to include both days
}

// 날짜 표시용 포맷 (2025년 12월 1일)
export function formatDisplayDate(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 날짜 범위 표시 (12/1 - 12/4)
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
}

// 임시 사용자 ID 생성/조회 (localStorage 기반)
export function getTempUserId(): number {
  const stored = localStorage.getItem('temp_user_id');
  if (stored) {
    return parseInt(stored, 10);
  }
  // 임시로 1을 사용 (나중에 실제 로그인 구현 시 변경)
  const tempId = 1;
  localStorage.setItem('temp_user_id', tempId.toString());
  return tempId;
}

// classNames 유틸리티 (conditional class names)
export function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
