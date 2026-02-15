/**
 * Batch geocode schedules
 * POST /api/plans/:id/geocode-schedules
 * 
 * Options:
 * - mode: "missing" (only null coords) | "all" (re-geocode everything)
 */

interface Env {
  DB: D1Database;
  GOOGLE_MAPS_API_KEY?: string;
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

// Geocode using Google Maps API (best for Korean text)
async function geocodeGoogle(query: string, apiKey: string, regionBias?: string | null): Promise<{ lat: number; lng: number } | null> {
  try {
    let url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}&language=ko`;
    if (regionBias) {
      url += `&region=${regionBias}`;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.status === 'OK' && data.results?.length > 0) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (e) {
    console.error('Google geocode error:', e);
  }
  return null;
}

// Geocode using Photon (free fallback)
async function geocodePhoton(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`);
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

// Geocode with fallback chain: Google → Photon
async function geocode(query: string, countryCode?: string | null, googleApiKey?: string): Promise<{ lat: number; lng: number } | null> {
  // 1st: Google (handles Korean perfectly)
  if (googleApiKey) {
    const result = await geocodeGoogle(query, googleApiKey, countryCode);
    if (result) return result;
  }
  // 2nd: Photon (free, good for English)
  const result = await geocodePhoton(query);
  if (result) return result;
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
    let query = `SELECT id, place, title, latitude, longitude FROM schedules WHERE plan_id = ?`;
    if (mode === 'missing') {
      query += ` AND (latitude IS NULL OR longitude IS NULL)`;
    }
    query += ` AND place IS NOT NULL AND place != ''`;
    
    const schedules = await context.env.DB.prepare(query).bind(planId).all();
    
    let updated = 0;
    let failed = 0;
    const results: any[] = [];

    for (const schedule of schedules.results || []) {
      // Build search query with context
      const place = schedule.place as string;
      
      // Skip generic place names (숙소, 호텔, etc.)
      if (isGenericPlace(place)) {
        results.push({
          id: schedule.id,
          place,
          status: 'skipped',
          reason: 'generic_place',
        });
        continue;
      }
      
      // Build search strategies - ONLY use country-filtered searches for safety
      const searchStrategies: { query: string; useCountry: boolean }[] = [
        { query: `${place}, ${regionContext}`, useCountry: true },   // place + region + country
        { query: place, useCountry: true },                           // just place + country
      ];
      
      // Only add global fallback if country code is not found (unknown region)
      if (!countryCode) {
        searchStrategies.push(
          { query: `${place}, ${regionContext}`, useCountry: false },   // place + region (no country filter)
          { query: place, useCountry: false },                          // just place (global)
        );
      }

      let coords: { lat: number; lng: number } | null = null;
      const googleKey = context.env.GOOGLE_MAPS_API_KEY;
      
      for (const strategy of searchStrategies) {
        coords = await geocode(strategy.query, strategy.useCountry ? countryCode : null, googleKey);
        if (coords) break;
        // Rate limit: wait 200ms between requests (for free APIs)
        if (!googleKey) await new Promise(r => setTimeout(r, 200));
      }

      if (coords) {
        await context.env.DB.prepare(
          `UPDATE schedules SET latitude = ?, longitude = ? WHERE id = ?`
        ).bind(coords.lat, coords.lng, schedule.id).run();
        
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
