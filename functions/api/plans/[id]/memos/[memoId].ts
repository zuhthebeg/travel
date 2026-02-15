/**
 * Travel Memo API - Single item
 * GET /api/plans/:id/memos/:memoId
 * PUT /api/plans/:id/memos/:memoId
 * DELETE /api/plans/:id/memos/:memoId
 */

interface Env {
  DB: D1Database;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

// GET - Get single memo
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const memoId = context.params.memoId;

  try {
    const result = await context.env.DB.prepare(
      `SELECT * FROM travel_memos WHERE id = ?`
    ).bind(memoId).first();

    if (!result) {
      return new Response(JSON.stringify({ error: 'Memo not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    console.error('Failed to fetch memo:', e);
    return new Response(JSON.stringify({ error: 'Failed to fetch memo' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

// PUT - Update memo
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const memoId = context.params.memoId;
  const { category, title, content, icon } = await context.request.json<{
    category?: string;
    title?: string;
    content?: string;
    icon?: string;
  }>();

  try {
    const sets: string[] = [];
    const values: any[] = [];

    if (category !== undefined) { sets.push('category = ?'); values.push(category); }
    if (title !== undefined) { sets.push('title = ?'); values.push(title); }
    if (content !== undefined) { sets.push('content = ?'); values.push(content); }
    if (icon !== undefined) { sets.push('icon = ?'); values.push(icon); }
    
    sets.push('updated_at = CURRENT_TIMESTAMP');

    if (sets.length === 1) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    values.push(memoId);
    await context.env.DB.prepare(
      `UPDATE travel_memos SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    console.error('Failed to update memo:', e);
    return new Response(JSON.stringify({ error: 'Failed to update memo' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

// DELETE - Delete memo
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const memoId = context.params.memoId;

  try {
    await context.env.DB.prepare(
      `DELETE FROM travel_memos WHERE id = ?`
    ).bind(memoId).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    console.error('Failed to delete memo:', e);
    return new Response(JSON.stringify({ error: 'Failed to delete memo' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};
