// 유틸리티 함수들

// 날짜 포맷팅 (YYYY-MM-DD)
export function parseDateLocal(dateStr: string): Date {
  // Parse YYYY-MM-DD as local midnight to avoid UTC day shifts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseDateLocal(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 날짜 범위 계산 (며칠간)
export function getDaysDifference(startDate: string, endDate: string): number {
  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; // +1 to include both days
}

// 날짜 표시용 포맷 (2025년 12월 1일)
export function formatDisplayDate(date: string): string {
  const d = parseDateLocal(date);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 날짜 범위 표시 (12/1 - 12/4)
export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
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

// 국가 코드를 국기 이모지로 변환 (ISO 3166-1 alpha-2)
export function getCountryFlag(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  
  // ISO 3166-1 alpha-2 코드를 Regional Indicator Symbol로 변환
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}

// 주요 국가 코드 매핑 (지역명에서 추출용)
const COUNTRY_MAPPINGS: Record<string, { code: string; name: string }> = {
  // 한국
  '서울': { code: 'KR', name: '한국' },
  '부산': { code: 'KR', name: '한국' },
  '제주': { code: 'KR', name: '한국' },
  '제주도': { code: 'KR', name: '한국' },
  '경주': { code: 'KR', name: '한국' },
  '전주': { code: 'KR', name: '한국' },
  '강릉': { code: 'KR', name: '한국' },
  '인천': { code: 'KR', name: '한국' },
  '한국': { code: 'KR', name: '한국' },
  '춘천': { code: 'KR', name: '한국' },
  '속초': { code: 'KR', name: '한국' },
  '여수': { code: 'KR', name: '한국' },
  '통영': { code: 'KR', name: '한국' },
  '대구': { code: 'KR', name: '한국' },
  '대전': { code: 'KR', name: '한국' },
  '광주': { code: 'KR', name: '한국' },
  '평창': { code: 'KR', name: '한국' },
  '가평': { code: 'KR', name: '한국' },
  '강원': { code: 'KR', name: '한국' },
  
  // 일본
  '도쿄': { code: 'JP', name: '일본' },
  '오사카': { code: 'JP', name: '일본' },
  '교토': { code: 'JP', name: '일본' },
  '후쿠오카': { code: 'JP', name: '일본' },
  '삿포로': { code: 'JP', name: '일본' },
  '나고야': { code: 'JP', name: '일본' },
  '오키나와': { code: 'JP', name: '일본' },
  '일본': { code: 'JP', name: '일본' },
  'tokyo': { code: 'JP', name: '일본' },
  'osaka': { code: 'JP', name: '일본' },
  'kyoto': { code: 'JP', name: '일본' },
  
  // 미국
  '뉴욕': { code: 'US', name: '미국' },
  '로스앤젤레스': { code: 'US', name: '미국' },
  'LA': { code: 'US', name: '미국' },
  '샌프란시스코': { code: 'US', name: '미국' },
  '하와이': { code: 'US', name: '미국' },
  '라스베이거스': { code: 'US', name: '미국' },
  '시애틀': { code: 'US', name: '미국' },
  '미국': { code: 'US', name: '미국' },
  '그랜드캐니언': { code: 'US', name: '미국' },
  
  // 유럽
  '파리': { code: 'FR', name: '프랑스' },
  '프랑스': { code: 'FR', name: '프랑스' },
  '런던': { code: 'GB', name: '영국' },
  '영국': { code: 'GB', name: '영국' },
  '로마': { code: 'IT', name: '이탈리아' },
  '이탈리아': { code: 'IT', name: '이탈리아' },
  '바르셀로나': { code: 'ES', name: '스페인' },
  '스페인': { code: 'ES', name: '스페인' },
  '베를린': { code: 'DE', name: '독일' },
  '독일': { code: 'DE', name: '독일' },
  '스위스': { code: 'CH', name: '스위스' },
  '취리히': { code: 'CH', name: '스위스' },
  
  // 아시아
  '방콕': { code: 'TH', name: '태국' },
  '태국': { code: 'TH', name: '태국' },
  '싱가포르': { code: 'SG', name: '싱가포르' },
  '베트남': { code: 'VN', name: '베트남' },
  '하노이': { code: 'VN', name: '베트남' },
  '호치민': { code: 'VN', name: '베트남' },
  '다낭': { code: 'VN', name: '베트남' },
  '홍콩': { code: 'HK', name: '홍콩' },
  '대만': { code: 'TW', name: '대만' },
  '타이베이': { code: 'TW', name: '대만' },
  '발리': { code: 'ID', name: '인도네시아' },
  '인도네시아': { code: 'ID', name: '인도네시아' },
  
  // 오세아니아
  '시드니': { code: 'AU', name: '호주' },
  '멜버른': { code: 'AU', name: '호주' },
  '호주': { code: 'AU', name: '호주' },
  '뉴질랜드': { code: 'NZ', name: '뉴질랜드' },
};

// 지역명에서 국가 정보 추출
export function extractCountryFromRegion(region: string | null | undefined): { code: string; name: string } | null {
  if (!region) return null;
  
  const normalized = region.toLowerCase().trim();
  
  // 정확히 매칭
  for (const [key, value] of Object.entries(COUNTRY_MAPPINGS)) {
    if (normalized.includes(key.toLowerCase())) {
      return value;
    }
  }
  
  return null;
}
