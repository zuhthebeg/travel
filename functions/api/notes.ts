// Trip Notes API
// GET /api/notes?plan_id=X - 메모 목록 조회
// POST /api/notes - 메모 추가
// PUT /api/notes - 메모 수정
// DELETE /api/notes?id=X - 메모 삭제

interface Env {
  DB: D1Database;
}

interface TripNote {
  id: number;
  plan_id: number;
  category: string;
  content: string;
  is_checklist: number;
  checked: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type NoteCategory = 'reservation' | 'budget' | 'packing' | 'safety' | 'contact' | 'memo';

const VALID_CATEGORIES: NoteCategory[] = ['reservation', 'budget', 'packing', 'safety', 'contact', 'memo'];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// 카테고리별 요약 생성
function buildSummary(notes: TripNote[]) {
  const summary: Record<string, { total: number; checked: number }> = {};
  
  for (const cat of VALID_CATEGORIES) {
    const categoryNotes = notes.filter(n => n.category === cat);
    const checklistNotes = categoryNotes.filter(n => n.is_checklist);
    summary[cat] = {
      total: categoryNotes.length,
      checked: checklistNotes.filter(n => n.checked).length,
    };
  }
  
  return summary;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const planId = url.searchParams.get('plan_id');
  
  if (!planId) {
    return errorResponse('plan_id is required');
  }
  
  try {
    const notes = await context.env.DB.prepare(
      `SELECT * FROM trip_notes 
       WHERE plan_id = ? 
       ORDER BY category, sort_order, created_at`
    ).bind(planId).all<TripNote>();
    
    const notesList = notes.results || [];
    const summary = buildSummary(notesList);
    
    // 카테고리별로 그룹화
    const grouped: Record<string, TripNote[]> = {};
    for (const cat of VALID_CATEGORIES) {
      grouped[cat] = notesList.filter(n => n.category === cat);
    }
    
    return jsonResponse({
      notes: notesList,
      grouped,
      summary,
    });
  } catch (e) {
    console.error('Get notes error:', e);
    return errorResponse('Failed to fetch notes', 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as {
      plan_id: number;
      category: NoteCategory;
      content: string;
      is_checklist?: boolean;
    };
    
    const { plan_id, category, content, is_checklist } = body;
    
    if (!plan_id || !category || !content) {
      return errorResponse('plan_id, category, and content are required');
    }
    
    if (!VALID_CATEGORIES.includes(category)) {
      return errorResponse(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    
    // 같은 카테고리의 마지막 sort_order 가져오기
    const lastOrder = await context.env.DB.prepare(
      `SELECT MAX(sort_order) as max_order FROM trip_notes WHERE plan_id = ? AND category = ?`
    ).bind(plan_id, category).first<{ max_order: number | null }>();
    
    const sortOrder = (lastOrder?.max_order ?? -1) + 1;
    
    const result = await context.env.DB.prepare(
      `INSERT INTO trip_notes (plan_id, category, content, is_checklist, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(plan_id, category, content, is_checklist ? 1 : 0, sortOrder).run();
    
    if (!result.success) {
      return errorResponse('Failed to create note', 500);
    }
    
    // 생성된 노트 반환
    const newNote = await context.env.DB.prepare(
      `SELECT * FROM trip_notes WHERE id = ?`
    ).bind(result.meta.last_row_id).first<TripNote>();
    
    return jsonResponse({ note: newNote }, 201);
  } catch (e) {
    console.error('Create note error:', e);
    return errorResponse('Failed to create note', 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as {
      id: number;
      content?: string;
      checked?: boolean;
      sort_order?: number;
    };
    
    const { id, content, checked, sort_order } = body;
    
    if (!id) {
      return errorResponse('id is required');
    }
    
    // 기존 노트 확인
    const existing = await context.env.DB.prepare(
      `SELECT * FROM trip_notes WHERE id = ?`
    ).bind(id).first<TripNote>();
    
    if (!existing) {
      return errorResponse('Note not found', 404);
    }
    
    // 업데이트할 필드만 변경
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: (string | number)[] = [];
    
    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }
    if (checked !== undefined) {
      updates.push('checked = ?');
      values.push(checked ? 1 : 0);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(sort_order);
    }
    
    values.push(id);
    
    const result = await context.env.DB.prepare(
      `UPDATE trip_notes SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();
    
    if (!result.success) {
      return errorResponse('Failed to update note', 500);
    }
    
    // 업데이트된 노트 반환
    const updatedNote = await context.env.DB.prepare(
      `SELECT * FROM trip_notes WHERE id = ?`
    ).bind(id).first<TripNote>();
    
    return jsonResponse({ note: updatedNote });
  } catch (e) {
    console.error('Update note error:', e);
    return errorResponse('Failed to update note', 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  
  if (!id) {
    return errorResponse('id is required');
  }
  
  try {
    const result = await context.env.DB.prepare(
      `DELETE FROM trip_notes WHERE id = ?`
    ).bind(id).run();
    
    if (!result.success) {
      return errorResponse('Failed to delete note', 500);
    }
    
    return jsonResponse({ success: true, deleted_id: Number(id) });
  } catch (e) {
    console.error('Delete note error:', e);
    return errorResponse('Failed to delete note', 500);
  }
};
