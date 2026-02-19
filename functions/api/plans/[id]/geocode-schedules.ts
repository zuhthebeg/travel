/**
 * Batch geocode schedules
 * POST /api/plans/:id/geocode-schedules
 * 
 * Options:
 * - mode: "missing" (only null coords) | "all" (re-geocode everything)
 */

interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

// Region to country code mapping
const REGION_COUNTRY_CODES: Record<string, string> = {
  // USA
  '미국': 'us', '샌프란시스코': 'us', '로스앤젤레스': 'us', '라스베가스': 'us', 
  '뉴욕': 'us', '시애틀': 'us', '하와이': 'us', '그랜드캐니언': 'us', 
  'LA': 'us', 'SF': 'us', 'NYC': 'us', '캘리포니아': 'us',
  '라스베이거스': 'us', '샌디에이고': 'us', '워싱턴': 'us',
  '보스턴': 'us', '시카고': 'us', '마이애미': 'us', '올랜도': 'us', '애너하임': 'us',
  // Japan
  '일본': 'jp', '도쿄': 'jp', '오사카': 'jp', '교토': 'jp', '후쿠오카': 'jp',
  // Korea
  '한국': 'kr', '서울': 'kr', '부산': 'kr', '제주': 'kr', '제주도': 'kr',
  '강원': 'kr', '강원도': 'kr', '대관령': 'kr', '평창': 'kr', '속초': 'kr', '강릉': 'kr',
  '경주': 'kr', '전주': 'kr', '여수': 'kr', '통영': 'kr', '거제': 'kr',
  '대구': 'kr', '대전': 'kr', '광주': 'kr', '인천': 'kr', '울산': 'kr',
  '경기': 'kr', '충청': 'kr', '전라': 'kr', '경상': 'kr',
  // Europe
  '프랑스': 'fr', '파리': 'fr', '영국': 'gb', '런던': 'gb', 
  '독일': 'de', '이탈리아': 'it', '스페인': 'es',
  // Asia
  '중국': 'cn', '베이징': 'cn', '상하이': 'cn', '홍콩': 'hk',
  '태국': 'th', '방콕': 'th', '베트남': 'vn', '싱가포르': 'sg',
  '대만': 'tw', '타이베이': 'tw',
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
  const normalizedRegion = region.toLowerCase().trim();
  for (const [key, code] of Object.entries(REGION_COUNTRY_CODES)) {
    if (normalizedRegion.includes(key.toLowerCase())) {
      return code;
    }
  }
  return null;
}

// Generic place names that can't be geocoded accurately alone
const GENERIC_PLACE_NAMES = [
  '숙소', '호텔', '모텔', '펜션', '게스트하우스', '민박', '에어비앤비',
  '식당', '레스토랑', '카페', '맛집', '술집', '바',
  '공항', '역', '터미널', '정류장',
  '마트', '편의점', '쇼핑몰',
  '체크인', '체크아웃', '휴식', '자유시간',
];

function isGenericPlace(place: string): boolean {
  const normalized = place.toLowerCase().trim();
  return GENERIC_PLACE_NAMES.some(g => normalized === g || normalized.startsWith(g + ' '));
}

// 한국어 감지
function hasKorean(text: string): boolean {
  return /[\uAC00-\uD7AF]/.test(text);
}

// OpenAI 일괄 번역 (장소명 리스트 → 영어)
async function batchTranslateWithOpenAI(
  places: string[],
  regionContext: string,
  apiKey: string
): Promise<Record<string, string>> {
  if (!places.length || !apiKey) return {};
  try {
    const OPENAI_GW = 'https://gateway.ai.cloudflare.com/v1/3d0681b782422e56226a0a1df4a0e8b2/travly-ai-gateway/openai';
    const res = await fetch(`${OPENAI_GW}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{
          role: 'system',
          content: `You translate Korean place names to English for geocoding. Region context: ${regionContext}. Return JSON: {"translations": {"original": "english", ...}}. Use the most well-known English name for each place. If it's already English, keep as-is.`
        }, {
          role: 'user',
          content: JSON.stringify(places)
        }],
        temperature: 0,
      }),
    });
    if (!res.ok) return {};
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return {};
    const parsed = JSON.parse(content);
    return parsed.translations || {};
  } catch (e) {
    console.error('OpenAI translation error:', e);
    return {};
  }
}

