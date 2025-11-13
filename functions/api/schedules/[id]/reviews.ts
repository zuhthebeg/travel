import { Env, Review, CreateReviewRequest, jsonResponse, errorResponse } from '../../../types';

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

// GET /api/schedules/:id/reviews - Get all reviews for a schedule with stats
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const scheduleId = parseInt(context.params.id as string);

  if (isNaN(scheduleId)) {
    return errorResponse('Invalid schedule ID');
  }

  try {
    // Get all reviews
    const { results } = await context.env.DB.prepare(
      'SELECT * FROM reviews WHERE schedule_id = ? ORDER BY created_at DESC'
    )
      .bind(scheduleId)
      .all<Review>();

    const reviews = results || [];

    // Calculate average rating and count
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
      : 0;

    return jsonResponse({
      reviews,
      stats: {
        totalReviews,
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      },
    });
  } catch (error) {
    console.error('Failed to fetch reviews:', error);
    return errorResponse('Failed to fetch reviews', 500);
  }
};

// POST /api/schedules/:id/reviews - Create a new review
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const scheduleId = parseInt(context.params.id as string);

  if (isNaN(scheduleId)) {
    return errorResponse('Invalid schedule ID');
  }

  const body = await context.request.json<CreateReviewRequest>();

  // Validation
  if (!body.image_data || body.image_data.trim() === '') {
    return errorResponse('Image is required for review');
  }

  if (!body.rating || body.rating < 1 || body.rating > 5) {
    return errorResponse('Rating must be between 1 and 5');
  }

  // Validate base64 image format
  if (!body.image_data.startsWith('data:image/')) {
    return errorResponse('Invalid image format. Must be a base64 data URL');
  }

  const authorName = body.author_name && body.author_name.trim() !== ''
    ? body.author_name.trim()
    : '익명';

  const reviewText = body.review_text?.trim() || null;

  try {
    // Insert the new review
    const { success } = await context.env.DB.prepare(
      'INSERT INTO reviews (schedule_id, author_name, rating, review_text, image_data) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(scheduleId, authorName, body.rating, reviewText, body.image_data)
      .run();

    if (!success) {
      return errorResponse('Failed to create review', 500);
    }

    // Fetch the newly created review
    const { results } = await context.env.DB.prepare(
      'SELECT * FROM reviews WHERE schedule_id = ? ORDER BY created_at DESC LIMIT 1'
    )
      .bind(scheduleId)
      .all<Review>();

    const newReview = results?.[0];

    if (!newReview) {
      return errorResponse('Failed to retrieve created review', 500);
    }

    return jsonResponse({ review: newReview }, 201);
  } catch (error) {
    console.error('Failed to create review:', error);
    return errorResponse('Failed to create review', 500);
  }
};
