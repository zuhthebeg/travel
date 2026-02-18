import { callOpenAI, type OpenAIMessage } from './_common';

interface Env {
  OPENAI_API_KEY: string;
}

// Photon geocoding (free, single call)
async function geocodePhoton(query: string, countryCode?: string): Promise<{ lat: number; lng: number } | null> {
  try {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
    if (countryCode) url += `&lang=en&osm_tag=!boundary`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.features?.length > 0) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      return { lat, lng };
    }
  } catch (e) {
    console.error('Photon geocode error:', e);
  }
  return null;
}

// Region to country code for geocoding context
const REGION_COUNTRY_CODES: Record<string, string> = {
  '미국': 'us', '샌프란시스코': 'us', '로스앤젤레스': 'us', '라스베가스': 'us',
  '뉴욕': 'us', 'LA': 'us', 'SF': 'us', 'NYC': 'us', '캘리포니아': 'us',
  '일본': 'jp', '도쿄': 'jp', '오사카': 'jp', '교토': 'jp',
  '한국': 'kr', '서울': 'kr', '부산': 'kr', '제주': 'kr', '강원': 'kr',
  '춘천': 'kr', '강릉': 'kr', '속초': 'kr', '경주': 'kr', '전주': 'kr', '여수': 'kr',
  '프랑스': 'fr', '파리': 'fr', '영국': 'gb', '런던': 'gb',
  '태국': 'th', '방콕': 'th', '베트남': 'vn', '대만': 'tw',
};

function getCountryCode(region: string): string | null {
  const r = region.toLowerCase().trim();
  for (const [key, code] of Object.entries(REGION_COUNTRY_CODES)) {
    if (r.includes(key.toLowerCase())) return code;
  }
  return null;
}

// Generic places that can't be geocoded
const GENERIC_PLACES = [
  '숙소', '호텔', '모텔', '펜션', '게스트하우스', '민박',
  '식당', '레스토랑', '카페', '맛집', '술집',
  '공항', '역', '터미널', '정류장',
  '마트', '편의점', '쇼핑몰',
  '체크인', '체크아웃', '휴식', '자유시간',
];

function isGenericPlace(place: string): boolean {
  const n = place.toLowerCase().trim();
  return GENERIC_PLACES.some(g => n === g || n.startsWith(g + ' '));
}

export async function textToSchedule(apiKey: string, text: string, planContext: any) {
  const { planTitle, planRegion, planStartDate, planEndDate, currentDate, currentTime, userLocation, userLang } = planContext;

  // Detect language from text
  const detectLanguage = (t: string, langHint?: string) => {
    if (langHint?.startsWith('ko') || /[\uAC00-\uD7AF]/.test(t)) return 'Korean';
    if (langHint?.startsWith('ja') || /[\u3040-\u30FF]/.test(t)) return 'Japanese';
    if (langHint?.startsWith('zh') || /[\u4E00-\u9FFF]/.test(t)) return 'Chinese';
    return 'Korean';
  };
  const outputLang = detectLanguage(text, userLang);

  const locationInfo = userLocation?.city ? ` (User is currently in: ${userLocation.city})` : '';

  const systemPrompt = `You are a travel schedule parser. Parse user input and create a schedule item.

Output ONLY valid JSON with this format:
{
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "title": "Activity title in ${outputLang}",
  "place": "Place name in ${outputLang}",
  "place_en": "Place name in English (for geocoding)",
  "memo": "Notes in ${outputLang}"
}

CRITICAL RULES:
1. ALL text must be in ${outputLang}
2. If no date specified, use current date: ${currentDate}
3. If no time specified but context suggests timing (점심, lunch, 저녁, dinner), use appropriate time
4. If ambiguous timing, use current time: ${currentTime}
5. **ONLY use place names that you are CERTAIN actually exist.** Do NOT invent or hallucinate place names. If the user mentions a specific place, use it as-is. If the user describes a generic activity (e.g. "점심 먹기", "산책"), set place to "" (empty string).
6. **NEVER fabricate attractions, parks, restaurants, or landmarks.** If you're not 100% sure a place exists at the travel destination, leave place empty and put location hints in memo instead.
7. place_en: Translate the place name to English for geocoding. If place is empty, set place_en to "" too.
8. Extract any tips or notes for the memo field`;

  const userPrompt = `Current context:
- Date: ${currentDate}
- Time: ${currentTime}
- Travel: "${planTitle}" in ${planRegion} (${planStartDate} to ${planEndDate})${locationInfo}

Parse this into a schedule:
---
${text}
---`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const reply = await callOpenAI(apiKey, messages, {
    temperature: 0.1,
    responseFormat: 'json_object',
  });

  const parsed = JSON.parse(reply);

  // Single Photon geocode call if place is not empty/generic
  const placeName = parsed.place_en || parsed.place || '';
  if (placeName && !isGenericPlace(parsed.place || '')) {
    const countryCode = getCountryCode(planRegion || '');
    const query = countryCode
      ? `${placeName}, ${planRegion}`
      : placeName;
    const coords = await geocodePhoton(query, countryCode || undefined);
    if (coords) {
      parsed.lat = coords.lat;
      parsed.lng = coords.lng;
    }
  }

  // Clean up internal field
  delete parsed.place_en;

  return parsed;
}
