// Day Notes API
// GET /api/day-notes?plan_id=X - 전체 일별 메모 조회
// GET /api/day-notes?plan_id=X&date=YYYY-MM-DD - 특정 날짜 메모
// PUT /api/day-notes - 메모 생성/수정 (upsert)
// DELETE /api/day-notes?plan_id=X&date=YYYY-MM-DD - 메모 삭제

interface Env {
  DB: D1Database;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const planId = url.searchParams.get('plan_id');
  const date = url.searchParams.get('date');

  if (!planId) {
    return jsonResponse({ error: 'plan_id is required' }, 400);
  }

  if (date) {
    const note = await env.DB.prepare(
      'SELECT * FROM day_notes WHERE plan_id = ? AND date = ?'
    ).bind(Number(planId), date).first();
    return jsonResponse({ note: note || null });
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM day_notes WHERE plan_id = ? ORDER BY date'
  ).bind(Number(planId)).all();

  return jsonResponse({ notes: results || [] });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json() as any;
  const { plan_id, date, content } = body;

  if (!plan_id || !date) {
    return jsonResponse({ error: 'plan_id and date are required' }, 400);
  }

  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO day_notes (plan_id, date, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(plan_id, date) DO UPDATE SET content = ?, updated_at = ?`
  ).bind(Number(plan_id), date, content || '', now, now, content || '', now).run();

  const note = await env.DB.prepare(
    'SELECT * FROM day_notes WHERE plan_id = ? AND date = ?'
  ).bind(Number(plan_id), date).first();

  return jsonResponse({ note });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const planId = url.searchParams.get('plan_id');
  const date = url.searchParams.get('date');

  if (!planId || !date) {
    return jsonResponse({ error: 'plan_id and date are required' }, 400);
  }

  await env.DB.prepare(
    'DELETE FROM day_notes WHERE plan_id = ? AND date = ?'
  ).bind(Number(planId), date).run();

  return jsonResponse({ success: true });
};