// MyMemory 번역 API (무료 폴백)
async function translateToEnglish(text: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|en`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const translated = data.responseData?.translatedText;
    if (translated && translated !== text) return translated;
  } catch (e) {
    console.error('Translation error:', e);
  }
  return null;
}

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
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error('Nominatim geocode error:', e);
  }
  return null;
}

// Photon 지오코딩 (무료, country 선호 필터링)
async function geocodePhoton(query: string, regionContext?: string, expectedCountry?: string): Promise<GeoResult | null> {
  try {
    const q = regionContext && !query.toLowerCase().includes(regionContext.toLowerCase())
      ? `${query}, ${regionContext}`
      : query;
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.features?.length > 0) {
      // If expected country, find matching result
      if (expectedCountry) {
        const match = data.features.find((f: any) =>
          f.properties?.countrycode?.toLowerCase() === expectedCountry.toLowerCase()
        );
        if (match) {
          const [lng, lat] = match.geometry.coordinates;
          return { lat, lng, countryCode: match.properties.countrycode?.toUpperCase() };
        }
      }
      const first = data.features[0];
      const [lng, lat] = first.geometry.coordinates;
      return { lat, lng, countryCode: first.properties?.countrycode?.toUpperCase() };
    }
  } catch (e) {
    console.error('Photon geocode error:', e);
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const planId = context.params.id;
  const { mode = 'missing' } = await context.request.json<{ mode?: 'missing' | 'all' }>().catch(() => ({}));

  try {
    // Get plan region for context
    const plan = await context.env.DB.prepare(
      `SELECT region FROM plans WHERE id = ?`
    ).bind(planId).first<{ region: string | null }>();
    
    const regionContext = plan?.region || '';
    const countryCode = getCountryCode(regionContext);

    // Get schedules to geocode
    let query = `SELECT id, place, place_en, title, latitude, longitude FROM schedules WHERE plan_id = ?`;
    if (mode === 'missing') {
      query += ` AND (latitude IS NULL OR longitude IS NULL)`;
    }
    query += ` AND place IS NOT NULL AND place != ''`;
    
    const schedules = await context.env.DB.prepare(query).bind(planId).all();
    
    let updated = 0;
    let failed = 0;
    const results: any[] = [];

    // 1단계: 한국어 장소명 일괄 번역 (OpenAI)
    const koreanPlaces: string[] = [];
    const scheduleList = schedules.results || [];
    for (const schedule of scheduleList) {
      const place = schedule.place as string;
      const placeEn = schedule.place_en as string | null;
      if (!isGenericPlace(place) && !placeEn && hasKorean(place)) {
        koreanPlaces.push(place);
      }
    }
    const translations = await batchTranslateWithOpenAI(
      [...new Set(koreanPlaces)],
      regionContext,
      context.env.OPENAI_API_KEY
    );

    // 2단계: 각 스케줄 geocode
    for (const schedule of scheduleList) {
      const place = schedule.place as string;
      
      if (isGenericPlace(place)) {
        results.push({
          id: schedule.id,
          place,
          status: 'skipped',
          reason: 'generic_place',
        });
        continue;
      }
      
      const placeEn = schedule.place_en as string | null;
      let coords: GeoResult | null = null;
      
      // Helper: validate country matches expected
      const isValidCountry = (result: GeoResult | null): boolean => {
        if (!result || !countryCode) return true; // no filter = accept
        if (!result.countryCode) return true; // unknown = accept
        return result.countryCode.toLowerCase() === countryCode.toLowerCase();
      };

      // 1차: Nominatim with country filter (most accurate for specific countries)
      if (countryCode) {
        const searchTerm = placeEn || translations[place] || place;
        coords = await geocodeNominatim(searchTerm, countryCode);
        if (coords && !placeEn && translations[place]) {
          await context.env.DB.prepare(
            `UPDATE schedules SET place_en = ? WHERE id = ? AND place_en IS NULL`
          ).bind(translations[place], schedule.id).run();
        }
      }

      // 2차: Photon with country preference
      if (!coords && placeEn) {
        coords = await geocodePhoton(placeEn, regionContext, countryCode || undefined);
        if (!isValidCountry(coords)) coords = null;
      }
      
      // 3차: OpenAI 번역 결과로 Photon
      if (!coords && translations[place]) {
        coords = await geocodePhoton(translations[place], regionContext, countryCode || undefined);
        if (!isValidCountry(coords)) coords = null;
        if (coords) {
          await context.env.DB.prepare(
            `UPDATE schedules SET place_en = ? WHERE id = ? AND place_en IS NULL`
          ).bind(translations[place], schedule.id).run();
        }
      }

      // 4차: 한국어면 MyMemory 번역 → Nominatim/Photon
      if (!coords && hasKorean(place)) {
        const english = await translateToEnglish(place);
        if (english) {
          if (countryCode) {
            coords = await geocodeNominatim(english, countryCode);
          }
          if (!coords) {
            coords = await geocodePhoton(english, regionContext, countryCode || undefined);
            if (!isValidCountry(coords)) coords = null;
          }
          if (coords) {
            await context.env.DB.prepare(
              `UPDATE schedules SET place_en = ? WHERE id = ? AND place_en IS NULL`
            ).bind(english, schedule.id).run();
          }
        }
      }
      
      // 5차: 원본으로 직접 검색
      if (!coords) {
        if (countryCode) {
          coords = await geocodeNominatim(place, countryCode);
        }
        if (!coords) {
          coords = await geocodePhoton(place, regionContext, countryCode || undefined);
          if (!isValidCountry(coords)) coords = null;
        }
      }

      if (coords) {
        const cc = coords.countryCode || (countryCode ? countryCode.toUpperCase() : null);
        await context.env.DB.prepare(
          `UPDATE schedules SET latitude = ?, longitude = ?, country_code = COALESCE(?, country_code) WHERE id = ?`
        ).bind(coords.lat, coords.lng, cc, schedule.id).run();
        
        updated++;
        results.push({
          id: schedule.id,
          place,
          status: 'updated',
          lat: coords.lat,
          lng: coords.lng,
        });
      } else {
        failed++;
        results.push({
          id: schedule.id,
          place,
          status: 'not_found',
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: (schedules.results || []).length,
      updated,
      failed,
      results,
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (e) {
    console.error('Batch geocode error:', e);
    return new Response(JSON.stringify({ error: 'Failed to geocode schedules' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};
