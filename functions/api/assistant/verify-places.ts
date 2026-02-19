/**
 * POST /api/assistant/verify-places
 * AI verifies place names and provides English translations for geocoding
 */

interface Env {
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { places, region } = await context.request.json<{
    places: Array<{ id: number; place: string; place_en?: string | null }>;
    region?: string;
  }>();

  if (!places?.length) {
    return new Response(JSON.stringify({ corrections: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
          content: `You are a travel place name verifier. Given a list of place names from a trip to "${region || 'unknown'}", verify each place and provide the correct English name for geocoding.

Rules:
1. For each place, provide the most accurate English name that a geocoding service would recognize.
2. Include the city/region for disambiguation (e.g., "Victoria Peak, Hong Kong" not just "Victoria Peak")
3. If the place name seems wrong or doesn't exist in that region, provide the closest real place.
4. If a place is generic (hotel, restaurant without specific name), skip it.

Return JSON: { "corrections": [{ "id": number, "place_en": "English name, City/Region" }] }
Only include places that need a new or corrected place_en. Skip places that already have correct place_en.`
        }, {
          role: 'user',
          content: JSON.stringify(places.map(p => ({ id: p.id, place: p.place, place_en: p.place_en, region })))
        }],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ corrections: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ corrections: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = JSON.parse(content);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('verify-places error:', e);
    return new Response(JSON.stringify({ corrections: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};
