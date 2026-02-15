/**
 * AI Travel Memo Generation
 * POST /api/plans/:id/memos/generate
 */

import { callOpenAI, type OpenAIMessage } from '../../../assistant/_common';

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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const planId = context.params.id;
  const { region } = await context.request.json<{ region: string }>();

  if (!region) {
    return new Response(JSON.stringify({ error: 'Region is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const systemPrompt = `You are a travel information assistant. Generate helpful travel memos for a trip to ${region}.

Output JSON object with "memos" array:
{
  "memos": [
    {"category": "visa", "title": "비자 정보", "content": "...", "icon": "🛂"},
    {"category": "timezone", "title": "시차", "content": "...", "icon": "🕐"},
    {"category": "weather", "title": "현재 날씨/기후", "content": "...", "icon": "🌤️"},
    {"category": "currency", "title": "환율/통화", "content": "...", "icon": "💱"},
    {"category": "emergency", "title": "비상연락처", "content": "...", "icon": "🆘"},
    {"category": "transportation", "title": "주요 교통수단", "content": "...", "icon": "🚗"}
  ]
}

Rules:
1. All text in Korean
2. Be concise but informative (2-4 sentences per memo)
3. Include practical, useful information
4. For visa, include whether Korean passport holders need visa/ESTA/etc.
5. For timezone, include time difference from Korea (KST/UTC+9)
6. For currency, include exchange rate estimate and payment tips
7. For emergency, include local emergency numbers and Korean embassy if applicable
8. Generate at least 4 relevant memos`;

  try {
    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate travel information memos for: ${region}` },
    ];

    const response = await callOpenAI(apiKey, messages, {
      temperature: 0.5,
      maxTokens: 2000,
      responseFormat: 'json_object',
    });

    // Parse the response - handle both array and object formats
    let memos: any[];
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      memos = parsed;
    } else if (parsed.memos && Array.isArray(parsed.memos)) {
      memos = parsed.memos;
    } else {
      // Try to extract array from object
      const values = Object.values(parsed);
      memos = values.filter((v: any) => v && typeof v === 'object' && v.category);
    }

    // Insert memos into database
    let insertedCount = 0;
    for (const memo of memos) {
      if (memo.category && memo.title) {
        try {
          await context.env.DB.prepare(
            `INSERT INTO travel_memos (plan_id, category, title, content, icon, order_index)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(
            planId,
            memo.category,
            memo.title,
            memo.content || null,
            memo.icon || null,
            insertedCount
          ).run();
          insertedCount++;
        } catch (e) {
          console.error('Failed to insert memo:', memo, e);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      count: insertedCount 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (e) {
    console.error('Failed to generate memos:', e);
    return new Response(JSON.stringify({ error: 'Failed to generate memos' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};
