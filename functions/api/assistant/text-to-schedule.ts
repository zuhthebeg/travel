import { callOpenAI, type OpenAIMessage } from './_common';

interface Env {
  OPENAI_API_KEY: string;
}

// Geocoding result with country info
interface GeoResult {
  lat: number;
  lng: number;
  countryCode?: string;
}

// Nominatim geocoding (supports countrycodes filter)
async function geocodeNominatim(query: string, countryCode?: string): Promise<GeoResult | null> {
  try {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=3`;
    if (countryCode) url += `&countrycodes=${countryCode}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Travly/1.0 (travel planner app)' },
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data?.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
  } catch (e) {
    console.error('Nominatim geocode error:', e);
  }
  return null;
}

// Photon geocoding (free, returns country info)
async function geocodePhoton(query: string, expectedCountry?: string): Promise<GeoResult | null> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.features?.length > 0) {
      // If we know the expected country, find a matching result
      if (expectedCountry) {
        const match = data.features.find((f: any) =>
          f.properties?.countrycode?.toLowerCase() === expectedCountry.toLowerCase()
        );
        if (match) {
          const [lng, lat] = match.geometry.coordinates;
          return { lat, lng, countryCode: match.properties.countrycode?.toUpperCase() };
        }
      }
      // Fallback to first result
      const first = data.features[0];
      const [lng, lat] = first.geometry.coordinates;
      return { lat, lng, countryCode: first.properties?.countrycode?.toUpperCase() };
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
  '몽골': 'mn', '울란바토르': 'mn', '고비': 'mn',
  '인도': 'in', '뉴델리': 'in', '인도네시아': 'id', '발리': 'id',
  '필리핀': 'ph', '세부': 'ph', '보라카이': 'ph',
  '호주': 'au', '시드니': 'au', '멜버른': 'au',
  '캐나다': 'ca', '밴쿠버': 'ca', '토론토': 'ca',
  '터키': 'tr', '이스탄불': 'tr', '카파도키아': 'tr',
  '이집트': 'eg', '카이로': 'eg', '그리스': 'gr', '아테네': 'gr',
  '스위스': 'ch', '체코': 'cz', '프라하': 'cz',
  '네덜란드': 'nl', '암스테르담': 'nl', '포르투갈': 'pt',
  '크로아티아': 'hr', '두브로브니크': 'hr',
  '뉴질랜드': 'nz', '멕시코': 'mx', '칸쿤': 'mx',
  '브라질': 'br', '페루': 'pe', '쿠바': 'cu',
  '러시아': 'ru', '모스크바': 'ru', '카자흐스탄': 'kz',
  '네팔': 'np', '캄보디아': 'kh', '미얀마': 'mm', '라오스': 'la',
  '말레이시아': 'my', '쿠알라룸푸르': 'my',
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
  const { planTitle, planRegion, planStartDate, planEndDate, currentDate, currentTime, userLocation, userLang, defaultDate } = planContext;

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
2. If no date specified, use this default date: ${defaultDate || currentDate}
3. If no time specified but context suggests timing (점심, lunch, 저녁, dinner), use appropriate time
4. If ambiguous timing, use current time: ${currentTime}
5. **ONLY use place names that you are CERTAIN actually exist.** Do NOT invent or hallucinate place names. If the user mentions a specific place, use it as-is. If the user describes a generic activity (e.g. "점심 먹기", "산책"), set place to "" (empty string).
6. **NEVER fabricate attractions, parks, restaurants, or landmarks.** If you're not 100% sure a place exists at the travel destination, leave place empty and put location hints in memo instead.
7. place_en: Translate the place name to English for geocoding. If place is empty, set place_en to "" too.
8. Extract any tips or notes for the memo field`;

  const userPrompt = `Current context:
- Today: ${currentDate}
- Time: ${currentTime}
- Default date (use when user doesn't specify a date): ${defaultDate || currentDate}
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

  // Geocode: Nominatim (country filter) → Photon (country preference) → 실패하면 좌표 비움
  const placeName = parsed.place_en || parsed.place || '';
  if (placeName && !isGenericPlace(parsed.place || '')) {
    const countryCode = getCountryCode(planRegion || '');
    const query = countryCode ? `${placeName}, ${planRegion}` : placeName;
    
    let coords: GeoResult | null = null;
    
    // 1차: Nominatim with country filter
    if (countryCode) {
      coords = await geocodeNominatim(placeName, countryCode);
    }
    
    // 2차: Photon with country preference
    if (!coords) {
      coords = await geocodePhoton(query, countryCode || undefined);
      // 다른 나라 결과면 reject — 잘못된 좌표보다 없는 게 나음
      if (coords && countryCode && coords.countryCode &&
          coords.countryCode.toLowerCase() !== countryCode.toLowerCase()) {
        coords = null;
      }
    }
    
    // 좌표 찾았을 때만 저장 (실패하면 비워둠)
    if (coords) {
      parsed.lat = coords.lat;
      parsed.lng = coords.lng;
      parsed.country_code = coords.countryCode?.toUpperCase() || countryCode?.toUpperCase() || undefined;
    }
    // else: lat/lng 없이 반환 → 보정 버튼으로 나중에 처리
  }

  // Clean up internal field
  delete parsed.place_en;

  return parsed;
}
