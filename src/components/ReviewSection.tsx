import { useState, useEffect, useRef } from 'react';
import type { Review, ReviewStats } from '../store/types';
import { reviewsAPI } from '../lib/api';
import { compressImage, validateImageFile } from '../lib/imageUtils';

interface ReviewSectionProps {
  scheduleId: number;
}

export default function ReviewSection({ scheduleId }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ totalReviews: 0, averageRating: 0 });
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  // Form state
  const [authorName, setAuthorName] = useState<string>('');
  const [rating, setRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load reviews on mount
  useEffect(() => {
    loadReviews();
    const savedName = localStorage.getItem('review_author_name');
    if (savedName) {
      setAuthorName(savedName);
    }
  }, [scheduleId]);

  const loadReviews = async () => {
    setIsLoadingReviews(true);
    try {
      const data = await reviewsAPI.getByScheduleId(scheduleId);
      setReviews(data.reviews);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load reviews:', error);
    } finally {
      setIsLoadingReviews(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image
    const validation = validateImageFile(file, 10);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid image');
      return;
    }

    setImageFile(file);
    setErrorMessage('');

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    // Validation
    if (!imageFile) {
      setErrorMessage('사진을 업로드해주세요');
      return;
    }

    if (rating < 1 || rating > 5) {
      setErrorMessage('평점을 선택해주세요');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // Compress image to WebP
      const compressedImage = await compressImage(imageFile, 800, 0.8);

      // Submit review
      const newReview = await reviewsAPI.create({
        scheduleId,
        author_name: authorName.trim() || undefined,
        rating,
        review_text: reviewText.trim() || undefined,
        image_data: compressedImage,
      });

      // Add to list and update stats
      setReviews([newReview, ...reviews]);
      setStats({
        totalReviews: stats.totalReviews + 1,
        averageRating: ((stats.averageRating * stats.totalReviews) + rating) / (stats.totalReviews + 1),
      });

      // Reset form
      setRating(5);
      setReviewText('');
      setImageFile(null);
      setImagePreview('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Save author name
      if (authorName.trim()) {
        localStorage.setItem('review_author_name', authorName.trim());
      }
    } catch (error: any) {
      console.error('Failed to submit review:', error);
      setErrorMessage(error.message || '리뷰 작성에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReview = async (reviewId: number) => {
    if (!confirm('정말 이 리뷰를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await reviewsAPI.delete(reviewId);

      // Remove from list and update stats
      const deletedReview = reviews.find(r => r.id === reviewId);
      const updatedReviews = reviews.filter(r => r.id !== reviewId);
      setReviews(updatedReviews);

      if (deletedReview && stats.totalReviews > 1) {
        const newTotal = stats.totalReviews - 1;
        const newAverage = ((stats.averageRating * stats.totalReviews) - deletedReview.rating) / newTotal;
        setStats({
          totalReviews: newTotal,
          averageRating: newAverage,
        });
      } else {
        setStats({ totalReviews: 0, averageRating: 0 });
      }
    } catch (error) {
      console.error('Failed to delete review:', error);
      alert('리뷰 삭제에 실패했습니다');
    }
  };

  return (
    <div className="space-y-6">
      {/* Average Rating Display */}
      {stats.totalReviews > 0 && (
        <div className="bg-base-200 p-4 rounded-lg text-center">
          <div className="text-3xl font-bold text-warning">
            ⭐ {stats.averageRating.toFixed(1)}
          </div>
          <div className="text-sm text-base-content/70 mt-1">
            {stats.totalReviews}개의 리뷰
          </div>
        </div>
      )}

      {/* Review Submission Form */}
      <div className="bg-base-100 p-4 rounded-lg border border-base-300">
        <h3 className="font-semibold mb-3">리뷰 작성</h3>

        {/* Image Upload */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            사진 <span className="text-error">*</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="file-input file-input-bordered w-full"
          />
          {imagePreview && (
            <div className="mt-2">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-48 rounded-lg object-cover"
              />
            </div>
          )}
        </div>

        {/* Rating */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            평점 <span className="text-error">*</span>
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className={`text-3xl transition-all ${
                  star <= rating ? 'text-warning' : 'text-base-300'
                }`}
              >
                ⭐
              </button>
            ))}
          </div>
        </div>

        {/* Author Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">작성자</label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="익명"
            className="input input-bordered w-full"
          />
        </div>

        {/* Review Text */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">리뷰 내용 (선택)</label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="여행지에 대한 후기를 남겨주세요..."
            className="textarea textarea-bordered w-full h-24"
            maxLength={500}
          />
          <div className="text-xs text-base-content/60 mt-1">
            {reviewText.length}/500
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="alert alert-error mb-4">
            <span className="text-sm">{errorMessage}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !imageFile}
          className="btn btn-primary w-full"
        >
          {isSubmitting ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              작성 중...
            </>
          ) : (
            '리뷰 작성'
          )}
        </button>
      </div>

      {/* Reviews List */}
      <div>
        <h3 className="font-semibold mb-3">리뷰 목록</h3>

        {isLoadingReviews ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-8 text-base-content/60">
            <p>아직 리뷰가 없습니다</p>
            <p className="text-sm mt-1">첫 번째 리뷰를 작성해보세요!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="bg-base-200 p-4 rounded-lg">
                {/* Review Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{review.author_name}</span>
                      <span className="text-warning">
                        {'⭐'.repeat(review.rating)}
                      </span>
                    </div>
                    <span className="text-xs text-base-content/60">
                      {new Date(review.created_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteReview(review.id)}
                    className="btn btn-ghost btn-xs text-error"
                  >
                    삭제
                  </button>
                </div>

                {/* Review Image */}
                {review.image_data && (
                  <div className="mb-2">
                    <img
                      src={review.image_data}
                      alt="Review"
                      className="max-h-64 rounded-lg object-cover w-full"
                    />
                  </div>
                )}

                {/* Review Text */}
                {review.review_text && (
                  <p className="text-sm whitespace-pre-wrap mt-2">{review.review_text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
