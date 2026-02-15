// /api/geocode - Google Geocoding → Photon fallback

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../types';

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const limit = url.searchParams.get('limit') || '5';

  if (!query) {
    return errorResponse('Query parameter "q" is required');
  }

  try {
    const googleKey = (env as any).GOOGLE_MAPS_API_KEY;

    // 1st: Google Geocoding (best for Korean)
    if (googleKey) {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleKey}&language=ko`;
      const googleRes = await fetch(googleUrl);
      if (googleRes.ok) {
        const googleData = await googleRes.json() as any;
        if (googleData.status === 'OK' && googleData.results?.length > 0) {
          const places = googleData.results.slice(0, parseInt(limit)).map((r: any, i: number) => ({
            id: i,
            name: r.formatted_address,
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng,
            type: r.types?.[0] || 'place',
          }));
          return jsonResponse({ places });
        }
      }
    }

    // 2nd: Photon (free fallback)
    const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`);
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

    // 3rd: Nominatim (last resort)
    const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
    nomUrl.searchParams.set('q', query);
    nomUrl.searchParams.set('format', 'json');
    nomUrl.searchParams.set('limit', limit);
    nomUrl.searchParams.set('accept-language', 'ko,en');
    const nomRes = await fetch(nomUrl.toString(), {
      headers: { 'User-Agent': 'Travly/1.0' },
    });
    if (nomRes.ok) {
      const nomData = await nomRes.json() as any[];
      const places = nomData.map((r: any) => ({
        id: r.place_id,
        name: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        type: r.type,
      }));
      return jsonResponse({ places });
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
