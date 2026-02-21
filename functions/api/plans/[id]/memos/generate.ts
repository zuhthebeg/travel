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
  const planId = Number(context.params.id);
  const { region, mode, changedSchedules } = await context.request.json<{ region: string; mode?: 'full' | 'partial'; changedSchedules?: any[] }>();

  if (!planId || !region) {
    return new Response(JSON.stringify({ error: 'Plan ID and region are required' }), {
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

  // 일정 기반 컨텍스트 수집
  const { results: scheduleRows } = await context.env.DB.prepare(
    `SELECT date, time, title, place, memo FROM schedules WHERE plan_id = ? ORDER BY date, time LIMIT 300`
  ).bind(planId).all();

  const scheduleContext = (scheduleRows || [])
    .map((s: any) => `${s.date} ${s.time || '--:--'} | ${s.title || ''} | ${s.place || ''} | ${s.memo || ''}`)
    .join('\n');

  const systemPrompt = `You are a travel planning assistant.
Generate practical travel memos based on schedule data.

Output JSON object with "memos" array:
{
  "memos": [
    {"category": "reservation", "title": "예약/확인 필요", "content": "...", "icon": "📌"},
    {"category": "transportation", "title": "이동 체크포인트", "content": "...", "icon": "🚆"},
    {"category": "budget", "title": "예산 체크", "content": "...", "icon": "💳"},
    {"category": "packing", "title": "준비물", "content": "...", "icon": "🎒"},
    {"category": "contact", "title": "연락처/비상대응", "content": "...", "icon": "🆘"}
  ]
}

CRITICAL RULES:
1) All text in Korean.
2) Only schedule-derived actionable info.
3) If uncertain, write "확인 필요" (never guess facts/rates).
4) No generic destination encyclopedia info.
5) Keep concise checklist style.
6) FULL mode: 4~8 memos. PARTIAL mode: 1~4 memos only, and ONLY categories impacted by changed schedules.`;

  try {
    const changedContext = (changedSchedules || [])
      .map((s: any) => `${s.date} ${s.time || '--:--'} | ${s.title || ''} | ${s.place || ''} | ${s.memo || ''}`)
      .join('\n');

    const isPartial = mode === 'partial' && changedContext.length > 0;

    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: isPartial
          ? `MODE: PARTIAL\n여행 지역: ${region}\n\n변경된 일정만:\n${changedContext}\n\n변경된 일정과 직접 관련된 카테고리만 부분 업데이트용 메모를 생성해줘.`
          : `MODE: FULL\n여행 지역: ${region}\n\n등록된 전체 일정 데이터:\n${scheduleContext || '(일정 없음)'}\n\n위 일정을 바탕으로 실사용 가능한 메모를 생성해줘.`,
      },
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

    // 레거시 일반정보 카테고리 정리 (일정 기반 메모로 대체)
    await context.env.DB.prepare(
      `DELETE FROM travel_memos WHERE plan_id = ? AND category IN ('visa','timezone','weather','currency','emergency')`
    ).bind(planId).run();

    // Insert or update memos by category (기존 내용 자동 업데이트)
    let appliedCount = 0;
    let idx = 0;
    for (const memo of memos) {
      if (memo.category && memo.title) {
        try {
          const existing = await context.env.DB.prepare(
            `SELECT id FROM travel_memos WHERE plan_id = ? AND category = ? ORDER BY id LIMIT 1`
          ).bind(planId, memo.category).first<any>();

          if (existing?.id) {
            await context.env.DB.prepare(
              `UPDATE travel_memos
               SET title = ?, content = ?, icon = ?, order_index = ?, updated_at = datetime('now')
               WHERE id = ?`
            ).bind(
              memo.title,
              memo.content || null,
              memo.icon || null,
              idx,
              existing.id
            ).run();
          } else {
            await context.env.DB.prepare(
              `INSERT INTO travel_memos (plan_id, category, title, content, icon, order_index)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
              planId,
              memo.category,
              memo.title,
              memo.content || null,
              memo.icon || null,
              idx
            ).run();
          }
          appliedCount++;
          idx++;
        } catch (e) {
          console.error('Failed to upsert memo:', memo, e);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      count: appliedCount 
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
