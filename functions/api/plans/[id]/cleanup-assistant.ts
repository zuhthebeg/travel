import { getRequestUser, checkPlanAccess } from '../../../lib/auth';

interface Env {
  DB: D1Database;
}

type Suggestion = {
  id: string;
  table: 'schedules' | 'travel_memos' | 'day_notes';
  rowId: number;
  field: string;
  before: string;
  after: string;
  reason: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizeText(input: string, field: string): { text: string; reason?: string } {
  let out = input;
  const reasons: string[] = [];

  const trimmed = out.trim();
  if (trimmed !== out) {
    out = trimmed;
    reasons.push('앞뒤 공백 정리');
  }

  const collapsed = out.replace(/[ \t]{2,}/g, ' ');
  if (collapsed !== out) {
    out = collapsed;
    reasons.push('중복 공백 정리');
  }

  const replacements: Array<[RegExp, string, string]> = [
    [/츄 공항/g, 'SFO 공항', '표현 통일'],
    [/마蹄\s*Bend/g, 'Horseshoe Bend', '깨진 텍스트 보정'],
    [/골든게이트우버/g, '골든게이트 우버', '띄어쓰기 보정'],
    [/엠배시 스위트/g, 'Embassy Suites by Hilton Milpitas Silicon Valley', '숙소명 통일'],
  ];

  for (const [pattern, repl, reason] of replacements) {
    const next = out.replace(pattern, repl);
    if (next !== out) {
      out = next;
      reasons.push(reason);
    }
  }

  // field-specific tiny cleanup
  if (field === 'memo') {
    const n = out.replace(/\s+\./g, '.');
    if (n !== out) {
      out = n;
      reasons.push('문장부호 앞 공백 정리');
    }
  }

  return { text: out, reason: reasons.length ? reasons.join(', ') : undefined };
}

async function buildSuggestions(env: Env, planId: number): Promise<Suggestion[]> {
  const suggestions: Suggestion[] = [];

  const schedules = await env.DB.prepare('SELECT id, title, place, memo FROM schedules WHERE plan_id = ?').bind(planId).all();
  for (const row of (schedules.results || []) as any[]) {
    for (const field of ['title', 'place', 'memo']) {
      const before = row[field];
      if (typeof before !== 'string' || !before) continue;
      const { text: after, reason } = normalizeText(before, field);
      if (after !== before) {
        suggestions.push({
          id: `schedules:${row.id}:${field}`,
          table: 'schedules',
          rowId: row.id,
          field,
          before,
          after,
          reason: reason || '텍스트 정리',
        });
      }
    }
  }

  const memos = await env.DB.prepare('SELECT id, title, content FROM travel_memos WHERE plan_id = ?').bind(planId).all();
  for (const row of (memos.results || []) as any[]) {
    for (const field of ['title', 'content']) {
      const before = row[field];
      if (typeof before !== 'string' || !before) continue;
      const { text: after, reason } = normalizeText(before, field);
      if (after !== before) {
        suggestions.push({
          id: `travel_memos:${row.id}:${field}`,
          table: 'travel_memos',
          rowId: row.id,
          field,
          before,
          after,
          reason: reason || '텍스트 정리',
        });
      }
    }
  }

  const dayNotes = await env.DB.prepare('SELECT id, content FROM day_notes WHERE plan_id = ?').bind(planId).all();
  for (const row of (dayNotes.results || []) as any[]) {
    const before = row.content;
    if (typeof before !== 'string' || !before) continue;
    const { text: after, reason } = normalizeText(before, 'content');
    if (after !== before) {
      suggestions.push({
        id: `day_notes:${row.id}:content`,
        table: 'day_notes',
        rowId: row.id,
        field: 'content',
        before,
        after,
        reason: reason || '텍스트 정리',
      });
    }
  }

  return suggestions;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  try {
    const planId = Number(params.id);
    if (!planId) return json({ error: 'invalid plan id' }, 400);

    const { results: plans } = await env.DB.prepare('SELECT id, user_id, visibility FROM plans WHERE id = ?').bind(planId).all();
    if (!plans.length) return json({ error: 'plan not found' }, 404);
    const plan = plans[0] as any;

    const user = await getRequestUser(request, env.DB);
    const access = await checkPlanAccess(env.DB, planId, user?.id ?? null);
    if (!access) return json({ error: 'forbidden' }, 403);

    const body = await request.json<any>().catch(() => ({}));
    const action = body?.action || 'preview';

    const suggestions = await buildSuggestions(env, planId);

    if (action === 'preview') {
      return json({ suggestions, count: suggestions.length });
    }

    // apply requires owner
    if (!user || user.id !== plan.user_id) {
      return json({ error: 'owner only' }, 403);
    }

    const selectedIds: string[] = Array.isArray(body?.selectedIds) ? body.selectedIds : [];
    const target = selectedIds.length ? suggestions.filter(s => selectedIds.includes(s.id)) : suggestions;

    let applied = 0;
    for (const s of target) {
      if (!['title', 'place', 'memo', 'content'].includes(s.field)) continue;
      await env.DB.prepare(`UPDATE ${s.table} SET ${s.field} = ? WHERE id = ?`).bind(s.after, s.rowId).run();
      applied++;
    }

    return json({ success: true, applied, total: target.length });
  } catch (e) {
    console.error('cleanup-assistant error', e);
    return json({ error: 'internal error' }, 500);
  }
};
