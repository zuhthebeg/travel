// /api/geocode - Photon 지오코딩 (무료, 키 불필요)

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../types';

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '5');

  if (!query) {
    return errorResponse('Query parameter "q" is required');
  }

  try {
    const mapFeatures = (features: any[]) =>
      features.map((f: any, i: number) => {
        const props = f.properties;
        const [lng, lat] = f.geometry.coordinates;
        const parts: string[] = [];
        if (props.name) parts.push(props.name);
        if (props.city && props.city !== props.name) parts.push(props.city);
        if (props.state) parts.push(props.state);
        if (props.country) parts.push(props.country);
        return { id: i, name: parts.join(', '), lat, lng, type: props.type || 'place', countryCode: props.countrycode || null, city: props.city || props.name || null };
      });

    // 1차: 직접 검색
    const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (photonRes.ok) {
      const photonData = await photonRes.json() as any;
      if (photonData.features?.length > 0) {
        return jsonResponse({ places: mapFeatures(photonData.features) });
      }
    }

    // 2차: 한국어면 영어 번역 후 재검색
    if (/[\uAC00-\uD7AF]/.test(query)) {
      try {
        const trRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=ko|en`);
        if (trRes.ok) {
          const trData = await trRes.json() as any;
          const translated = trData.responseData?.translatedText;
          if (translated && translated !== query) {
            const retryRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(translated)}&limit=${limit}`);
            if (retryRes.ok) {
              const retryData = await retryRes.json() as any;
              if (retryData.features?.length > 0) {
                return jsonResponse({ places: mapFeatures(retryData.features) });
              }
            }
          }
        }
      } catch {}
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
