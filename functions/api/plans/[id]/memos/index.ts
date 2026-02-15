/**
 * Travel Memos API
 * GET /api/plans/:id/memos - List all memos
 * POST /api/plans/:id/memos - Create memo
 */

interface Env {
  DB: D1Database;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

// GET - List memos
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const planId = context.params.id;

  try {
    const result = await context.env.DB.prepare(
      `SELECT * FROM travel_memos WHERE plan_id = ? ORDER BY order_index, created_at`
    ).bind(planId).all();

    return new Response(JSON.stringify({ memos: result.results }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    console.error('Failed to fetch memos:', e);
    return new Response(JSON.stringify({ error: 'Failed to fetch memos' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

// POST - Create memo
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const planId = context.params.id;
  const { category, title, content, icon } = await context.request.json<{
    category: string;
    title: string;
    content?: string;
    icon?: string;
  }>();

  if (!category || !title) {
    return new Response(JSON.stringify({ error: 'Category and title required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const result = await context.env.DB.prepare(
      `INSERT INTO travel_memos (plan_id, category, title, content, icon, order_index)
       VALUES (?, ?, ?, ?, ?, 0)`
    ).bind(planId, category, title, content || null, icon || null).run();

    return new Response(JSON.stringify({ 
      success: true, 
      id: result.meta?.last_row_id 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    console.error('Failed to create memo:', e);
    return new Response(JSON.stringify({ error: 'Failed to create memo' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};
