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

// DELETE /api/reviews/:id - Delete a review
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const reviewId = parseInt(context.params.id as string);

  if (isNaN(reviewId)) {
    return errorResponse('Invalid review ID');
  }

  try {
    const { success } = await context.env.DB.prepare('DELETE FROM reviews WHERE id = ?')
      .bind(reviewId)
      .run();

    if (!success) {
      return errorResponse('Failed to delete review', 500);
    }

    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Failed to delete review:', error);
    return errorResponse('Failed to delete review', 500);
  }
};
