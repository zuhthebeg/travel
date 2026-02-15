// /api/geocode - 번역 + Photon 지오코딩 (무료)

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../types';

function hasKorean(text: string): boolean {
  return /[\uAC00-\uD7AF]/.test(text);
}

async function translateToEnglish(text: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|en`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const translated = data.responseData?.translatedText;
    if (translated && translated !== text) return translated;
  } catch { }
  return null;
}

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '5');

  if (!query) {
    return errorResponse('Query parameter "q" is required');
  }

  try {
    // 검색할 쿼리 목록 (원본 + 번역)
    const queries = [query];
    if (hasKorean(query)) {
      const english = await translateToEnglish(query);
      if (english) queries.push(english);
    }

    for (const q of queries) {
      // Photon API
      const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}`);
      if (photonRes.ok) {
        const photonData = await photonRes.json() as any;
        if (photonData.features?.length > 0) {
          const places = photonData.features.map((f: any, i: number) => {
            const props = f.properties;
            const [lng, lat] = f.geometry.coordinates;
            const parts: string[] = [];
            if (props.name) parts.push(props.name);
            if (props.city && props.city !== props.name) parts.push(props.city);
            if (props.state) parts.push(props.state);
            if (props.country) parts.push(props.country);
            return { id: i, name: parts.join(', '), lat, lng, type: props.type || 'place' };
          });
          return jsonResponse({ places });
        }
      }
    }

    return jsonResponse({ places: [] });
  } catch (error) {
    console.error('Geocoding error:', error);
    return errorResponse('Failed to geocode location', 500);
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
