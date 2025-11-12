import { Env, errorResponse } from '../../types';

// Handle CORS preflight requests
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

// DELETE /api/comments/:id - Delete a comment
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const commentId = parseInt(context.params.id as string);

  if (isNaN(commentId)) {
    return errorResponse('Invalid comment ID');
  }

  try {
    const { success } = await context.env.DB.prepare('DELETE FROM comments WHERE id = ?')
      .bind(commentId)
      .run();

    if (!success) {
      return errorResponse('Failed to delete comment', 500);
    }

    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Failed to delete comment:', error);
    return errorResponse('Failed to delete comment', 500);
  }
};
