// /api/geocode - Nominatim 지오코딩 API 프록시

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../types';

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  importance: number;
}

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const limit = url.searchParams.get('limit') || '5';

  if (!query) {
    return errorResponse('Query parameter "q" is required');
  }

  try {
    // Nominatim API 호출 (OpenStreetMap 무료 지오코딩)
    const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
    nominatimUrl.searchParams.set('q', query);
    nominatimUrl.searchParams.set('format', 'json');
    nominatimUrl.searchParams.set('limit', limit);
    nominatimUrl.searchParams.set('addressdetails', '1');
    nominatimUrl.searchParams.set('accept-language', 'ko,en');

    const response = await fetch(nominatimUrl.toString(), {
      headers: {
        'User-Agent': 'Travly/1.0 (travel planning app)',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const results: NominatimResult[] = await response.json();

    // 결과 변환
    const places = results.map((r) => ({
      id: r.place_id,
      name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      type: r.type,
    }));

    return jsonResponse({ places });
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
