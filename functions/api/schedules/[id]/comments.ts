import { Env, Comment, CreateCommentRequest, jsonResponse, errorResponse } from '../../../types';

// Handle CORS preflight requests
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

// GET /api/schedules/:id/comments - Get all comments for a schedule
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const scheduleId = parseInt(context.params.id as string);

  if (isNaN(scheduleId)) {
    return errorResponse('Invalid schedule ID');
  }

  try {
    const { results } = await context.env.DB.prepare(
      'SELECT * FROM comments WHERE schedule_id = ? ORDER BY created_at DESC'
    )
      .bind(scheduleId)
      .all<Comment>();

    return jsonResponse({ comments: results || [] });
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return errorResponse('Failed to fetch comments', 500);
  }
};

// POST /api/schedules/:id/comments - Create a new comment
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const scheduleId = parseInt(context.params.id as string);

  if (isNaN(scheduleId)) {
    return errorResponse('Invalid schedule ID');
  }

  const body = await context.request.json<CreateCommentRequest>();

  if (!body.content || body.content.trim() === '') {
    return errorResponse('Comment content is required');
  }

  const authorName = body.author_name && body.author_name.trim() !== ''
    ? body.author_name.trim()
    : '익명';

  try {
    // Insert the new comment
    const { success } = await context.env.DB.prepare(
      'INSERT INTO comments (schedule_id, author_name, content) VALUES (?, ?, ?)'
    )
      .bind(scheduleId, authorName, body.content)
      .run();

    if (!success) {
      return errorResponse('Failed to create comment', 500);
    }

    // Fetch the newly created comment
    const { results } = await context.env.DB.prepare(
      'SELECT * FROM comments WHERE schedule_id = ? ORDER BY created_at DESC LIMIT 1'
    )
      .bind(scheduleId)
      .all<Comment>();

    const newComment = results?.[0];

    if (!newComment) {
      return errorResponse('Failed to retrieve created comment', 500);
    }

    return jsonResponse({ comment: newComment }, 201);
  } catch (error) {
    console.error('Failed to create comment:', error);
    return errorResponse('Failed to create comment', 500);
  }
};
